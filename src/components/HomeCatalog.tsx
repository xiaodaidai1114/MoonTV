'use client';

import { SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { BangumiCalendarData } from '@/lib/bangumi.client';
import { DoubanItem } from '@/lib/types';

import { useNavigationLoading } from './NavigationLoadingProvider';
import VideoCard from './VideoCard';

type Channel = 'tv' | 'movie' | 'anime' | 'show';

const CHANNELS: { key: Channel; label: string; more: string }[] = [
  { key: 'tv', label: '电视剧', more: '/douban?type=tv' },
  { key: 'movie', label: '电影', more: '/douban?type=movie' },
  { key: 'anime', label: '动漫', more: '/douban?type=anime' },
  { key: 'show', label: '综艺', more: '/douban?type=show' },
];

interface HomeCatalogProps {
  movies: DoubanItem[];
  tvs: DoubanItem[];
  shows: DoubanItem[];
  calendar: BangumiCalendarData[];
  loading: boolean;
}

function todayAnime(calendar: BangumiCalendarData[]) {
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = weekdays[new Date().getDay()];
  return (
    (Array.isArray(calendar) ? calendar : []).find(
      (item) => item?.weekday?.en === today
    )?.items || []
  );
}

export default function HomeCatalog({
  movies,
  tvs,
  shows,
  calendar,
  loading,
}: HomeCatalogProps) {
  const { startLoading } = useNavigationLoading();
  const [channel, setChannel] = useState<Channel>('tv');
  const current = CHANNELS.find((item) => item.key === channel) || CHANNELS[0];
  const animes = useMemo(() => todayAnime(calendar), [calendar]);

  const cards =
    channel === 'movie'
      ? movies
      : channel === 'show'
        ? shows
        : channel === 'anime'
          ? animes.map((item) => ({
              id: String(item.id),
              title: item.name_cn || item.name || '',
              poster:
                item.images?.common ||
                item.images?.medium ||
                item.images?.large ||
                '',
              rate: item.rating?.score ? String(item.rating.score) : '',
              year: item.air_date?.slice(0, 4) || '',
              bangumi: true,
            }))
          : tvs;

  return (
    <section className='mb-8'>
      <div className='mb-3 flex gap-5 overflow-x-auto border-b border-black/10 scrollbar-hide dark:border-white/10'>
        {CHANNELS.map((item) => {
          const active = item.key === channel;
          return (
            <button
              key={item.key}
              type='button'
              onClick={() => setChannel(item.key)}
              className={`relative flex-shrink-0 pb-2 text-sm font-medium ${
                active
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {item.label}
              {active && (
                <span className='absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-green-500' />
              )}
            </button>
          );
        })}
        <Link
          href='/short-drama'
          onClick={startLoading}
          className='flex-shrink-0 pb-2 text-sm font-medium text-gray-500 dark:text-gray-400'
        >
          短剧
        </Link>
      </div>

      <div className='mb-3 flex items-center justify-between'>
        <div className='flex gap-2'>
          <span className='rounded-lg bg-black/80 px-3 py-1 text-xs text-white dark:bg-white/15'>
            最热
          </span>
          <Link
            href={current.more}
            onClick={startLoading}
            className='rounded-lg px-3 py-1 text-xs text-gray-500 dark:text-gray-400'
          >
            最新
          </Link>
        </div>
        <Link
          href={current.more}
          onClick={startLoading}
          className='flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400'
        >
          <SlidersHorizontal className='h-3.5 w-3.5' />
          筛选
        </Link>
      </div>

      {loading ? (
        <div className='grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'>
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index}>
              <div className='aspect-[2/3] animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800' />
              <div className='mt-2 h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
            </div>
          ))}
        </div>
      ) : (
        <div className='grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'>
          {cards.slice(0, 12).map((item, index) => (
            <VideoCard
              key={`${item.id}-${index}`}
              from='douban'
              title={item.title}
              poster={item.poster}
              douban_id={Number(item.id)}
              rate={item.rate}
              year={item.year}
              type={channel === 'movie' ? 'movie' : ''}
              isBangumi={'bangumi' in item && item.bangumi === true}
            />
          ))}
        </div>
      )}
    </section>
  );
}
