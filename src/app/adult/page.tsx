/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { adultCategories } from '@/lib/yellow';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

import type { SearchResult } from '@/lib/types';

interface AdultResponse {
  results?: SearchResult[];
  categories?: { id: string; label: string }[];
}

export default function AdultZonePage() {
  const [keyword, setKeyword] = useState(adultCategories[0].id);
  const [categories, setCategories] = useState(adultCategories.map(({ id, label }) => ({ id, label })));
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 口令门：locked 表示站点设置了口令，authorized 表示本次已通过
  const [gateReady, setGateReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(true);
  const [locked, setLocked] = useState(false);
  const [authorized, setAuthorized] = useState(true);
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/adult/auth', { cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        setIsAdmin(data.admin !== false);
        setLocked(Boolean(data.locked));
        setAuthorized(Boolean(data.authorized));
      } catch {
        if (!cancelled) setAuthorized(false);
      } finally {
        if (!cancelled) setGateReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password.trim()) return;
    setVerifying(true);
    setGateError(null);
    try {
      const res = await fetch('/api/adult/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });
      if (res.ok) {
        setAuthorized(true);
        setPassword('');
      } else {
        const data = await res.json().catch(() => ({}));
        setGateError(data.error || '口令不正确');
      }
    } catch {
      setGateError('网络错误，请重试');
    } finally {
      setVerifying(false);
    }
  };

  const catalogCache = useMemo(() => new Map<string, SearchResult[]>(), []);

  const load = useCallback(async (kw: string) => {
    const cached = catalogCache.get(kw);
    setError(null);
    if (cached) {
      setResults(cached);
      setLoading(false);
    } else {
      setLoading(true);
      setResults([]);
    }
    const seen = new Set<string>();
    const pushItems = (items: SearchResult[]) => {
      const fresh = items.filter((item) => {
        const key = `${item.source}|${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (fresh.length === 0) return;
      setResults((prev) => [...prev, ...fresh]);
      setLoading(false);
    };
    try {
      const res = await fetch(`/api/adult/feed?cat=${encodeURIComponent(kw)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`请求失败（HTTP ${res.status}）`);
      const data = (await res.json()) as AdultResponse;
      if (data.categories?.length) setCategories(data.categories);
      const list = data.results || [];
      if (list.length > 0) catalogCache.set(kw, list);
      if (!cached || list.length > 0) {
        seen.clear();
        setResults([]);
        pushItems(list);
      }
    } catch (err) {
      if (!cached) setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [catalogCache]);

  useEffect(() => {
    if (!gateReady || !authorized) return;
    void load(keyword);
  }, [keyword, load, gateReady, authorized]);

  useEffect(() => {
    if (!gateReady || !authorized) return;
    const timer = window.setTimeout(() => {
      for (const item of categories) {
        if (catalogCache.has(item.id)) continue;
        void fetch(`/api/adult/feed?cat=${encodeURIComponent(item.id)}`)
          .then(async (res) => {
            if (!res.ok) return;
            const data = (await res.json()) as AdultResponse;
            if (data.results?.length) catalogCache.set(item.id, data.results);
          })
          .catch(() => undefined);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [gateReady, authorized, categories, catalogCache]);

  const total = useMemo(() => results.length, [results]);

  if (gateReady && !isAdmin) {
    return (
      <PageLayout activePath='/adult'>
        <div className='flex min-h-[60vh] items-center justify-center px-4'>
          <div className='max-w-sm text-center'>
            <h1 className='text-xl font-bold text-gray-800 dark:text-gray-100'>
              无权访问
            </h1>
            <p className='mt-2 text-sm text-gray-500 dark:text-gray-400'>
              成人专区仅对管理员开放。
            </p>
            <a
              href='/'
              className='mt-6 inline-block rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700'
            >
              返回首页
            </a>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (gateReady && locked && !authorized) {
    return (
      <PageLayout activePath='/adult'>
        <div className='flex min-h-[60vh] items-center justify-center px-4 py-10'>
          <form
            onSubmit={submitPassword}
            className='w-full max-w-sm rounded-2xl bg-white/80 p-6 shadow-lg backdrop-blur dark:bg-zinc-900/80 dark:border dark:border-zinc-800'
          >
            <h1 className='text-center text-xl font-bold text-gray-800 dark:text-gray-100'>
              成人专区
            </h1>
            <p className='mt-2 text-center text-xs text-gray-500 dark:text-gray-400'>
              该专区需要访问口令，避免误入
            </p>
            <input
              type='password'
              inputMode='numeric'
              autoComplete='off'
              className='mt-5 w-full rounded-lg border-0 px-4 py-3 text-center text-lg tracking-widest text-gray-900 shadow-sm ring-1 ring-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-zinc-800 dark:text-gray-100 dark:ring-zinc-700'
              placeholder='请输入访问口令'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {gateError && (
              <p className='mt-3 text-sm text-red-600 dark:text-red-400'>
                {gateError}
              </p>
            )}
            <button
              type='submit'
              disabled={verifying || !password.trim()}
              className='mt-4 w-full rounded-lg bg-green-600 py-3 text-base font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50'
            >
              {verifying ? '校验中...' : '进入专区'}
            </button>
          </form>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/adult'>
      <div className='px-4 sm:px-10 py-4 sm:py-8'>
        <div className='mb-6'>
          <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-200'>
            成人专区
          </h1>
          <p className='mt-1 text-sm text-gray-600 dark:text-gray-400'>
            成人内容已从搜索与分类页隐藏，只在这里展示。仅限成年访客，内容来自第三方站点。
          </p>
        </div>

        {/* 关键词切换 */}
        <div className='mb-6 flex flex-wrap gap-2'>
          {categories.map((item) => (
            <button
              key={item.id}
              onClick={() => setKeyword(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                keyword === item.id
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200/70 text-gray-700 hover:bg-gray-300/70 dark:bg-gray-700/60 dark:text-gray-300 dark:hover:bg-gray-600/60'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && (
          <p className='mb-4 text-sm text-red-600 dark:text-red-400'>{error}</p>
        )}

        {loading ? (
          <div className='py-16 text-center'>
            <div className='mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-green-500' />
            <p className='mt-3 text-sm text-gray-500 dark:text-gray-400'>
              正在加载「{categories.find((item) => item.id === keyword)?.label || ''}」…
            </p>
          </div>
        ) : total === 0 ? (
          <div className='py-16 text-center text-gray-500 dark:text-gray-400'>
            这个关键词暂时没有内容，换一个试试。
          </div>
        ) : (
          <>
            <p className='mb-4 text-xs text-gray-500 dark:text-gray-400'>
              共 {total} 条 · 来自 {new Set(results.map((r) => r.source)).size}{' '}
              个源
            </p>
            <div className='grid grid-cols-3 gap-x-2 gap-y-12 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
              {results.map((item) => (
                <div key={`${item.source}-${item.id}`} className='w-full'>
                  <VideoCard
                    id={item.id}
                    title={item.title || ''}
                    poster={item.poster}
                    episodes={item.episodes ? item.episodes.length : 0}
                    source={item.source}
                    source_name={item.source_name}
                    year={item.year}
                    query={item.title || ''}
                    from='search'
                    adult
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}
