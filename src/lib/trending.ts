/* eslint-disable no-console */

import { mapWithConcurrency } from '@/lib/concurrency';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import type { PlayRecord } from '@/lib/types';

export interface TrendingItem {
  title: string;
  poster: string;
  year: string;
  source: string;
  id: string;
  source_name: string;
  episodes: number;
  watchers: number;
  plays: number;
  last_save_time: number;
  reason: string;
}

interface TrendingGroup {
  title: string;
  poster: string;
  year: string;
  source: string;
  id: string;
  source_name: string;
  episodes: number;
  plays: number;
  recent_plays: number;
  last_save_time: number;
  watchers: Set<string>;
}

const CACHE_TTL_MS = 120 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_USERS = 300;

let cache: { at: number; items: TrendingItem[] } | null = null;

/** 去掉空格、全角符号与季数标注，用于把不同片源的同名作品合并。 */
function normalizeTitle(title: string): string {
  return title
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[《》「」【】]/g, '')
    .replace(/\s+/g, '')
    .replace(/第[一二三四五六七八九十0-9]+季/g, '')
    .replace(/\((?:19|20)\d{2}\)/g, '')
    .toLowerCase();
}

function toEpisodes(record: PlayRecord): number {
  const total = Number(record.total_episodes);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

function scoreOf(group: TrendingGroup): number {
  const recentBoost = Math.max(
    0,
    1 - (Date.now() - group.last_save_time) / (7 * DAY_MS)
  );
  return (
    group.watchers.size * 6 +
    group.recent_plays * 3 +
    group.plays +
    recentBoost * 4
  );
}

function reasonOf(group: TrendingItem): string {
  if (group.watchers > 1) {
    return `${group.watchers} 人在看`;
  }
  if (group.episodes > 1) {
    return `更新至 ${group.episodes} 集`;
  }
  return '最近热门';
}

/**
 * 汇总所有用户近期的播放记录，得到「大家都在看」。
 * 只返回聚合结果，不暴露任何用户名。
 */
export async function getTrendingItems(limit = 20): Promise<TrendingItem[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.items.slice(0, limit);
  }

  const config = await getConfig();
  const adultSources = new Set(
    config.SourceConfig.filter((s) => s.adult === true).map((s) => s.key)
  );

  let users: string[] = [];
  try {
    users = (await db.getAllUsers()).slice(0, MAX_USERS);
  } catch (error) {
    console.error('读取用户列表失败:', error);
  }

  const recordsByUser = await mapWithConcurrency(users, 6, async (user) => {
    try {
      return await db.getAllPlayRecords(user);
    } catch {
      return {} as Record<string, PlayRecord>;
    }
  });

  const groups = new Map<string, TrendingGroup>();
  const now = Date.now();
  let recentCount = 0;

  recordsByUser.forEach((records, userIndex) => {
    const userKey = users[userIndex] || `u${userIndex}`;
    Object.entries(records || {}).forEach(([key, record]) => {
      if (!record || !record.title || !record.title.trim()) return;
      const plus = key.indexOf('+');
      const source = plus >= 0 ? key.slice(0, plus) : '';
      const id = plus >= 0 ? key.slice(plus + 1) : key;
      if (!source || !id) return;
      if (adultSources.has(source)) return;

      const saveTime = Number(record.save_time) || 0;
      const isRecent = saveTime > 0 && now - saveTime <= 7 * DAY_MS;
      if (isRecent) recentCount += 1;

      const groupKey = normalizeTitle(record.title) || record.title;
      const existing = groups.get(groupKey);
      const episodes = toEpisodes(record);
      if (!existing) {
        groups.set(groupKey, {
          title: record.title.trim(),
          poster: record.cover || '',
          year: record.year && record.year !== 'unknown' ? record.year : '',
          source,
          id,
          source_name: record.source_name || '',
          episodes,
          plays: 1,
          recent_plays: isRecent ? 1 : 0,
          last_save_time: saveTime,
          watchers: new Set([userKey]),
        });
        return;
      }

      existing.plays += 1;
      if (isRecent) existing.recent_plays += 1;
      existing.watchers.add(userKey);
      existing.episodes = Math.max(existing.episodes, episodes);
      if (saveTime >= existing.last_save_time) {
        // 以最近一次播放的片源为准，保证卡片点开能直接续播。
        existing.last_save_time = saveTime;
        existing.source = source;
        existing.id = id;
        existing.source_name = record.source_name || existing.source_name;
        existing.poster = record.cover || existing.poster;
        existing.title = record.title.trim() || existing.title;
        if (record.year && record.year !== 'unknown') existing.year = record.year;
      }
    });
  });

  // 近七天完全没有新播放时，退回全量统计，避免小站点长期空榜。
  const result = Array.from(groups.values());
  const items = result
    .sort((a, b) => scoreOf(b) - scoreOf(a))
    .slice(0, limit)
    .map<TrendingItem>((group) => ({
      title: group.title,
      poster: group.poster,
      year: group.year,
      source: group.source,
      id: group.id,
      source_name: group.source_name,
      episodes: group.episodes,
      watchers: group.watchers.size,
      plays: group.plays,
      last_save_time: group.last_save_time,
      reason: '',
    }))
    .map((item) => ({ ...item, reason: reasonOf(item) }));

  if (recentCount === 0) {
    // 数据太少时不缓存，等用户产生新的播放记录后尽快刷新。
    return items;
  }

  cache = { at: Date.now(), items };
  return items.slice(0, limit);
}
