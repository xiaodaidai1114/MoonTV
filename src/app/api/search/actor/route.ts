/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { mapWithConcurrency } from '@/lib/concurrency';
import { getAvailableApiSites } from '@/lib/config';
import { searchFromApiStream } from '@/lib/downstream';
import { SearchResult } from '@/lib/types';
import { isYellowResult } from '@/lib/yellow';

export const runtime = 'edge';

function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, '')
    .replace(/[《》「」【】]/g, '')
    .toLowerCase();
}

/**
 * 演员名搜索：部分片源（如 MacCMS 系）的 wd 搜索会同时匹配演员/导演字段。
 * 这里以演员名向各源发起搜索，然后按源返回的演员名单过滤——
 * 只有 vod_actor/vod_director 里确实包含该名字的结果才算数，
 * 避免把单纯片名带关键词的噪声混进来。
 */
export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType !== 'localstorage') {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const actor = (searchParams.get('q') || '').trim();
  const rawLimit = Number(searchParams.get('limit'));
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(60, Math.floor(rawLimit)))
    : 30;

  // 演员名长度约束：过长的基本不是人名，直接拒绝省得白跑所有源
  if (!actor || actor.length < 2 || actor.length > 20) {
    return NextResponse.json({ results: [] });
  }

  const apiSites = (await getAvailableApiSites(
    getAuthInfoFromCookie(request)?.username
  )).filter((site) => site.adult !== true);
  if (apiSites.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const collected = await mapWithConcurrency(
    apiSites,
    Math.min(8, apiSites.length),
    async (site) => {
      const found: SearchResult[] = [];
      try {
        const generator = searchFromApiStream(site, actor, true, 8000);
        for await (const page of generator) {
          found.push(...page);
          if (found.length >= 40) break;
        }
      } catch {
        return [] as SearchResult[];
      }
      // 只保留演员/导演名单确实包含该名字的条目
      return found.filter(
        (item) => !isYellowResult(item) && !!item.actors && item.actors.includes(actor)
      );
    }
  );

  // 按标题去重：同名作品保留海报更全、集数更多的版本
  const byTitle = new Map<string, SearchResult & { actor_match: string }>();
  collected.flat().forEach((result) => {
    const title = (result.title || '').trim();
    if (!title) return;
    const key = normalizeTitle(title) || title;
    const existing = byTitle.get(key);
    if (!existing) {
      byTitle.set(key, { ...result, actor_match: actor });
      return;
    }
    const existingScore =
      (existing.poster ? 2 : 0) + Math.min(existing.episodes?.length || 0, 200);
    const incomingScore =
      (result.poster ? 2 : 0) + Math.min(result.episodes?.length || 0, 200);
    if (incomingScore > existingScore) byTitle.set(key, { ...result, actor_match: actor });
  });

  const results = Array.from(byTitle.values())
    .sort((a, b) => (b.episodes?.length || 0) - (a.episodes?.length || 0))
    .slice(0, limit);

  return NextResponse.json(
    { results, actor },
    { headers: { 'Cache-Control': 'private, max-age=300' } }
  );
}
