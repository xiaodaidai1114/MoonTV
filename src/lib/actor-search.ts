/* eslint-disable no-console */

import { ApiSite } from '@/lib/config';
import { mapWithConcurrency } from '@/lib/concurrency';
import { searchFromApiStream } from '@/lib/downstream';
import { SearchResult } from '@/lib/types';
import { isYellowResult } from '@/lib/yellow';

export interface ActorSearchOptions {
  /** 同时查询的源数量上限 */
  concurrency?: number;
  /** 单源搜索超时（毫秒） */
  perSourceTimeoutMs?: number;
  /** 单源最多收集条数（提前断开分页） */
  maxPerSource?: number;
}

function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, '')
    .replace(/[《》「」【】]/g, '')
    .toLowerCase();
}

/**
 * 以演员名向各片源发起搜索，按源返回的演员/导演名单过滤。
 *
 * 部分片源（MacCMS 系）的 wd 搜索同时匹配演员字段，因此能实现
 * 「搜演员名 → 出他演的剧」；不支持演员字段的源对该关键词只会返回
 * 片名噪声，这里用名单过滤把它们丢掉。
 */
export async function searchActorInSources(
  apiSites: ApiSite[],
  actor: string,
  options: ActorSearchOptions = {}
): Promise<SearchResult[]> {
  const {
    concurrency = 8,
    perSourceTimeoutMs = 8000,
    maxPerSource = 40,
  } = options;
  if (apiSites.length === 0) return [];

  const collected = await mapWithConcurrency(
    apiSites,
    Math.min(concurrency, apiSites.length),
    async (site) => {
      const found: SearchResult[] = [];
      try {
        const generator = searchFromApiStream(
          site,
          actor,
          true,
          perSourceTimeoutMs
        );
        for await (const page of generator) {
          found.push(...page);
          if (found.length >= maxPerSource) break;
        }
      } catch {
        return [] as SearchResult[];
      }
      return found.filter(
        (item) =>
          !isYellowResult(item) &&
          !!item.actors &&
          item.actors.includes(actor)
      );
    }
  );

  // 按标题去重：同名作品保留海报更全、集数更多的版本
  const byTitle = new Map<string, SearchResult>();
  collected.flat().forEach((result) => {
    const title = (result.title || '').trim();
    if (!title) return;
    const key = normalizeTitle(title) || title;
    const existing = byTitle.get(key);
    if (!existing) {
      byTitle.set(key, result);
      return;
    }
    const existingScore =
      (existing.poster ? 2 : 0) + Math.min(existing.episodes?.length || 0, 200);
    const incomingScore =
      (result.poster ? 2 : 0) + Math.min(result.episodes?.length || 0, 200);
    if (incomingScore > existingScore) byTitle.set(key, result);
  });

  return Array.from(byTitle.values()).sort(
    (a, b) => (b.episodes?.length || 0) - (a.episodes?.length || 0)
  );
}
