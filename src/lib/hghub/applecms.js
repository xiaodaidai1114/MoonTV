/* eslint-disable */
/**
 * HGhub 插件 → 苹果CMS(v10) vod 协议 适配。
 *
 * MoonTV 的「源」只认苹果CMS：搜索走 ?ac=videolist&wd=xxx，详情走 ?ac=videolist&ids=xxx，
 * 播放地址必须是 http(s) 且以 .m3u8 结尾。这里把 HPP 插件的返回值翻译成同一套结构。
 */

const { callPlugin } = require('./registry');
const { sign } = require('./token');

const SEARCH_PAGE_SIZE = 30;
const MAX_EPISODE_PAGES = 12;
const MAX_EPISODES = 500;

const baseUrl = (request) => {
  const configured = process.env.HGHUB_BASE;
  if (configured) return configured.replace(/\/+$/, '');
  const headers = request?.headers;
  const host = headers?.get?.('x-forwarded-host') || headers?.get?.('host') || '127.0.0.1:3000';
  const proto = headers?.get?.('x-forwarded-proto') || 'http';
  return `${proto}://${host}`;
};

const coverUrl = (base, pluginId, cover) => {
  if (!cover) return '';
  if (typeof cover === 'string') return cover;
  if (!cover.url) return '';
  if (!cover.headers && !cover.transform) return cover.url;
  const token = sign({ p: pluginId, u: cover.url, h: cover.headers || null, t: cover.transform || null });
  return `${base}/api/hghub/cover/${token}`;
};

const playUrl = (base, pluginId, mediaId, playlistId, episodeId) => {
  const token = sign({ p: pluginId, m: mediaId, pl: playlistId, e: episodeId });
  return `${base}/api/hghub/play/${token}.m3u8`;
};

const textOf = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') return value.text || value.name || value.title || '';
  return String(value);
};

const yearOf = (item) => {
  const raw = item?.year ?? item?.releaseDate ?? item?.publishedAt;
  if (!raw) return '';
  const match = String(raw).match(/\d{4}/);
  return match ? match[0] : '';
};

const remarksOf = (item) => {
  const parts = [];
  if (item?.remark) parts.push(textOf(item.remark));
  if (!parts.length && item?.episodeCount) parts.push(`共 ${item.episodeCount} 集`);
  if (item?.score) parts.push(`评分 ${item.score}`);
  return parts.join(' ');
};

const typeNameOf = (item) => {
  const map = {
    movie: '电影',
    series: '电视剧',
    anime: '动漫',
    variety: '综艺',
    short: '短剧',
    other: '其他',
  };
  const tag = Array.isArray(item?.tags) && item.tags.length ? textOf(item.tags[0]) : '';
  const kind = map[item?.type] || '';
  return [kind, tag].filter(Boolean).join(' · ') || '影视';
};

const episodesOf = async (pluginId, detail) => {
  const playlists = Array.isArray(detail?.playlists) ? detail.playlists : [];
  const result = [];
  for (const playlist of playlists) {
    let episodes = Array.isArray(playlist?.episodes) ? [...playlist.episodes] : [];
    let cursor = playlist?.next;
    let guard = 0;
    while (cursor && guard < MAX_EPISODE_PAGES && episodes.length < MAX_EPISODES) {
      guard += 1;
      const page = await callPlugin(pluginId, 'media.listEpisodes', {
        mediaId: detail.id,
        playlistId: playlist.id,
        cursor,
        limit: 100,
      });
      const items = Array.isArray(page?.items) ? page.items : [];
      episodes = episodes.concat(items);
      cursor = page?.next;
      if (!items.length) break;
    }
    result.push({
      id: String(playlist?.id || detail.id),
      label: textOf(playlist?.label) || '线路',
      episodes,
    });
  }
  return result;
};

const buildPlayUrlString = (base, pluginId, mediaId, playlists) => {
  const sources = [];
  const labels = [];
  for (const [index, playlist] of playlists.entries()) {
    const entries = [];
    let position = 0;
    for (const episode of playlist.episodes) {
      position += 1;
      const episodeId = episode?.id;
      if (episodeId === undefined || episodeId === null) continue;
      const title =
        textOf(episode?.label) || (episode?.index ? `第 ${episode.index} 集` : `第 ${position} 集`);
      const safeTitle = title.replace(/[$#]/g, ' ');
      entries.push(`${safeTitle}$${playUrl(base, pluginId, mediaId, playlist.id, episodeId)}`);
    }
    if (!entries.length) continue;
    sources.push(entries.join('#'));
    labels.push(playlist.label || `线路${index + 1}`);
  }
  return { playUrl: sources.join('$$$'), playFrom: labels.join('$$$') };
};

/* --------------------------------- 搜索 --------------------------------- */

const searchVod = async (pluginId, { wd, pg }) => {
  const keyword = String(wd || '').trim();
  if (!keyword) {
    return { code: 1, page: 1, pagecount: 0, limit: String(SEARCH_PAGE_SIZE), total: 0, list: [] };
  }
  const page = Math.max(1, Number(pg) || 1);
  let cursor = null;
  let result = null;
  // 插件是游标分页，苹果CMS 是页码分页：按页号顺序翻过去。
  for (let index = 1; index <= page; index += 1) {
    result = await callPlugin(pluginId, 'search.search', {
      query: keyword,
      cursor: cursor || undefined,
      limit: SEARCH_PAGE_SIZE,
    });
    cursor = result?.next || null;
    if (!cursor) break;
  }
  const base = baseUrl();
  const items = Array.isArray(result?.items) ? result.items : [];
  const list = items.map((item) => ({
    vod_id: String(item.id),
    vod_name: textOf(item.title) || '未命名',
    vod_pic: coverUrl(base, pluginId, item.cover),
    vod_remarks: remarksOf(item),
    vod_year: yearOf(item),
    vod_class: typeNameOf(item),
    type_name: typeNameOf(item),
    vod_content: textOf(item.description),
  }));
  return {
    code: 1,
    page,
    pagecount: result?.next ? page + 1 : page,
    limit: String(SEARCH_PAGE_SIZE),
    total: list.length,
    list,
  };
};

/* --------------------------------- 详情 --------------------------------- */

const detailVod = async (pluginId, { ids }) => {
  const mediaId = String(ids || '').trim();
  if (!mediaId) throw new Error('缺少 ids 参数');
  const base = baseUrl();
  const detail = await callPlugin(pluginId, 'media.getDetail', { id: mediaId });
  const playlists = await episodesOf(pluginId, detail);
  const { playUrl: playUrlString, playFrom } = buildPlayUrlString(
    base,
    pluginId,
    mediaId,
    playlists
  );
  return {
    code: 1,
    page: 1,
    pagecount: 1,
    total: 1,
    list: [
      {
        vod_id: mediaId,
        vod_name: textOf(detail?.title) || '未命名',
        vod_pic: coverUrl(base, pluginId, detail?.cover),
        vod_content: textOf(detail?.description),
        vod_year: yearOf(detail),
        vod_class: typeNameOf(detail),
        type_name: typeNameOf(detail),
        vod_remarks: remarksOf(detail),
        vod_play_from: playFrom,
        vod_play_url: playUrlString,
      },
    ],
  };
};

/* --------------------------------- 分类 --------------------------------- */

const categoryVod = async (pluginId, { t, pg }) => {
  const categoryId = String(t || '').trim();
  if (!categoryId) throw new Error('缺少分类参数');
  const page = Math.max(1, Number(pg) || 1);
  let cursor = null;
  let result = null;
  for (let index = 1; index <= page; index += 1) {
    result = await callPlugin(pluginId, 'catalog.list', {
      categoryId,
      cursor: cursor || undefined,
      limit: SEARCH_PAGE_SIZE,
    });
    cursor = result?.next || null;
    if (!cursor) break;
  }
  const base = baseUrl();
  const items = Array.isArray(result?.items) ? result.items : [];
  return {
    code: 1,
    page,
    pagecount: result?.next ? page + 1 : page,
    limit: String(SEARCH_PAGE_SIZE),
    total: items.length,
    list: items.map((item) => ({
      vod_id: String(item.id),
      vod_name: textOf(item.title) || '未命名',
      vod_pic: coverUrl(base, pluginId, item.cover),
      vod_remarks: remarksOf(item),
      vod_year: yearOf(item),
      vod_class: typeNameOf(item),
      type_name: typeNameOf(item),
      vod_content: textOf(item.description),
    })),
  };
};

const categoriesOf = async (pluginId) => {
  const list = await callPlugin(pluginId, 'catalog.getCategories', {});
  return { code: 1, class: (Array.isArray(list) ? list : []).map((item) => ({
    type_id: item.id,
    type_name: item.label,
  })) };
};

module.exports = { searchVod, detailVod, categoryVod, categoriesOf, baseUrl };
