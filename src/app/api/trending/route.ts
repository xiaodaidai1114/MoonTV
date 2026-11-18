/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getTrendingItems } from '@/lib/trending';

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
    const rawLimit = Number(searchParams.get('limit'));
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(40, Math.floor(rawLimit)))
      : 20;

    const items = await getTrendingItems(limit);

    return NextResponse.json(
      { items, updatedAt: Date.now() },
      {
        headers: {
          'Cache-Control': 'private, max-age=60',
        },
      }
    );
  } catch (error) {
    console.error('获取「大家都在看」失败:', error);
    return NextResponse.json({ items: [], updatedAt: Date.now() });
  }
}
