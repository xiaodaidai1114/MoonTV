/* eslint-disable */
import hghub from '@/lib/hghub/applecms';
import { listPlugins } from '@/lib/hghub/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 苹果CMS(v10) vod 兼容入口，供 MoonTV 当作一个「源」使用：
 *   /api/hghub/<插件id>?ac=videolist&wd=关键词&pg=1
 *   /api/hghub/<插件id>?ac=videolist&ids=<媒体id>
 *   /api/hghub/<插件id>?ac=list&t=<分类id>&pg=1
 */
export async function GET(request, context) {
  const params = (await context?.params) || {};
  const pluginId = String(params.plugin || '');
  const url = new URL(request.url);
  const ac = url.searchParams.get('ac') || 'videolist';

  try {
    if (pluginId === '_plugins') {
      return json({ code: 1, plugins: listPlugins() });
    }
    if (ac === 'list' && url.searchParams.get('t') && !url.searchParams.get('wd')) {
      return json(await hghub.categoryVod(pluginId, {
        t: url.searchParams.get('t'),
        pg: url.searchParams.get('pg'),
      }));
    }
    if (ac === 'class' || ac === 'categories') {
      return json(await hghub.categoriesOf(pluginId));
    }
    const ids = url.searchParams.get('ids');
    if (ids) return json(await hghub.detailVod(pluginId, { ids }));
    return json(
      await hghub.searchVod(pluginId, {
        wd: url.searchParams.get('wd') || url.searchParams.get('search') || '',
        pg: url.searchParams.get('pg'),
      })
    );
  } catch (error) {
    // 苹果CMS 约定：失败时返回非 0 code，宿主会当作该源无结果
    console.error('[hghub] 源请求失败', pluginId, error?.code || '', error?.message || error);
    return json(
      { code: 0, msg: error?.message || '插件调用失败', list: [], page: 1, pagecount: 0, total: 0 },
      { status: 200 }
    );
  }
}

const json = (body, init) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      ...(init?.headers || {}),
    },
  });
