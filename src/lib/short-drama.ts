/* eslint-disable no-console */

import { mapWithConcurrency } from '@/lib/concurrency';
import { ApiSite, getAvailableApiSites } from '@/lib/config';
import { searchFromApiStream } from '@/lib/downstream';
import type { SearchResult } from '@/lib/types';

export interface ShortDramaItem {
  id: string;
  source: string;
  source_name: string;
  title: string;
  poster: string;
  year: string;
  episodes: number;
  remarks: string;
  type_name: string;
}

export interface ShortDramaTab {
  key: string;
  label: string;
  keywords: string[];
}

export const SHORT_DRAMA_TABS: ShortDramaTab[] = [
  { key: 'recommend', label: '推荐', keywords: ['短剧', '微短剧'] },
  { key: 'city', label: '都市', keywords: ['总裁', '千金'] },
  { key: 'comeback', label: '逆袭', keywords: ['逆袭', '战神'] },
  { key: 'costume', label: '古装', keywords: ['古装', '穿越'] },
  { key: 'romance', label: '甜宠', keywords: ['甜宠', '闪婚'] },
  { key: 'suspense', label: '悬疑', keywords: ['复仇', '重生'] },
];

const SHORT_DRAMA_PATTERN = /短剧|微短剧|漫剧|短剧场|竖屏|反转爽剧/i;
const KEYWORD_TIMEOUT_MS = 6000;
const MAX_SOURCES = 10;
const CACHE_TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { at: number; items: ShortDramaItem[] }>();

function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, '')
    .replace(/[《》「」【】]/g, '')
    .toLowerCase();
}

function isShortDrama(result: SearchResult): boolean {
  const meta = `${result.type_name || ''} ${result.class || ''} ${result.title || ''}`;
  return SHORT_DRAMA_PATTERN.test(meta);
}

function toItem(result: SearchResult): ShortDramaItem {
  const episodes = Array.isArray(result.episodes) ? result.episodes.length : 0;
  return {
    id: result.id,
    source: result.source,
    source_name: result.source_name,
    title: (result.title || '').trim(),
    poster: result.poster || '',
    year: result.year && result.year !== 'unknown' ? result.year : '',
    episodes,
    remarks: episodes > 0 ? `${episodes} 集` : '',
    type_name: result.type_name || result.class || '',
  };
}

function pickSources(sites: ApiSite[]): ApiSite[] {
  const available = sites.filter((site) => site.adult !== true);
  const tagged = available.filter((site) => site.shortDrama === true);
  return (tagged.length > 0 ? tagged : available).slice(0, MAX_SOURCES);
}

/**
 * 从视频源中聚合短剧。
 * 有标记为短剧源的站点时只查这些源，否则退化为全部普通源。
 */
export async function getShortDramaFeed(
  username: string | undefined,
  tabKey: string,
  limit = 24
): Promise<ShortDramaItem[]> {
  const tab =
    SHORT_DRAMA_TABS.find((item) => item.key === tabKey) || SHORT_DRAMA_TABS[0];
  const sites = pickSources(await getAvailableApiSites(username));
  if (sites.length === 0) return [];

  const cacheKey = `${tab.key}:${sites.map((s) => s.key).join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.items.slice(0, limit);
  }

  const tasks: { site: ApiSite; keyword: string }[] = sites.map((site, index) => ({
    site,
    keyword: tab.keywords[index % tab.keywords.length],
  }));

  const collected = await mapWithConcurrency(tasks, Math.min(8, tasks.length), async (task) => {
    const results: SearchResult[] = [];
    try {
      const generator = searchFromApiStream(
        task.site,
        task.keyword,
        true,
        KEYWORD_TIMEOUT_MS
      );
      for await (const page of generator) {
        results.push(...page);
        if (results.length >= 60) break;
      }
    } catch {
      return [] as SearchResult[];
    }
    return results;
  });

  const byTitle = new Map<string, ShortDramaItem>();
  collected.flat().forEach((result) => {
    if (!result || !isShortDrama(result)) return;
    const title = (result.title || '').trim();
    if (!title) return;
    const key = normalizeTitle(title) || title;
    const item = toItem(result);
    const existing = byTitle.get(key);
    if (!existing) {
      byTitle.set(key, item);
      return;
    }
    // 同一部剧在多个源出现时，保留海报更完整、集数更多的版本。
    const existingScore =
      (existing.poster ? 2 : 0) + Math.min(existing.episodes, 200);
    const itemScore = (item.poster ? 2 : 0) + Math.min(item.episodes, 200);
    if (itemScore > existingScore) byTitle.set(key, item);
  });

  const items = Array.from(byTitle.values())
    .sort((a, b) => {
      const aType = SHORT_DRAMA_PATTERN.test(a.type_name) ? 1 : 0;
      const bType = SHORT_DRAMA_PATTERN.test(b.type_name) ? 1 : 0;
      if (aType !== bType) return bType - aType;
      if (!!a.poster !== !!b.poster) return a.poster ? -1 : 1;
      return b.episodes - a.episodes;
    })
    .slice(0, 60);

  if (items.length > 0) {
    cache.set(cacheKey, { at: Date.now(), items });
  }
  return items.slice(0, limit);
}
