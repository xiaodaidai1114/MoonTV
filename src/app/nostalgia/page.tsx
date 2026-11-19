/* eslint-disable no-console, react-hooks/exhaustive-deps */

'use client';

import { Hourglass } from 'lucide-react';
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

interface DoubanItem {
  id: string;
  title: string;
  poster: string;
  rate: string;
  year: string;
}

const DECADES = [
  { key: '80年代', label: '80年代' },
  { key: '90年代', label: '90年代' },
  { key: '2000年代', label: '00年代' },
  { key: '2010年代', label: '10年代' },
];

const KINDS = [
  { key: 'tv', label: '电视剧' },
  { key: 'movie', label: '电影' },
];

const PAGE_SIZE = 25;

function NostalgiaClient() {
  const [decade, setDecade] = useState('90年代');
  const [kind, setKind] = useState('tv');
  const [sort, setSort] = useState('T'); // T=热门 S=高分
  const [items, setItems] = useState<DoubanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const pageRef = useRef(0);
  const loadingRef = useRef(false);

  const load = useCallback(
    async (page: number, replace: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (replace) {
        setLoading(true);
        setError('');
      } else {
        setLoadingMore(true);
      }
      try {
        const params = new URLSearchParams({
          kind,
          year: decade,
          sort,
          start: String(page * PAGE_SIZE),
          limit: String(PAGE_SIZE),
        });
        const response = await fetch(`/api/douban/recommends?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const list: DoubanItem[] = Array.isArray(data?.list) ? data.list : [];
        pageRef.current = page;
        setItems((prev) => (replace ? list : [...prev, ...list]));
        setHasMore(list.length >= PAGE_SIZE);
      } catch (err) {
        console.error('加载怀旧片单失败', err);
        if (replace) setError('加载失败，稍后再试试。');
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [decade, kind, sort]
  );

  // 切换年代/类型/排序时回到第一页
  useEffect(() => {
    pageRef.current = 0;
    setHasMore(true);
    void load(0, true);
  }, [decade, kind, sort]);

  const loadMore = () => {
    if (loadingRef.current || !hasMore) return;
    void load(pageRef.current + 1, false);
  };

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  });

  const chipClass = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-green-600 text-white shadow-sm'
        : 'border border-gray-200 bg-white text-gray-600 hover:border-green-400 hover:text-green-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
    }`;

  return (
    <PageLayout>
      <div className='px-3 py-6 sm:px-10 sm:py-8'>
        <div className='mx-auto max-w-[95%]'>
          <div className='mb-6'>
            <div className='mb-2 flex items-center gap-2 text-green-600 dark:text-green-400'>
              <Hourglass className='h-5 w-5' />
              <span className='text-xs font-semibold tracking-widest'>
                NOSTALGIA
              </span>
            </div>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
              怀旧专区
            </h1>
            <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>
              经典老片按年代慢慢翻，好剧不怕旧
            </p>
          </div>

          {/* 筛选：年代 / 类型 / 排序 */}
          <div className='mb-6 space-y-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/60'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='w-10 text-xs text-gray-400'>年代</span>
              {DECADES.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setDecade(item.key)}
                  className={chipClass(decade === item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='w-10 text-xs text-gray-400'>类型</span>
              {KINDS.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setKind(item.key)}
                  className={chipClass(kind === item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='w-10 text-xs text-gray-400'>排序</span>
              <button
                onClick={() => setSort('T')}
                className={chipClass(sort === 'T')}
              >
                热门
              </button>
              <button
                onClick={() => setSort('S')}
                className={chipClass(sort === 'S')}
              >
                高分
              </button>
            </div>
          </div>

          {error ? (
            <div className='py-16 text-center text-sm text-gray-500 dark:text-gray-400'>
              {error}
            </div>
          ) : loading ? (
            <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 px-0 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:px-2'>
              {Array.from({ length: 10 }).map((_, index) => (
                <DoubanCardSkeleton key={index} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className='rounded-xl border border-dashed border-gray-200 py-16 text-center dark:border-gray-700'>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                这个年代暂时没有找到内容，换一个年代试试。
              </p>
            </div>
          ) : (
            <>
              <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 px-0 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8 sm:gap-y-20 sm:px-2'>
                {items.map((item) => (
                  <div key={`n-${item.id}`} className='w-full'>
                    <VideoCard
                      from='douban'
                      title={item.title}
                      poster={item.poster}
                      douban_id={Number(item.id)}
                      rate={item.rate}
                      year={item.year}
                    />
                  </div>
                ))}
              </div>
              <div ref={sentinelRef} className='h-10' />
              {loadingMore && (
                <div className='py-4 text-center text-sm text-gray-400'>
                  加载中…
                </div>
              )}
              {!hasMore && (
                <div className='py-4 text-center text-xs text-gray-400'>
                  已经翻到底啦
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default function NostalgiaPage() {
  return (
    <Suspense>
      <NostalgiaClient />
    </Suspense>
  );
}
