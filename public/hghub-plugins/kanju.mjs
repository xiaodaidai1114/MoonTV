// Local development plugin. API shapes verified against kanju.ai on 2026-11-15.
// Request signing is the public website's client protocol; no account tokens are embedded.
export const meta = {
  id: 'local.kanju', name: '看剧AI', version: '0.1.2', protocol: 1,
  description: '看剧AI 的公开片库、搜索、详情和播放；播放使用站点游客会话与正常额度。',
  homepage: 'https://kanju.ai/', author: 'Local development',
  timeouts: { read: 30, playback: 60 },
  requires: [{ type: 'api', name: 'crypto.hmac' }],
};

export default function (hg) {
  const base = 'https://kanju.ai';
  const episodeMemory = new Map();
  const hash = value => hg.codec.hexEncode(hg.crypto.digest('sha256', String(value)));
  const memoryKey = (mediaId, episodeId) => JSON.stringify([mediaId, episodeId]);
  function rememberEpisode(mediaId, episodeId, value, expires=Date.now()+3600000) {
    episodeMemory.set(memoryKey(mediaId,episodeId),{value,expires});
    while(episodeMemory.size>4000)episodeMemory.delete(episodeMemory.keys().next().value);
  }
  async function storedEpisode(mediaId,episodeId) {
    const cached=episodeMemory.get(memoryKey(mediaId,episodeId));
    if(cached?.expires>Date.now())return cached.value;
    const prefix='episode-pages:'+hash(mediaId)+':';
    for(const key of await hg.storage.keys(prefix)) {
      const page=await hg.storage.get(key);
      if(!page)continue;
      const found=page.episodes.find(row=>row[0]===episodeId);
      if(found){const value={token:found[1],mediaId,playlistId:page.playlistId};rememberEpisode(mediaId,episodeId,value,page.expiresAt||Date.now());return value;}
    }
    // Read old installations without rewriting all their persistent data.
    const legacy=await hg.storage.get('episode:'+episodeId);
    return legacy?.mediaId===mediaId?legacy:undefined;
  }
  const fail = message => { throw new hg.PluginError('UPSTREAM_CHANGED', message); };
  async function signing(ctx) {
    const saved = await hg.storage.get('signing');
    if (saved) return saved;
    const html = await hg.http.fetch({url:base+'/',signal:ctx.signal});
    const main = String(html.data).match(/src="([^" ]*\/assets\/main-[^" ]+\.js)"/);
    if (!main) fail('站点入口已变化，请更新插件');
    const mainUrl = new URL(main[1],base).href;
    const bundle = await hg.http.fetch({url:mainUrl,signal:ctx.signal});
    const asset = String(bundle.data).match(/\.\/movie-card-runtime-[\w-]+\.js/);
    if (!asset) fail('站点请求模块已变化，请更新插件');
    const runtime = await hg.http.fetch({url:new URL(asset[0],mainUrl).href,signal:ctx.signal});
    const key = String(runtime.data).match(/"x-ai-movie-signature",\w+="([a-f0-9]{64})"/);
    if (!key) fail('站点签名协议已变化，请更新插件');
    await hg.storage.set('signing',key[1],{ttlSec:3600});
    return key[1];
  }
  async function api(path,query,ctx,body,retried=false) {
    const url=new URL(path,base);
    for (const [key,value] of Object.entries(query||{})) if(value!==undefined&&value!==null&&value!=='') url.searchParams.set(key,String(value));
    const method=body===undefined?'GET':'POST', timestamp=String(Date.now()), nonce=hg.codec.hexEncode(hg.crypto.randomBytes(16));
    const key=await signing(ctx);
    const signature=hg.codec.hexEncode(hg.crypto.hmac('sha256',hg.codec.utf8Encode(key),hg.codec.utf8Encode([method,url.pathname+url.search,timestamp,nonce].join('\n'))));
    const response=await hg.http.fetch({url:url.href,method,body:body===undefined?undefined:{json:body},responseType:'json',signal:ctx.signal,
      headers:{Accept:'application/json','x-ai-movie-timestamp':timestamp,'x-ai-movie-nonce':nonce,'x-ai-movie-signature':signature}});
    if(!response.ok) {
      const code=response.data?.error?.code;
      if(code==='invalid_request_signature'&&!retried){await hg.storage.delete('signing');return api(path,query,ctx,body,true);}
      if(response.status===401) throw new hg.PluginError('AUTH_REQUIRED','站点需要有效会话，请重试播放');
      if(response.status===402||response.status===403) throw new hg.PluginError('CONTENT_LOCKED','该线路需要站点权限或剩余额度，请选择其他线路');
      if(response.status===404) throw new hg.PluginError('NOT_FOUND','站点未找到该内容');
      if(response.status===429) throw new hg.PluginError('RATE_LIMITED','站点请求过于频繁，请稍后重试');
      throw new hg.PluginError(code==='invalid_request_signature'?'UPSTREAM_CHANGED':'UPSTREAM_ERROR','站点请求失败（'+response.status+'）');
    }
    return response.data;
  }
  const item = row => ({id:row.id,title:row.title,type:({series:'series',movie:'movie',anime:'anime',variety:'variety',short_drama:'short'})[row.content_kind]||'other',
    cover:row.poster_url,backdrop:row.backdrop_url,year:row.year,description:row.description||row.synopsis,tags:row.genres,remark:row.remarks});
  async function browse(query,ctx) {
    const data=await api('/v1/browse/catalog',query,ctx);
    if(!Array.isArray(data.cards)) fail('站点片库结构已变化');
    return {items:data.cards.map(item),next:data.pagination?.has_more?(data.pagination.next_cursor||String(data.pagination.next_page)):null};
  }
  function paging(cursor,limit) {return {limit:Math.max(1,Math.min(48,limit||20)),...(cursor?(/^\d+$/.test(cursor)?{page:cursor}:{cursor}):{page:1})};}
  async function episodePage(mediaId,playlistId,cursor,limit,ctx) {
    const offset=cursor?Number(cursor):0;
    if(!Number.isSafeInteger(offset)||offset<0) throw new hg.PluginError('INVALID_ARGUMENT','分集游标无效');
    const data=await api('/v1/catalog/'+encodeURIComponent(playlistId||mediaId)+'/episodes',{limit:Math.min(limit||48,100),offset},ctx);
    if(!Array.isArray(data.episodes)) fail('站点分集结构已变化');
    const items=[],records=[];
    for(const [index,episode] of data.episodes.entries()) {
      if(!episode.id||!episode.token) continue;
      rememberEpisode(mediaId,episode.id,{token:episode.token,mediaId,playlistId:playlistId||mediaId});
      records.push([episode.id,episode.token]);
      items.push({id:episode.id,index:offset+index+1,label:episode.title||episode.display_name||('第 '+(offset+index+1)+' 集'),episodeNumber:episode.episode_number||undefined});
    }
    const prefix='episode-pages:'+hash(mediaId)+':'+hash(playlistId||mediaId)+':'+offset+':';
    let chunk=[],bytes=0,part=0;
    const flush=async()=>{if(chunk.length)await hg.storage.set(prefix+part++,{playlistId:playlistId||mediaId,episodes:chunk,expiresAt:Date.now()+3600000},{ttlSec:3600});chunk=[];bytes=0;};
    for(const record of records){const size=hg.codec.utf8Encode(JSON.stringify(record)).length;if(bytes+size>200000)await flush();chunk.push(record);bytes+=size;}
    await flush();
    return {items,next:data.episode_pagination?.has_more?String(offset+data.episode_pagination.returned_count):null};
  }
  async function guest(ctx) {
    let id=await hg.storage.get('guest-id');
    if(!id){id='web_'+hg.crypto.randomUUID();await hg.storage.set('guest-id',id);}
    await api('/v1/users/anonymous',null,ctx,{anonymous_id:id});
  }
  return {
    home:{
      async getSections({cursor},ctx){
        const data=await api('/v1/feed/home',{scope:'public',mode:'preview',sections:3,cards:10,cursor},ctx);
        if(!Array.isArray(data.sections))fail('站点首页结构已变化');
        const items=[];
        for(const section of data.sections){
          if(section.browse?.path==='/v1/browse/catalog') await hg.storage.set('section:'+section.id,section.browse.params||{},{ttlSec:3600});
          items.push({id:section.id,title:section.title,layout:'row',items:(section.cards||[]).map(item),more:section.browse?.path==='/v1/browse/catalog'});
        }
        return {items,next:data.next_cursor||null};
      },
      async listSection({sectionId,cursor,limit},ctx){
        let params=await hg.storage.get('section:'+sectionId);
        if(!params){await this.getSections({},ctx);params=await hg.storage.get('section:'+sectionId);}
        if(!params)throw new hg.PluginError('NOT_FOUND','分区已变化，请刷新推荐');
        return browse({...params,...paging(cursor,limit)},ctx);
      },
    },
    catalog:{
      async getCategories(_,ctx){const data=await api('/v1/runtime/bootstrap',null,ctx);return (data.catalog_ui?.channels||[]).filter(c=>['movie','series','anime','variety','short_drama'].includes(c.key)).map(c=>({id:c.key,label:c.label}));},
      list({categoryId,cursor,limit},ctx){return browse({kind:categoryId,...paging(cursor,limit)},ctx);},
    },
    search:{search({query,cursor,limit},ctx){return browse({q:query,query_mode:'fast_v3',search_fields:'all',...paging(cursor,limit)},ctx);}},
    media:{
      async getDetail({id},ctx){
        const detail=await api('/v1/catalog/'+encodeURIComponent(id)+'/detail',null,ctx);
        if(!detail.id||!detail.title)fail('站点详情结构已变化');
        const page=await episodePage(id,detail.selected_variant_id||id,null,48,ctx);
        return {...item(detail),description:detail.description||detail.synopsis,playlists:[{id:detail.selected_variant_id||id,label:detail.title,episodes:page.items,next:page.next}]};
      },
      listEpisodes({mediaId,playlistId,cursor,limit},ctx){return episodePage(mediaId,playlistId,cursor,limit,ctx);},
      async resolvePlayback({mediaId,playlistId,episodeId,serverId},ctx){
        let episode=await storedEpisode(mediaId,episodeId);
        if(!episode){let cursor=null;const visited=new Set();do{if(visited.has(cursor))break;visited.add(cursor);const page=await episodePage(mediaId,playlistId,cursor,100,ctx);episode=await storedEpisode(mediaId,episodeId);cursor=page.next;}while(!episode&&cursor);}
        if(!episode)throw new hg.PluginError('NOT_FOUND','分集已变化，请重新选集');
        let resolved;
        try{resolved=await api('/v1/playback/resolve/'+encodeURIComponent(episode.token),{view:'compact'},ctx);}catch(e){if(e.code!=='AUTH_REQUIRED')throw e;await guest(ctx);resolved=await api('/v1/playback/resolve/'+encodeURIComponent(episode.token),{view:'compact'},ctx);}
        if(!Array.isArray(resolved.line_options)||!resolved.line_options.length)fail('站点未返回可用线路');
        // Upstream playback IDs change per episode. Preferences must use a stable provider identity.
        const key=l=>l.provider_id?JSON.stringify([l.provider_id,l.resolve_mode||'',l.label||l.provider_name||'']):l.id;
        const seen=new Set();
        const lines=resolved.line_options.filter(l=>{const id=key(l);if(seen.has(id))return false;seen.add(id);return true;});
        const selected=lines.find(l=>key(l)===serverId)||(lines.find(l=>l.selected)||lines[0]);
        let line=selected;
        if(line.url_kind==='resolve_ticket'||line.url?.startsWith('resolve://')) {
          const ticket=line.url.slice('resolve://'.length);
          try{line=(await api('/v1/playback/resolve-line',{view:'compact'},ctx,{ticket})).line;}catch(e){if(e.code!=='AUTH_REQUIRED')throw e;await guest(ctx);line=(await api('/v1/playback/resolve-line',{view:'compact'},ctx,{ticket})).line;}
        }
        if(!line?.url||!/^https:\/\//.test(line.url))fail('站点播放地址结构已变化');
        // Some resolved CDN URLs have no extension and report url_kind=unknown.
        // Use the media MIME hint (e.g. mime_type=video_mp4), then bounded HEAD metadata.
        const url=new URL(line.url);
        const fromType=type=>{
          const value=String(type||'').toLowerCase().split(';')[0].trim().replace(/_/g,'/');
          if(['hls','m3u8','application/vnd.apple.mpegurl','application/x-mpegurl','audio/mpegurl','audio/x-mpegurl'].includes(value))return 'hls';
          if(['mp4','progressive','video/mp4','video/webm','video/ogg','audio/mp4','audio/mpeg'].includes(value))return 'progressive';
          return null;
        };
        let format=fromType(line.url_kind)||fromType(line.mime_type)||fromType(url.searchParams.get('mime_type'))
          ||(/\.m3u8$/i.test(url.pathname)?'hls':/\.(mp4|m4v|webm)$/i.test(url.pathname)?'progressive':null);
        if(!format && line.url_kind!=='external') {
          try {
            const probe=await hg.http.fetch({url:line.url,method:'HEAD',signal:ctx.signal,timeoutMs:8000,maxBytes:1024,credentials:'omit'});
            if(probe.ok)format=fromType(probe.headers['content-type']);
          } catch(e) { if(ctx.signal?.aborted)throw e; }
        }
        if(!format)hg.log.warn('Unrecognized playback type',{kind:line.url_kind,mode:line.resolve_mode});
        const expires=new URL(line.url).searchParams.get('x-expires');
        return {servers:lines.map(l=>({id:key(l),label:l.label||l.provider_name||l.id})),streams:[{url:line.url,...(format?{format}:{kind:'external'}),label:line.label,serverId:key(selected)}],...(expires&&Number.isFinite(Number(expires))?{expiresAt:Number(expires)*1000}:{})};
      },
    },
  };
}
