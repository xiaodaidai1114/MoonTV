/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getCacheTime, getConfig } from '@/lib/config';
import { fetchDoubanData } from '@/lib/douban';
import { DoubanResult } from '@/lib/types';

interface DoubanCollectionApiResponse {
  subject_collection_items: Array<{
    id: string;
    title: string;
    cover_url?: string;
    pic?: { large?: string; normal?: string };
    rating?: { value?: number };
    card_subtitle?: string;
  }>;
}

export const runtime = 'edge';

const VALID_COLLECTIONS = ['movie_top250', 'movie_weekly_best'];

export async function GET(request: NextRequest) {
  // 认证策略：已登录用户 或 TVBox 开启（匿名），与 recommends 路由保持一致
  const auth = getAuthInfoFromCookie(request);
  if (!auth || !auth.username) {
    const cfg = await getConfig();
    const storageType =
      process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    const enabled =
      storageType === 'localstorage'
        ? process.env.TVBOX_ENABLED == null ||
          String(process.env.TVBOX_ENABLED).toLowerCase() === 'true'
        : cfg.SiteConfig.TVBoxEnabled === true;
    if (!enabled) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { searchParams } = new URL(request.url);
  const collectionId = searchParams.get('id') || '';
  const pageStart = parseInt(searchParams.get('start') || '0');
  const pageLimit = parseInt(searchParams.get('limit') || '25');

  if (!VALID_COLLECTIONS.includes(collectionId)) {
    return NextResponse.json(
      { error: '无效的榜单 ID' },
      { status: 400 }
    );
  }
  if (
    !Number.isFinite(pageStart) ||
    pageStart < 0 ||
    !Number.isFinite(pageLimit) ||
    pageLimit < 1 ||
    pageLimit > 100
  ) {
    return NextResponse.json({ error: '分页参数错误' }, { status: 400 });
  }

  // 服务端代拉：榜单页此前由浏览器直连豆瓣，被 CORS 拦截或被家宽网络阻断，
  // 统一收敛到服务器侧请求（与 categories/recommends 路由同一策略）
  const target = `https://m.douban.com/rexxar/api/v2/subject_collection/${collectionId}/items?start=${pageStart}&count=${pageLimit}`;

  try {
    const data = await fetchDoubanData<DoubanCollectionApiResponse>(target);
    const list = (data.subject_collection_items || []).map((item) => ({
      id: item.id,
      title: item.title,
      poster: item.cover_url || item.pic?.large || item.pic?.normal || '',
      rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
      year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
    }));

    const response: DoubanResult = {
      code: 200,
      message: '获取成功',
      list,
    };

    const cacheTime = await getCacheTime();
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
      },
    });
  } catch (error) {
    console.error('获取豆瓣榜单失败:', error);
    return NextResponse.json(
      { error: '获取豆瓣榜单失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}
