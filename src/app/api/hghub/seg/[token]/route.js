/* eslint-disable */
import hghubBase from '@/lib/hghub/applecms';
import streamLib from '@/lib/hghub/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** HLS 分片/密钥/子播放列表代理：/api/hghub/seg/<token> */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: streamLib.CORS_HEADERS });
}

const handle = async (request, context) => {
  const params = (await context?.params) || {};
  const payload = streamLib.parseSegToken(String(params.token || ''));
  if (!payload) return new Response('无效地址', { status: 400 });

  const base = hghubBase.baseUrl(request);
  const range = request.headers.get('range');
  const extraHeaders = range ? { range } : undefined;

  let upstream;
  try {
    upstream = await streamLib.fetchWithHeaders(payload.u, payload.h, extraHeaders);
  } catch (error) {
    return new Response(`上游请求失败：${error?.message || ''}`, {
      status: 502,
      headers: streamLib.CORS_HEADERS,
    });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return new Response(`上游返回 ${upstream.status}`, {
      status: upstream.status === 404 ? 404 : 502,
      headers: streamLib.CORS_HEADERS,
    });
  }

  const contentType = upstream.headers.get('content-type') || '';
  const isPlaylist =
    /mpegurl/i.test(contentType) || /\.m3u8($|\?)/i.test(payload.u);

  if (isPlaylist) {
    const text = await upstream.text();
    const rewritten = streamLib.rewritePlaylist(
      text,
      payload.u,
      payload.p,
      payload.h || {},
      base
    );
    return new Response(rewritten, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
        'cache-control': 'no-store',
        ...streamLib.CORS_HEADERS,
      },
    });
  }

  const headers = { ...streamLib.CORS_HEADERS };
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  if (!headers['cache-control']) headers['cache-control'] = 'public, max-age=3600';
  return new Response(upstream.body, { status: upstream.status, headers });
};

export const GET = handle;
export const HEAD = handle;
