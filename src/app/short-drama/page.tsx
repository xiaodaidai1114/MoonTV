/* eslint-disable no-console */

'use client';

import { ChevronRight, Clapperboard, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

interface ShortDramaItem {
  id: string;
  source: string;
  source_name: string;
  title: string;
  poster: string;
  year: string;
  episodes: number;
  remarks: string;
  type_name: string;
}

interface TabItem {
  key: string;
  label: string;
}

const DEFAULT_TABS: TabItem[] = [
  { key: 'recommend', label: '推荐' },
  { key: 'city', label: '都市' },
  { key: 'comeback', label: '逆袭' },
  { key: 'costume', label: '古装' },
  { key: 'romance', label: '甜宠' },
  { key: 'suspense', label: '悬疑' },
];

function ShortDramaClient() {
  const [tabs, setTabs] = useState<TabItem[]>(DEFAULT_TABS);
  const [activeTab, setActiveTab] = useState('recommend');
  const [items, setItems] = useState<ShortDramaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (tabKey: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/short-drama/feed?tab=${encodeURIComponent(tabKey)}&limit=48`,
        { cache: 'no-store' }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (Array.isArray(data?.tabs) && data.tabs.length > 0) {
        setTabs(data.tabs);
      }
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      console.error('加载短剧频道失败', err);
      setError('短剧频道暂时加载失败，稍后重试。');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(activeTab);
  }, [activeTab, load]);

  return (
    <PageLayout>
      <div className='px-3 sm:px-10 py-6 sm:py-8'>
        <div className='mx-auto max-w-[95%]'>
          <div className='mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
            <div>
              <div className='mb-2 flex items-center gap-2 text-green-600 dark:text-green-400'>
                <Clapperboard className='h-5 w-5' />
                <span className='text-xs font-semibold tracking-widest'>
                  SHORT DRAMA
                </span>
              </div>
              <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
                短剧频道
              </h1>
              <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
                从视频源聚合的竖屏短剧，点开就能看。可在后台把短剧源标记出来，这里会优先查询。
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <button
                onClick={() => void load(activeTab)}
                disabled={loading}
                className='inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:border-green-400 hover:text-green-600 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                />
                刷新
              </button>
              <Link
                href='/douban?type=short'
                className='inline-flex items-center text-xs text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400'
              >
                豆瓣短剧库
                <ChevronRight className='ml-0.5 h-3.5 w-3.5' />
              </Link>
            </div>
          </div>

          <div className='mb-6 flex gap-2 overflow-x-auto scrollbar-hide'>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'border border-gray-200 bg-white text-gray-600 hover:border-green-400 hover:text-green-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className='grid grid-cols-3 gap-x-2 gap-y-10 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
              {Array.from({ length: 12 }).map((_, index) => (
                <div key={index} className='w-full'>
                  <div className='aspect-[2/3] w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800' />
                  <div className='mt-2 h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className='py-16 text-center text-sm text-gray-500 dark:text-gray-400'>
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className='rounded-xl border border-dashed border-gray-200 py-16 text-center dark:border-gray-700'>
              <p className='text-sm text-gray-600 dark:text-gray-300'>
                这个分类暂时没有聚合到可播放的短剧。
              </p>
              <p className='mt-2 text-xs text-gray-400 dark:text-gray-500'>
                可以换一个分类，或在后台把支持短剧的源标记为「短剧源」。
              </p>
            </div>
          ) : (
            <>
              <div className='mb-4 text-xs text-gray-400 dark:text-gray-500'>
                共 {items.length} 部 · 来自 {new Set(items.map((i) => i.source_name)).size} 个片源
              </div>
              <div className='grid grid-cols-3 gap-x-2 gap-y-10 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-14'>
                {items.map((item) => (
                  <div key={`${item.source}-${item.id}`} className='w-full'>
                    <VideoCard
                      from='search'
                      id={item.id}
                      source={item.source}
                      source_name={item.source_name}
                      title={item.title}
                      poster={item.poster}
                      year={item.year}
                      episodes={item.episodes}
                      type={item.episodes > 1 ? 'tv' : ''}
                    />
                    {item.remarks && (
                      <div className='mt-1 truncate text-center text-[11px] text-gray-400 dark:text-gray-500'>
                        {item.remarks}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default function ShortDramaPage() {
  return <ShortDramaClient />;
}
