import { NextRequest, NextResponse } from 'next/server';

import { ADULT_ZONE_COOKIE, verifyAdultZoneToken } from '@/lib/adult-zone';
import { canSeeAdultZone, getRequestRole } from '@/lib/adult-guard';
import { getAvailableApiSites } from '@/lib/config';
import { adultCategories } from '@/lib/yellow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const classCache = new Map<string, { at: number; classes: { id: string; name: string }[] }>();
const CLASS_TTL_MS = 30 * 60 * 1000;

async function loadClasses(api: string) {
  const cached = classCache.get(api);
  if (cached && Date.now() - cached.at < CLASS_TTL_MS) return cached.classes;
  const url = `${api}${api.includes('?') ? '&' : '?'}ac=list`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!response.ok) return [];
  const data = await response.json();
  const classes = (Array.isArray(data?.class) ? data.class : [])
    .map((item: { type_id?: string | number; type_name?: string }) => ({
      id: String(item.type_id ?? ''),
      name: String(item.type_name || ''),
    }))
    .filter((item: { id: string; name: string }) => item.id && item.name);
  classCache.set(api, { at: Date.now(), classes });
  return classes;
}

export async function GET(request: NextRequest) {
  if (!canSeeAdultZone(await getRequestRole(request))) {
    return NextResponse.json({ error: '仅管理员可访问' }, { status: 403 });
  }
  if (!(await verifyAdultZoneToken(request.cookies.get(ADULT_ZONE_COOKIE)?.value))) {
    return NextResponse.json({ error: '需要专区口令' }, { status: 401 });
  }

  const catId = new URL(request.url).searchParams.get('cat') || adultCategories[0].id;
  const category = adultCategories.find((item) => item.id === catId) || adultCategories[0];
  const sites = (await getAvailableApiSites()).filter(
    (site) => site.adult === true && !site.key.startsWith('hg-')
  );

  const batches = await Promise.all(
    sites.map(async (site) => {
      try {
        const classes = await loadClasses(site.api);
        const matched = classes.filter((item: { id: string; name: string }) =>
          category.words.some((word) => item.name.toLowerCase().includes(word.toLowerCase()))
        );
        const lists = await Promise.all(
          matched.slice(0, 3).map(async (item: { id: string; name: string }) => {
            const url = `${site.api}${site.api.includes('?') ? '&' : '?'}ac=videolist&t=${encodeURIComponent(item.id)}&pg=1`;
            const response = await fetch(url, {
              signal: AbortSignal.timeout(6000),
              headers: { 'User-Agent': 'Mozilla/5.0' },
            });
            if (!response.ok) return [];
            const data = await response.json();
            const list = Array.isArray(data?.list) ? data.list : [];
            return list.slice(0, 12).map((raw: { vod_id?: string | number; vod_name?: string; vod_pic?: string; vod_year?: string; type_name?: string; vod_play_url?: string }) => ({
              id: String(raw.vod_id ?? ''),
              title: String(raw.vod_name || '').trim(),
              poster: typeof raw.vod_pic === 'string' ? raw.vod_pic : '',
              year: String(raw.vod_year || '').match(/\d{4}/)?.[0] || '',
              source: site.key,
              source_name: site.name,
              type_name: raw.type_name || item.name,
              episodes: typeof raw.vod_play_url === 'string' && raw.vod_play_url.includes('$') ? raw.vod_play_url.split('#') : [],
            })).filter((row: { id: string; title: string }) => row.id && row.title);
          })
        );
        return lists.flat();
      } catch {
        return [];
      }
    })
  );

  const seen = new Set<string>();
  const results = batches.flat().filter((item) => {
    const key = `${item.source}|${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return NextResponse.json(
    { category, categories: adultCategories.map(({ id, label }) => ({ id, label })), results },
    { headers: { 'Cache-Control': 'private, max-age=120' } }
  );
}
