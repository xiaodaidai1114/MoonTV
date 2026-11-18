/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export const runtime = 'edge';

interface BangumiCalendarItem {
  id: number;
  name: string;
  name_cn: string;
  rating?: { score?: number };
  air_date?: string;
  images?: {
    large?: string;
    common?: string;
    medium?: string;
    small?: string;
    grid?: string;
  };
}

interface BangumiCalendarDay {
  weekday?: { en?: string; cn?: string };
  items?: BangumiCalendarItem[];
}

export interface SeasonAnimeItem {
  id: number;
  title: string;
  poster: string;
  rate: string;
  year: string;
  air_date: string;
  weekday: string;
  weekday_cn: string;
}

const WEEKDAY_CN: Record<string, string> = {
  Mon: '周一',
  Tue: '周二',
  Wed: '周三',
  Thu: '周四',
  Fri: '周五',
  Sat: '周六',
  Sun: '周日',
};

function seasonLabel(date: Date): string {
  const month = date.getMonth() + 1;
  if (month <= 3) return `${date.getFullYear()} 年冬番`;
  if (month <= 6) return `${date.getFullYear()} 年春番`;
  if (month <= 9) return `${date.getFullYear()} 年夏番`;
  return `${date.getFullYear()} 年秋番`;
}

function pickPoster(item: BangumiCalendarItem): string {
  const images = item.images || {};
  // 优先小尺寸封面（common 约 6KB）：卡片最大 176px 宽，够用且跨境加载快
  // 大图（large）单张可达 170KB+，走代理时明显拖慢首屏
  return (
    images.common ||
    images.medium ||
    images.large ||
    images.small ||
    images.grid ||
    ''
  );
}

export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get('limit'));
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(60, Math.floor(rawLimit)))
      : 24;

    const config = await getConfig();
    const bangumiProxy =
      config.SiteConfig.BangumiProxy ||
      process.env.NEXT_PUBLIC_BANGUMI_PROXY ||
      '';
    const imageProxy =
      config.SiteConfig.BangumiImageProxy ||
      process.env.NEXT_PUBLIC_BANGUMI_IMAGE_PROXY ||
      '';

    const baseUrl = bangumiProxy
      ? bangumiProxy.replace(/\/+$/, '')
      : 'https://api.bgm.tv';
    const urls = bangumiProxy
      ? [`${baseUrl}/calendar`, 'https://api.bgm.tv/calendar']
      : ['https://api.bgm.tv/calendar'];

    let days: BangumiCalendarDay[] = [];
    let lastError: unknown;
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        if (Array.isArray(json)) {
          days = json as BangumiCalendarDay[];
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!days.length && lastError) {
      console.error('获取新番日历失败:', lastError);
    }

    const normalizedImageProxy = imageProxy.replace(/\/+$/, '');
    const seen = new Set<number>();
    const items: SeasonAnimeItem[] = [];

    days.forEach((day) => {
      const en = day.weekday?.en || '';
      const cn = day.weekday?.cn || WEEKDAY_CN[en] || '';
      (day.items || []).forEach((item) => {
        if (!item || typeof item.id !== 'number' || seen.has(item.id)) return;
        const title = (item.name_cn || item.name || '').trim();
        if (!title) return;
        seen.add(item.id);
        const rawScore = Number(item.rating?.score);
        items.push({
          id: item.id,
          title,
          poster: normalizedImageProxy
            ? pickPoster(item).replace(
                /^https?:\/\/lain\.bgm\.tv/,
                normalizedImageProxy
              )
            : pickPoster(item),
          rate:
            Number.isFinite(rawScore) && rawScore > 0
              ? rawScore.toFixed(1)
              : '',
          year: (item.air_date || '').slice(0, 4),
          air_date: item.air_date || '',
          weekday: en,
          weekday_cn: cn,
        });
      });
    });

    items.sort((a, b) => {
      const ra = Number(a.rate) || 0;
      const rb = Number(b.rate) || 0;
      if (rb !== ra) return rb - ra;
      return (b.air_date || '').localeCompare(a.air_date || '');
    });

    return NextResponse.json(
      {
        season: seasonLabel(new Date()),
        total: items.length,
        items: items.slice(0, limit),
      },
      { headers: { 'Cache-Control': 'public, max-age=1800' } }
    );
  } catch (error) {
    console.error('新番推荐接口异常:', error);
    return NextResponse.json(
      { season: seasonLabel(new Date()), total: 0, items: [] },
      { status: 200 }
    );
  }
}
