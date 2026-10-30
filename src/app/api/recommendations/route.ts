/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { fetchDoubanData } from '@/lib/douban';

export const runtime = 'nodejs';

interface DoubanCategoryApiResponse {
  total: number;
  items: Array<{
    id: string;
    title: string;
    card_subtitle: string;
    pic: { large: string; normal: string };
    rating: { value: number };
  }>;
}

function buildUrl(
  kind: 'movie' | 'tv',
  category: string,
  type: string,
  start: number,
  limit: number
): string {
  return `https://m.douban.com/rexxar/api/v2/subject/recent_hot/${kind}?start=${start}&limit=${limit}&category=${encodeURIComponent(category)}&type=${encodeURIComponent(type)}`;
}

async function loadList(
  kind: 'movie' | 'tv',
  category: string,
  type: string
): Promise<Array<{ id: string; title: string; poster: string; rate: string; year: string; kind: string }>> {
  try {
    const data = await fetchDoubanData<DoubanCategoryApiResponse>(
      buildUrl(kind, category, type, 0, 40)
    );
    return (data.items || []).map((item) => ({
      id: item.id,
      title: item.title,
      poster: item.pic?.normal || item.pic?.large || '',
      rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
      year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
      kind,
    }));
  } catch (err) {
    console.error('拉取豆瓣热门失败:', kind, err);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getConfig();
    if (authInfo.username !== process.env.USERNAME) {
      const user = config.UserConfig.Users.find(
        (u) => u.username === authInfo.username
      );
      if (!user) {
        return NextResponse.json({ error: '用户不存在' }, { status: 401 });
      }
      if (user.banned) {
        return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
      }
    }

    const records = await db.getAllPlayRecords(authInfo.username);
    const list = Object.values(records || {});
    const watched = new Set(list.map((r) => (r.title || '').trim()).filter(Boolean));

    const yearCount: Record<string, number> = {};
    for (const r of list) {
      const y = (r.year || '').match(/\d{4}/)?.[0];
      if (y) {
        yearCount[y] = (yearCount[y] || 0) + 1;
      }
    }
    const preferYears = Object.entries(yearCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([y]) => y);

    const [movies, tvs] = await Promise.all([
      loadList('movie', '热门', '全部'),
      loadList('tv', 'tv', 'tv'),
    ]);

    const merged = [...movies, ...tvs].filter(
      (item) => item.title && !watched.has(item.title.trim())
    );

    const scored = merged
      .map((item) => {
        const rate = parseFloat(item.rate) || 0;
        const yearBonus = preferYears.includes(item.year) ? 2 : 0;
        return { ...item, score: rate + yearBonus };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ score, ...rest }) => rest);

    return NextResponse.json(
      {
        recommendations: scored,
        basedOn: {
          watchedCount: list.length,
          preferYears,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('获取为你推荐失败:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
