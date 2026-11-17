/** HGhub provider baseline. Standalone HPP module; manually import for local development. */
export const meta = {
  id: "huangguohub", name: "黄果 Hub", version: "0.0.1", protocol: 1,
  description: "旧 HGhub 数据源的独立插件基线。账号按站点线路保存。",
  mature: true,
  homepage: "https://huangguoai.com",
  linkDomains: ["huangguoai.com", "huangguoai.ai"],
  requires: [{ type: "api", name: "crypto.aesDecrypt" }, { type: "api", name: "html.parse" }],
  settings: [{ key: "codec", type: "select", label: "首选编码", default: "auto", options: [
    { value: "auto", label: "跟随播放器" }, { value: "h264", label: "H.264" }, { value: "hevc", label: "HEVC" },
  ] }],
};

export default function (hg) {
  const fixed = [
    { id: "primary", label: "固定线路 1", url: "https://huangguoai.com" },
    { id: "backup", label: "固定线路 2", url: "https://huangguoai.ai" },
  ];
  const publish = "https://huangguoai.pages.dev/";
  const categories = [
    { id: "ai-duanju", label: "AI成人短剧" }, { id: "ai-manju", label: "AI成人漫剧" },
    { id: "ai-huanlian", label: "AI换脸" }, { id: "ai-mogai", label: "AI魔改" },
  ];
  const rankings = [{ id: "hot", label: "热播榜" }, { id: "recommend", label: "推荐榜" }, { id: "potential", label: "潜力榜" }];
  const fail = (code, message) => { throw new hg.PluginError(code, message); };
  const origin = () => hg.endpoint.current?.url || fixed[0].url;
  const sessionKey = () => `session:${origin()}`;
  const headers = () => ({ Referer: `${origin()}/` });
  const absolute = raw => new URL(String(raw), `${origin()}/`).href;
  const image = raw => raw ? { url: absolute(raw), headers: headers(), transform: { type: "plugin", name: "cover" } } : undefined;
  const positive = raw => { const n = Number(raw); return Number.isSafeInteger(n) && n > 0 ? n : fail("INVALID_ARGUMENT", "条目标识无效"); };
  const date = raw => {
    if (!raw) return undefined;
    const n = typeof raw === "number" ? (raw < 1e12 ? raw * 1000 : raw) : Date.parse(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  function author(raw) {
    if (!raw || raw.id == null) return undefined;
    return { id: String(raw.id), name: String(raw.name || raw.nickname || raw.username || "用户"), avatar: image(raw.avatar), followers: raw.followers };
  }
  function media(raw) {
    const item = {
      id: String(raw.video_id ?? raw.id), title: String(raw.title || "未命名作品"), type: "short",
      cover: image(raw.cover), description: raw.description, tags: raw.tags,
      score: Number.isFinite(raw.score) ? raw.score : undefined,
      episodeCount: raw.episode_count, totalEpisodes: raw.total_episodes,
      status: raw.is_finished === undefined ? undefined : raw.is_finished ? "finished" : "ongoing",
      stats: raw.counts ? { favorites: raw.counts.collect, comments: raw.counts.comment, hot: raw.counts.hot, likes: raw.counts.like }
        : { favorites: raw.collect_count, comments: raw.comment_count, hot: raw.hot, likes: raw.like_count },
      author: author(raw.author), publishedAt: date(raw.created_at), updatedAt: date(raw.last_ep_at),
      badge: raw.is_original ? "原创" : undefined,
    };
    return item;
  }
  function pageParams(params) {
    let page = 1, size = Math.max(1, Math.min(100, Math.floor(params.limit || 20)));
    if (params.cursor) {
      let decoded; try { decoded = JSON.parse(params.cursor); } catch { fail("INVALID_ARGUMENT", "分页游标无效"); }
      if (!Number.isSafeInteger(decoded.page) || decoded.page < 1 || !Number.isSafeInteger(decoded.size) || decoded.size < 1 || decoded.size > 100) fail("INVALID_ARGUMENT", "分页游标无效");
      ({ page, size } = decoded);
    }
    return { page, size };
  }
  function paged(data, params, convert = media) {
    if (!data || !Array.isArray(data.items)) fail("UPSTREAM_CHANGED", "列表结构已变化");
    const p = pageParams(params), total = data.pagination?.total, pages = data.pagination?.pages;
    const more = Number.isFinite(pages) ? p.page < pages : Number.isFinite(total) ? p.page * p.size < total : data.items.length >= p.size;
    return { items: data.items.map(convert), next: more ? JSON.stringify({ page: p.page + 1, size: p.size }) : null, total };
  }
  function query(path, params) {
    const p = pageParams(params), q = new URLSearchParams({ page: String(p.page), size: String(p.size) });
    return `${path}${path.includes("?") ? "&" : "?"}${q}`;
  }
  async function edge(method, path, body, ctx, required = false) {
    const token = await hg.storage.get(sessionKey());
    if (required && !token) fail("AUTH_REQUIRED", "请先登录该插件账号");
    if ((token || path.startsWith("/api/account/")) && !fixed.some(e => e.url === origin())) fail("AUTH_REQUIRED", "账号操作请切换至固定线路");
    const envelope = { method, path, body: body === undefined ? "" : hg.codec.base64Encode(hg.codec.utf8Encode(JSON.stringify(body))), content_type: body === undefined ? "" : "application/json" };
    const r = await hg.http.fetch({ url: `${origin()}/api/edge/request`, method: "POST", headers: { ...headers(), Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: { json: envelope }, responseType: "json", credentials: "omit", redirect: "manual", signal: ctx.signal });
    if (r.status === 401 || r.status === 403) { if (token) await hg.storage.delete(sessionKey()); fail(token ? "AUTH_EXPIRED" : "AUTH_REQUIRED", "登录已失效，请重新登录"); }
    if (!r.ok) fail("UPSTREAM_ERROR", `上游返回 HTTP ${r.status}`);
    if (r.data?.status !== 1) fail(path.includes("ByPassword") ? "AUTH_INVALID" : "UPSTREAM_ERROR", String(r.data?.msg || "上游请求失败"));
    return r.data.data;
  }
  async function detail(id, ctx) {
    const data = await edge("GET", `/api/videos/${positive(id)}`, undefined, ctx);
    if (!Array.isArray(data?.episodes)) fail("UPSTREAM_CHANGED", "分集结构已变化");
    const episodes = data.episodes.map((e, index) => ({ id: String(e.ep_num), index: index + 1, season: 1, episodeNumber: e.ep_num, title: e.title, durationSec: e.duration }));
    return { ...media(data), playlists: [{ id: "main", label: "正片", kind: "main", episodes }],
      interaction: data.interaction ? { liked: data.interaction.liked, favorited: data.interaction.collected, likedEpisodeIds: data.interaction.liked_ep ? [String(data.interaction.liked_ep)] : undefined } : undefined };
  }
  async function rank(kind, ctx) {
    const data = await edge("GET", `/api/ranks/${kind}`, undefined, ctx);
    if (!Array.isArray(data?.items)) fail("UPSTREAM_CHANGED", "榜单结构已变化");
    return { items: data.items.map(media), next: null };
  }
  async function section(params, ctx) {
    if (params.sectionId === "latest") return paged(await edge("GET", query("/api/videos", params), undefined, ctx), params);
    if (rankings.some(r => r.id === params.sectionId)) return params.cursor ? { items: [], next: null } : rank(params.sectionId, ctx);
    if (!categories.some(c => c.id === params.sectionId)) fail("INVALID_ARGUMENT", "分区不存在");
    return paged(await edge("GET", query(`/api/videos/category/${params.sectionId}`, params), undefined, ctx), params);
  }
  function user(raw) {
    return { id: String(raw.id), name: String(raw.nickname || raw.username || "用户"), avatar: image(raw.avatar), description: raw.sign || raw.desc,
      stats: raw.counts ? Object.fromEntries(Object.entries(raw.counts).filter(([, v]) => typeof v === "number" && Number.isFinite(v))) : undefined };
  }
  function article(raw) {
    return { id: String(raw.id), title: String(raw.title || "未命名图文"), summary: raw.desc, cover: image(raw.cover), tags: raw.tags, author: author(raw.author), publishedAt: date(raw.created_at || raw.publish_time),
      stats: raw.counts ? { likes: raw.counts.like, comments: raw.counts.comment, favorites: raw.counts.collect, hot: raw.counts.hot } : { hot: raw.hot }, mediaId: raw.video_id ? String(raw.video_id) : undefined };
  }
  // Reply targets encode the parent context, so they survive runtime unloads.
  function comment(raw, target, depth = 0) {
    return { id: JSON.stringify({ target, id: String(raw.id) }), author: { id: String(raw.user_id), name: String(raw.nickname || "用户"), avatar: image(raw.avatar) },
      text: String(raw.text || ""), createdAt: date(raw.created_at), likes: raw.like_count, liked: raw.liked, replyCount: raw.reply_count,
      pinned: raw.is_pinned, region: raw.ip_region, replies: depth < 2 && Array.isArray(raw.reply_list) ? raw.reply_list.map(r => comment(r, target, depth + 1)) : undefined };
  }
  function commentContext(id) {
    let parsed; try { parsed = JSON.parse(id); } catch { fail("INVALID_ARGUMENT", "回复标识无效"); }
    if (!parsed?.target || !["media", "article"].includes(parsed.target.kind)) fail("INVALID_ARGUMENT", "回复目标无效");
    positive(parsed.id); return parsed;
  }
  function signature(bytes) {
    if (bytes[0] === 255 && bytes[1] === 216) return "image/jpeg";
    if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "image/png";
    if (bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 56) return "image/gif";
    if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
    return undefined;
  }
  return {
    endpoints: { async list({ refresh }, ctx) {
      const cached = await hg.storage.get("endpoint-mirrors") || [];
      if (!refresh) return [...fixed, ...cached];
      const html = await hg.http.fetch({ url: publish, responseType: "text", credentials: "omit", signal: ctx.signal });
      if (!html.ok) fail("UPSTREAM_ERROR", "地址发布页不可用");
      const script = hg.html.parse(html.data).select("script[src]").map(n => n.attr("src")).find(s => s.includes("publish.js")) || "publish.js";
      const js = await hg.http.fetch({ url: new URL(script, publish).href, responseType: "text", credentials: "omit", signal: ctx.signal });
      if (!js.ok) fail("UPSTREAM_ERROR", "线路列表不可用");
      const strings = name => {
        const body = new RegExp(`\\bvar\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(js.data)?.[1] || "";
        return [...body.replace(/\/\/[^\n\r]*/g, "").matchAll(/["']([^"']+)["']/g)].map(m => m[1]);
      };
      const domains = strings("urls"), subs = strings("subdomains"), urls = new Set(fixed.map(e => e.url)), mirrors = [];
      for (const domain of domains) for (const sub of subs.length ? subs : [""]) {
        let u; try { u = new URL(`https://${sub ? `${sub}.` : ""}${domain.replace(/\/+$/, "")}`); } catch { continue; }
        if (u.protocol !== "https:" || u.username || u.password || urls.has(u.origin)) continue;
        urls.add(u.origin); mirrors.push({ id: `mirror:${u.host}`, label: `镜像 ${mirrors.length + 1}`, url: u.origin });
        if (mirrors.length >= 60) break;
      }
      if (!mirrors.length) fail("UPSTREAM_CHANGED", "地址发布页未包含镜像线路");
      await hg.storage.set("endpoint-mirrors", mirrors.slice(0, 60)); return [...fixed, ...mirrors.slice(0, 60)];
    } },
    media: {
      getDetail: ({ id }, ctx) => detail(id, ctx),
      async resolvePlayback(params, ctx) {
        const id = positive(params.mediaId), ep = positive(params.episodeId);
        let data, primaryError;
        try { data = await edge("POST", `/api/videos/${id}/episodes/${ep}/playback`, {}, ctx); }
        catch (error) { if (["AUTH_REQUIRED", "AUTH_EXPIRED", "CANCELLED"].includes(error.code)) throw error; primaryError = error; }
        if (!(data?.streams?.main || data?.video_url)) {
          try { data = await edge("GET", `/api/videos/${id}/play?ep=${ep}&page_texts=0`, undefined, ctx); }
          catch (error) { throw primaryError || error; }
        }
        const main = data?.streams?.main || data?.video_url, hevc = data?.streams?.hevc || data?.video_url_hevc;
        if (!main && !hevc) fail("CONTENT_LOCKED", "上游没有返回可播放地址");
        const streams = [["h264", main], ["hevc", hevc]].filter(([, url]) => !!url).map(([codec, url]) => ({ url: absolute(url), format: /\.m3u8(?:[?#]|$)/i.test(url) ? "hls" : "progressive", codec, label: codec === "hevc" ? "HEVC" : "H.264", headers: headers() }));
        const preference = hg.settings.get("codec"), preferred = preference === "auto" ? params.codecs[0] : preference;
        streams.sort((a, b) => Number(b.codec === preferred) - Number(a.codec === preferred));
        return { streams, durationSec: data.duration };
      },
      matchUrl({ url }) {
        const u = new URL(url); if (![...fixed.map(e => new URL(e.url).host), new URL(origin()).host].includes(u.host)) return null;
        const id = /^\/(?:api\/)?videos?\/(\d+)(?:\/|$)/.exec(u.pathname)?.[1];
        if (!id) return null; return { mediaId: id, ...(u.searchParams.get("ep") ? { episodeId: String(positive(u.searchParams.get("ep"))) } : {}) };
      },
    },
    home: {
      async getSections(params, ctx) {
        if (params.cursor) return { items: [], next: null };
        const latest = await section({ ...params, sectionId: "latest" }, ctx);
        const ranked = await Promise.allSettled(rankings.map(async r => ({ id: r.id, title: r.label, layout: "row", items: (await rank(r.id, ctx)).items, more: true })));
        return { items: [{ id: "latest", title: "最新更新", layout: "grid", items: latest.items, more: true },
          ...ranked.filter(r => r.status === "fulfilled").map(r => r.value)], next: null };
      },
      listSection: section,
    },
    feed: { async list(params, ctx) { const result = await section({ ...params, sectionId: "latest" }, ctx); return { ...result, items: result.items.map(item => ({ ...item, entryEpisodeId: "1" })) }; } },
    catalog: {
      getCategories() { return [...categories, { id: "rankings", label: "排行榜", sorts: rankings }]; },
      async list(params, ctx) { return params.categoryId === "rankings" ? rank(rankings.some(r => r.id === params.sort) ? params.sort : "hot", ctx) : section({ ...params, sectionId: params.categoryId }, ctx); },
    },
    search: { async search(params, ctx) { return paged(await edge("GET", query(`/api/search?q=${encodeURIComponent(params.query)}`, params), undefined, ctx), params); } },
    auth: {
      getMethods() { return { methods: [{ id: "password", label: "账号密码登录", form: { title: "登录黄果账号", description: "账号按当前固定线路单独保存。", fields: [
        { key: "username", type: "text", label: "账号", required: true }, { key: "password", type: "password", label: "密码", required: true },
      ] } }], registerUrl: `${origin()}/` }; },
      async submit({ methodId, values }, ctx) {
        if (methodId !== "password") fail("UNSUPPORTED", "登录方式不存在");
        if (!values.username?.trim() || !values.password) fail("AUTH_INVALID", "请输入账号和密码");
        const data = await edge("POST", "/api/account/loginByPassword", { username: values.username.trim(), password: values.password }, ctx);
        if (!data?.token || !data.user?.id) fail("UPSTREAM_CHANGED", "登录返回缺少会话或用户资料");
        await hg.storage.set(sessionKey(), data.token); return { status: "ok", user: user(data.user) };
      },
      async getProfile(_, ctx) { if (!await hg.storage.get(sessionKey())) return null; return user(await edge("GET", "/api/account/me", undefined, ctx, true)); },
      async logout(_, ctx) { try { if (await hg.storage.get(sessionKey())) await edge("POST", "/api/account/logout", undefined, ctx, true); } finally { await hg.storage.delete(sessionKey()); } },
    },
    articles: {
      async list(params, ctx) { return paged(await edge("GET", query("/api/posts", params), undefined, ctx), params, article); },
      async getDetail({ id }, ctx) { const data = await edge("GET", `/api/posts/${positive(id)}`, undefined, ctx); return { ...article(data), contentHtml: data.content,
        streams: data.video_url ? [{ url: absolute(data.video_url), format: /\.m3u8(?:[?#]|$)/i.test(data.video_url) ? "hls" : "progressive", headers: headers() }] : undefined }; },
    },
    comments: {
      async list(params, ctx) {
        const target = params.target;
        if (target.kind === "replies") fail("UNSUPPORTED", "该上游暂不支持单独加载回复列表");
        const path = target.kind === "article" ? `/api/posts/${positive(target.articleId)}/comments` : `/api/videos/${positive(target.mediaId)}/comments?ep=${target.episodeId ? positive(target.episodeId) : 1}`;
        return paged(await edge("GET", query(path, params), undefined, ctx), params, raw => comment(raw, target));
      },
      async send({ target, text }, ctx) {
        if (!text.trim()) fail("INVALID_ARGUMENT", "请输入评论内容");
        const reply = target.kind === "replies" ? commentContext(target.commentId) : null, root = reply?.target || target;
        if (root.kind !== "media") fail("UNSUPPORTED", "该上游暂不支持发送图文评论");
        await edge("POST", `/api/videos/${positive(root.mediaId)}/comments${reply ? "" : `?ep=${root.episodeId ? positive(root.episodeId) : 1}`}`, { text, ...(reply ? { reply_id: positive(reply.id) } : {}) }, ctx, true);
      },
    },
    interact: {
      async like({ target, on }, ctx) { await edge(on ? "POST" : "DELETE", target.kind === "article" ? `/api/posts/${positive(target.articleId)}/like` : `/api/videos/${positive(target.mediaId)}/like?ep=${target.episodeId ? positive(target.episodeId) : 1}`, undefined, ctx, true); },
      async favorite({ target, on }, ctx) { await edge(on ? "POST" : "DELETE", target.kind === "article" ? `/api/posts/${positive(target.articleId)}/collect` : `/api/videos/${positive(target.mediaId)}/collect`, undefined, ctx, true); },
      async follow({ authorId, on }, ctx) { await edge(on ? "POST" : "DELETE", `/api/users/${positive(authorId)}/follow`, undefined, ctx, true); },
    },
    updates: { async check({ items }, ctx) {
      const results = [];
      for (let start = 0; start < items.length; start += 4) {
        const batch = await Promise.all(items.slice(start, start + 4).map(async item => {
          const next = await detail(item.mediaId, ctx);
          return (next.episodeCount || 0) > (item.episodeCount || 0) ? { mediaId: item.mediaId, episodeCount: next.episodeCount, updatedAt: next.updatedAt, latestLabel: `更新至 ${next.episodeCount} 集` } : null;
        }));
        results.push(...batch.filter(Boolean));
      }
      return results;
    } },
    transformResource({ name, kind, data }) {
      if (name !== "cover" || kind !== "image") fail("UNSUPPORTED", "字节变换不存在");
      let contentType = signature(data); if (contentType) return { data, contentType };
      const plain = hg.crypto.aesDecrypt({ mode: "cbc", key: hg.codec.utf8Encode("f5d965df75336270"), iv: hg.codec.utf8Encode("97b60394abc2fbe1"), padding: "none" }, data);
      const pad = plain[plain.length - 1];
      const output = pad > 0 && pad <= 16 && plain.slice(-pad).every(v => v === pad) ? plain.slice(0, -pad) : plain;
      contentType = signature(output); if (!contentType) fail("UPSTREAM_CHANGED", "封面格式或加密方式已变化");
      return { data: output, contentType };
    },
  };
}
