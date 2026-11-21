import { NextRequest, NextResponse } from 'next/server';

import { ADULT_ZONE_COOKIE, verifyAdultZoneToken } from '@/lib/adult-zone';
import { canSeeAdultZone, getRequestRole } from '@/lib/adult-guard';
import { getAvailableApiSites } from '@/lib/config';
import { adultCategories } from '@/lib/yellow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const classCache = new Map<string, { at: number; classes: { id: string; name: string }[] }>();
const feedCache = new Map<string, { at: number; results: FeedItem[] }>();
const CLASS_TTL_MS = 30 * 60 * 1000;
const FEED_TTL_MS = 10 * 60 * 1000;
const FEED_DEADLINE_MS = 1800;

type FeedItem = {
  id: string;
  title: string;
  poster: string;
  year: string;
  source: string;
  source_name: string;
  type_name: string;
  episodes: string[];
};

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

  const cached = feedCache.get(category.id);
  if (cached && Date.now() - cached.at < FEED_TTL_MS) {
    return NextResponse.json(
      {
        category,
        categories: adultCategories.map(({ id, label }) => ({ id, label })),
        results: cached.results,
        cached: true,
      },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  }

  const bag: FeedItem[] = [];
  const jobs = sites.map(async (site) => {
      try {
        const classes = await loadClasses(site.api);
        const matched = classes.filter((item: { id: string; name: string }) =>
          category.words.some((word) => item.name.toLowerCase().includes(word.toLowerCase()))
        );
        const lists = await Promise.all(
          matched.slice(0, 1).map(async (item: { id: string; name: string }) => {
            const url = `${site.api}${site.api.includes('?') ? '&' : '?'}ac=videolist&t=${encodeURIComponent(item.id)}&pg=1`;
            const response = await fetch(url, {
              signal: AbortSignal.timeout(2500),
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
        const items = lists.flat() as FeedItem[];
        bag.push(...items);
        return items;
      } catch {
        return [];
      }
  });

  await Promise.race([
    Promise.all(jobs),
    new Promise((resolve) => setTimeout(resolve, FEED_DEADLINE_MS)),
  ]);

  const seen = new Set<string>();
  const results = bag.filter((item) => {
    const key = `${item.source}|${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  void Promise.all(jobs).then(() => {
    const done = new Set<string>();
    const full = bag.filter((item) => {
      const key = `${item.source}|${item.id}`;
      if (done.has(key)) return false;
      done.add(key);
      return true;
    });
    if (full.length > 0) feedCache.set(category.id, { at: Date.now(), results: full });
  });

  return NextResponse.json(
    {
      category,
      categories: adultCategories.map(({ id, label }) => ({ id, label })),
      results,
    },
    { headers: { 'Cache-Control': 'private, max-age=30' } }
  );
}
