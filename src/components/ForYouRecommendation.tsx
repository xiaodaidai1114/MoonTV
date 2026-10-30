'use client';

import { RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import ScrollableRow from './ScrollableRow';
import VideoCard from './VideoCard';

interface RecommendItem {
  id: string;
  title: string;
  poster: string;
  rate: string;
  year: string;
  kind: string;
}

const ForYouRecommendation = () => {
  const [items, setItems] = useState<RecommendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [basedOn, setBasedOn] = useState<{ watchedCount: number } | null>(
    null
  );
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchRecommend = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/recommendations');
        if (!res.ok) {
          setItems([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setItems(data.recommendations || []);
          setBasedOn(data.basedOn || null);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchRecommend();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <section className='mb-8'>
      <div className='mb-4 flex items-center justify-between'>
        <div className='flex items-center gap-2'>
          <Sparkles className='w-5 h-5 text-green-600 dark:text-green-400' />
          <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
            为你推荐
          </h2>
          {basedOn && basedOn.watchedCount > 0 && (
            <span className='text-xs text-gray-400 dark:text-gray-500'>
              基于 {basedOn.watchedCount} 条观看记录
            </span>
          )}
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className='flex items-center text-sm text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400 transition-colors'
          title='刷新推荐'
        >
          <RefreshCw className='w-3.5 h-3.5 mr-1' />
          换一批
        </button>
      </div>
      <ScrollableRow>
        {loading
          ? Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
              >
                <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                  <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                </div>
                <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
              </div>
            ))
          : items.map((item) => (
              <div
                key={`${item.kind}-${item.id}`}
                className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
              >
                <VideoCard
                  from='douban'
                  title={item.title}
                  poster={item.poster}
                  douban_id={Number(item.id)}
                  rate={item.rate}
                  year={item.year}
                  type={item.kind === 'tv' ? 'tv' : 'movie'}
                />
              </div>
            ))}
      </ScrollableRow>
    </section>
  );
};

export default ForYouRecommendation;
