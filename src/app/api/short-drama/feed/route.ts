/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getShortDramaFeed, SHORT_DRAMA_TABS } from '@/lib/short-drama';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const config = await getConfig();
    const user = config.UserConfig.Users?.find(
      (u) => u.username === authInfo.username
    );
    if (user?.banned) {
      return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get('tab') || 'recommend';
    const rawLimit = Number(searchParams.get('limit'));
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(60, Math.floor(rawLimit)))
      : 24;

    const items = await getShortDramaFeed(authInfo.username, tab, limit);

    return NextResponse.json(
      {
        tabs: SHORT_DRAMA_TABS.map((item) => ({
          key: item.key,
          label: item.label,
        })),
        tab,
        items,
        updatedAt: Date.now(),
      },
      { headers: { 'Cache-Control': 'private, max-age=300' } }
    );
  } catch (error) {
    console.error('获取短剧频道失败:', error);
    return NextResponse.json({ tabs: [], items: [], updatedAt: Date.now() });
  }
}
