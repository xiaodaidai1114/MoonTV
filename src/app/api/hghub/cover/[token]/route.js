/* eslint-disable */
import tokenLib from '@/lib/hghub/token';
import streamLib from '@/lib/hghub/stream';
import registry from '@/lib/hghub/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 封面代理（部分插件需要 Referer 或由插件做解码变换）：/api/hghub/cover/<token> */
export async function GET(request, context) {
  const params = (await context?.params) || {};
  const payload = tokenLib.verify(String(params.token || ''));
  if (!payload || !payload.u) return new Response('无效地址', { status: 400 });

  try {
    const upstream = await streamLib.fetchWithHeaders(payload.u, payload.h);
    if (!upstream.ok) return new Response('封面获取失败', { status: 502 });
    let buffer = Buffer.from(await upstream.arrayBuffer());
    let contentType = upstream.headers.get('content-type') || 'image/jpeg';

    if (payload.t && payload.t.type === 'plugin' && payload.t.name) {
      const plugin = await registry.loadPlugin(payload.p);
      const transform = plugin?.instance?.transformResource;
      if (typeof transform === 'function') {
        const result = await transform.call(plugin.instance, {
          name: payload.t.name,
          kind: 'image',
          data: new Uint8Array(buffer),
        });
        if (result?.data) {
          buffer = Buffer.from(result.data);
          if (result.contentType) contentType = result.contentType;
        }
      }
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=86400',
        ...streamLib.CORS_HEADERS,
      },
    });
  } catch (error) {
    return new Response(`封面处理失败：${error?.message || ''}`, { status: 502 });
  }
}
