/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { searchActorInSources } from '@/lib/actor-search';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites } from '@/lib/config';

export const runtime = 'edge';

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

  let results = await searchActorInSources(apiSites, actor, { maxPerSource: 40 });

  // 本站源查不到时的兜底：支持演员字段的源（量子系）可能对本机房不可达，
  // 但中转站（另一台服务器）可达。ACTOR_RELAY_BASE 由 compose 注入。
  const relayBase = process.env.ACTOR_RELAY_BASE;
  if (results.length === 0 && relayBase) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);
      const relayRes = await fetch(
        `${relayBase.replace(/\/+$/, '')}/api/search/actor-relay?q=${encodeURIComponent(
          actor
        )}&limit=${limit}`,
        { signal: controller.signal, headers: { Accept: 'application/json' } }
      );
      clearTimeout(timer);
      if (relayRes.ok) {
        const data = await relayRes.json();
        if (Array.isArray(data?.results) && data.results.length > 0) {
          results = data.results;
        }
      }
    } catch (error) {
      console.error('演员搜索中转失败:', error);
    }
  }

  return NextResponse.json(
    { results: results.slice(0, limit), actor },
    { headers: { 'Cache-Control': 'private, max-age=300' } }
  );
}
