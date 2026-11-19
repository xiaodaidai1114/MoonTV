/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { searchActorInSources } from '@/lib/actor-search';
import { getAvailableApiSites } from '@/lib/config';

export const runtime = 'edge';

/**
 * 演员搜索中转（无登录态）：给另一台部署机的演员搜索兜底用。
 * 场景：支持演员字段的片源（量子系）对部分机房不可达，但对本机可达时，
 * 那台机器的 /api/search/actor 会在本地聚合为空后走这里。
 *
 * 开放原因与 /api/hghub、/api/m3u8 一致：仅代查公开片源列表，
 * q 有长度约束，不暴露任何站内数据。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const actor = (searchParams.get('q') || '').trim();
  const rawLimit = Number(searchParams.get('limit'));
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(60, Math.floor(rawLimit)))
    : 30;

  if (!actor || actor.length < 2 || actor.length > 20) {
    return NextResponse.json({ results: [], actor });
  }

  try {
    const apiSites = (await getAvailableApiSites()).filter(
      (site) => site.adult !== true
    );
    const results = await searchActorInSources(apiSites, actor, { maxPerSource: 40 });
    return NextResponse.json(
      { results: results.slice(0, limit), actor },
      { headers: { 'Cache-Control': 'private, max-age=300' } }
    );
  } catch (error) {
    console.error('演员搜索中转异常:', error);
    return NextResponse.json({ results: [], actor });
  }
}
