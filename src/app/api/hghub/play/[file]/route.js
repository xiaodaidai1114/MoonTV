/* eslint-disable */
import hghubBase from '@/lib/hghub/applecms';
import tokenLib from '@/lib/hghub/token';
import streamLib from '@/lib/hghub/stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 分集播放入口：/api/hghub/play/<token>.m3u8
 * token 里签名了插件 id、媒体/线路/分集标识，避免变成开放代理。
 */
export async function GET(request, context) {
  const params = (await context?.params) || {};
  const raw = String(params.file || '');
  const token = raw.replace(/\.m3u8$/i, '');
  const payload = tokenLib.verify(token);
  if (!payload || !payload.m) {
    return new Response('无效的播放地址', { status: 400 });
  }

  const base = hghubBase.baseUrl(request);
  try {
    const stream = await streamLib.resolveStream(payload.p, payload);
    if (stream.format === 'hls') {
      const response = await streamLib.fetchWithHeaders(stream.url, stream.headers);
      if (!response.ok) {
        return new Response(`上游播放列表请求失败（HTTP ${response.status}）`, { status: 502 });
      }
      const text = await response.text();
      const rewritten = streamLib.rewritePlaylist(
        text,
        stream.url,
        payload.p,
        stream.headers,
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
    // 直链（mp4 等）也走代理，避免浏览器缺少 Referer 被拒
    const proxied = `${base}/api/hghub/seg/${streamLib.uriToken(
      payload.p,
      stream.url,
      stream.headers
    )}`;
    return new Response(null, {
      status: 302,
      headers: { location: proxied, ...streamLib.CORS_HEADERS },
    });
  } catch (error) {
    console.error('[hghub] 播放解析失败', payload.p, error?.code || '', error?.message || error);
    return new Response(`播放解析失败：${error?.message || '未知错误'}`, {
      status: 502,
      headers: streamLib.CORS_HEADERS,
    });
  }
}
