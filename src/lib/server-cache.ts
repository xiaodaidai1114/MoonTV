/* eslint-disable no-console */

/**
 * 轻量服务端内存缓存（进程内 Map + TTL）
 * 用于豆瓣等外部接口的查询结果缓存，减少重复回源带来的首屏等待。
 */

interface CacheEntry {
  value: unknown;
  expireAt: number;
}

const store = new Map<string, CacheEntry>();

/** 最大缓存条目数，超出后按插入顺序淘汰最早的一项 */
const MAX_ENTRIES = 500;

export function getCache<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expireAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCache<T>(key: string, value: T, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES && !store.has(key)) {
    const firstKey = store.keys().next().value;
    if (firstKey !== undefined) store.delete(firstKey);
  }
  store.set(key, { value, expireAt: Date.now() + ttlMs });
}

/**
 * 命中缓存直接返回，否则执行 loader 并写入缓存
 */
export async function withCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = getCache<T>(key);
  if (cached !== null) return cached;
  const value = await loader();
  setCache(key, value, ttlMs);
  return value;
}
