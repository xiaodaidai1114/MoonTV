/* eslint-disable */
/**
 * 播放解析与 HLS 代理。
 *
 * HPP 插件的 resolvePlayback 返回的是上游直链（多数带 Referer/UA 限制），
 * 浏览器直接拉大概率被拒或被 CORS 挡住，所以这里统一由服务端带请求头转发：
 * 播放列表按行重写成经过本代理的地址，分片/密钥同样走代理。
 */

const { callPlugin } = require('./registry');
const { sign, verify } = require('./token');

const RESOLVE_TTL_MS = 5 * 60 * 1000;
const resolveCache = new Map();

const cacheKey = (pluginId, payload) =>
  `${pluginId}|${payload.m}|${payload.pl || ''}|${payload.e}`;

const resolveStream = async (pluginId, payload) => {
  const key = cacheKey(pluginId, payload);
  const hit = resolveCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.stream;

  const playback = await callPlugin(pluginId, 'media.resolvePlayback', {
    mediaId: payload.m,
    playlistId: payload.pl,
    episodeId: payload.e,
    codecs: ['h264', 'hevc'],
  });
  const streams = Array.isArray(playback?.streams) ? playback.streams : [];
  if (!streams.length) {
    throw Object.assign(new Error('插件未返回可播放地址'), { code: 'NO_STREAM' });
  }
  const hls = streams.find((item) => item?.format === 'hls') || streams[0];
  const stream = {
    url: hls.url,
    format: hls.format || (/\.m3u8(\?|#|$)/i.test(hls.url) ? 'hls' : 'progressive'),
    headers: hls.headers || {},
  };
  const expiresAt =
    typeof playback?.expiresAt === 'number' ? playback.expiresAt : Date.now() + RESOLVE_TTL_MS;
  resolveCache.set(key, { stream, expiresAt: Math.min(expiresAt, Date.now() + RESOLVE_TTL_MS) });
  return stream;
};

const uriToken = (pluginId, url, headers) => sign({ p: pluginId, u: url, h: headers || null });

const rewritePlaylist = (text, playlistUrl, pluginId, headers, base) => {
  const wrap = (raw) => {
    const absolute = new URL(raw, playlistUrl).href;
    return `${base}/api/hghub/seg/${uriToken(pluginId, absolute, headers)}`;
  };
  const lines = String(text).split(/\r?\n/);
  const output = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${wrap(uri)}"`);
    }
    return wrap(trimmed);
  });
  return output.join('\n');
};

const fetchWithHeaders = async (url, headers, extra) => {
  const merged = {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    ...(headers || {}),
    ...(extra || {}),
  };
  return fetch(url, { headers: merged, redirect: 'follow' });
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,HEAD,OPTIONS',
  'access-control-expose-headers': '*',
};

const parseSegToken = (token) => {
  const payload = verify(token);
  if (!payload || !payload.u || !payload.p) return null;
  return payload;
};

module.exports = {
  resolveStream,
  rewritePlaylist,
  fetchWithHeaders,
  CORS_HEADERS,
  parseSegToken,
  uriToken,
};
