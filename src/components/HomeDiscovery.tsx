/* eslint-disable no-console */

'use client';

import { ArrowRight, Search, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import ScrollableRow from '@/components/ScrollableRow';
import VideoCard from '@/components/VideoCard';

interface TrendingItem {
  title: string;
  poster: string;
  year: string;
  source: string;
  id: string;
  source_name: string;
  episodes: number;
  watchers: number;
  reason: string;
}

interface SeasonAnimeItem {
  id: number;
  title: string;
  poster: string;
  rate: string;
  year: string;
  weekday_cn: string;
}

interface ShortDramaItem {
  id: string;
  source: string;
  source_name: string;
  title: string;
  poster: string;
  year: string;
  episodes: number;
  remarks: string;
}

function Rail({
  title,
  subtitle,
  moreHref,
  loading,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  moreHref?: string;
  loading: boolean;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className='mb-8'>
      <div className='mb-4 flex items-end justify-between gap-3'>
        <div>
          <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
            {title}
          </h2>
          {subtitle && (
            <p className='mt-1 text-xs text-gray-400 dark:text-gray-500'>
              {subtitle}
            </p>
          )}
        </div>
        {moreHref && (
          <Link
            href={moreHref}
            className='flex flex-shrink-0 items-center text-sm text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400'
          >
            查看更多
            <ArrowRight className='ml-1 h-4 w-4' />
          </Link>
        )}
      </div>
      {loading ? (
        <ScrollableRow>
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className='w-24 min-w-[96px] sm:w-44 sm:min-w-[180px]'
            >
              <div className='aspect-[2/3] w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800' />
              <div className='mt-2 h-4 animate-pulse rounded bg-gray-200 dark:bg-gray-800' />
            </div>
          ))}
        </ScrollableRow>
      ) : empty ? (
        <div className='rounded-xl border border-dashed border-gray-200 py-8 text-center text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500'>
          暂无数据
        </div>
      ) : (
        <ScrollableRow>{children}</ScrollableRow>
      )}
    </section>
  );
}

export default function HomeDiscovery() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [trending, setTrending] = useState<TrendingItem[]>([]);
  const [seasonAnime, setSeasonAnime] = useState<SeasonAnimeItem[]>([]);
  const [seasonLabel, setSeasonLabel] = useState('');
  const [shortDramas, setShortDramas] = useState<ShortDramaItem[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingAnime, setLoadingAnime] = useState(true);
  const [loadingShort, setLoadingShort] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch('/api/trending?limit=16', {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!cancelled) setTrending(Array.isArray(data?.items) ? data.items : []);
      } catch (error) {
        console.error('加载大家都在看失败', error);
      } finally {
        if (!cancelled) setLoadingTrending(false);
      }
    })();

    void (async () => {
      try {
        const response = await fetch('/api/season-anime?limit=16', {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!cancelled) {
          setSeasonAnime(Array.isArray(data?.items) ? data.items : []);
          setSeasonLabel(typeof data?.season === 'string' ? data.season : '');
        }
      } catch (error) {
        console.error('加载新番推荐失败', error);
      } finally {
        if (!cancelled) setLoadingAnime(false);
      }
    })();

    void (async () => {
      try {
        const response = await fetch('/api/short-drama/feed?tab=recommend&limit=16');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!cancelled) {
          setShortDramas(Array.isArray(data?.items) ? data.items : []);
        }
      } catch (error) {
        console.error('加载短剧热播失败', error);
      } finally {
        if (!cancelled) setLoadingShort(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const quickTitles = useMemo(() => {
    const titles = trending
      .map((item) => item.title)
      .filter(Boolean)
      .slice(0, 6);
    if (titles.length > 0) return titles;
    return ['谷雨', '漫长的季节', '繁花', '狂飙', '庆余年', '三体'];
  }, [trending]);

  const go = (mode: 'search' | 'ai') => {
    const text = query.trim();
    if (!text) return;
    const params = new URLSearchParams({ q: text });
    router.push(mode === 'ai' ? `/ai?${params}` : `/search?${params}`);
  };

  return (
    <div className='mb-10'>
      {/* 顶部搜索主视觉 */}
      <section className='relative mb-10 overflow-hidden rounded-3xl border border-emerald-400/20 bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 px-4 py-8 shadow-xl sm:px-8 sm:py-12'>
        <div className='pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl' />
        <div className='pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl' />
        <div className='relative mx-auto max-w-2xl text-center'>
          <h1 className='text-3xl font-black tracking-tight text-white sm:text-4xl'>
            看剧，不用想太久
          </h1>
          <p className='mt-2 text-sm text-emerald-100/70'>
            搜片名直达片源，或者让 AI 按口味挑一部
          </p>

          <form
            className='mt-6 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur'
            onSubmit={(event) => {
              event.preventDefault();
              go('search');
            }}
          >
            <Search className='ml-2 h-5 w-5 flex-shrink-0 text-emerald-200/70' />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder='今天你想看什么？'
              className='min-w-0 flex-1 bg-transparent px-1 text-sm text-white outline-none placeholder:text-emerald-100/40'
            />
            <button
              type='button'
              onClick={() => go('ai')}
              disabled={!query.trim()}
              className='hidden items-center gap-1.5 rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-40 sm:flex'
            >
              <Sparkles className='h-4 w-4' />
              AI 找剧
            </button>
            <button
              type='submit'
              disabled={!query.trim()}
              className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-emerald-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40'
              aria-label='搜索'
            >
              <ArrowRight className='h-5 w-5' />
            </button>
          </form>

          <div className='mt-4 flex flex-wrap items-center justify-center gap-2'>
            {quickTitles.map((title) => (
              <button
                key={title}
                onClick={() =>
                  router.push(`/search?q=${encodeURIComponent(title)}`)
                }
                className='rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-emerald-400/40 hover:text-white'
              >
                {title}
              </button>
            ))}
            <Link
              href='/ai'
              className='flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-400/20'
            >
              <Sparkles className='h-3.5 w-3.5' />
              和 AI 聊聊
            </Link>
          </div>
        </div>
      </section>

      {/* 大家都在看 */}
      <Rail
        title='大家都在看'
        subtitle='站内最近被反复打开的片子'
        loading={loadingTrending}
        empty={trending.length === 0}
      >
        {trending.map((item) => (
          <div
            key={`${item.source}-${item.id}`}
            className='w-24 min-w-[96px] sm:w-44 sm:min-w-[180px]'
          >
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
            {item.reason && (
              <div className='mt-1 truncate text-center text-[11px] text-gray-400 dark:text-gray-500'>
                {item.reason}
              </div>
            )}
          </div>
        ))}
      </Rail>

      {/* 新番推荐 */}
      <Rail
        title='新番推荐'
        subtitle={seasonLabel ? `${seasonLabel} · 正在放送` : '正在放送的番剧'}
        moreHref='/douban?type=anime'
        loading={loadingAnime}
        empty={seasonAnime.length === 0}
      >
        {seasonAnime.map((anime) => (
          <div
            key={anime.id}
            className='w-24 min-w-[96px] sm:w-44 sm:min-w-[180px]'
          >
            <VideoCard
              from='douban'
              title={anime.title}
              poster={anime.poster}
              douban_id={anime.id}
              rate={anime.rate}
              year={anime.year}
              isBangumi={true}
            />
            {anime.weekday_cn && (
              <div className='mt-1 text-center text-[11px] text-gray-400 dark:text-gray-500'>
                {anime.weekday_cn}
              </div>
            )}
          </div>
        ))}
      </Rail>

      {/* 短剧热播 */}
      <Rail
        title='短剧热播'
        subtitle='一集几分钟，停不下来'
        moreHref='/short-drama'
        loading={loadingShort}
        empty={shortDramas.length === 0}
      >
        {shortDramas.map((item) => (
          <div
            key={`${item.source}-${item.id}`}
            className='w-24 min-w-[96px] sm:w-44 sm:min-w-[180px]'
          >
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
      </Rail>
    </div>
  );
}
