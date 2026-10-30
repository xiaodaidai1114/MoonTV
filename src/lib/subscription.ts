/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '@/lib/db';

/**
 * 追剧订阅系统
 * 灵感来源：Seeker (觅影) 订阅与增量追更
 * 适配 LunaTV 的 Redis 存储和苹果CMS资源站生态
 */

export interface Subscription {
  id: string;
  title: string;
  search_title: string;
  cover: string;
  year: string;
  source: string;
  source_name: string;
  last_episode: number;
  total_episodes: number;
  created_at: number;
  updated_at: number;
  user: string;
}

export interface SubscriptionUpdate {
  subscription_id: string;
  title: string;
  old_episode: number;
  new_episode: number;
  new_sources: string[];
  detected_at: number;
}

const SUB_KEY = (user: string) => `subscriptions:${user}`;
const UPDATE_KEY = (user: string) => `subscription_updates:${user}`;

/**
 * 获取用户订阅列表
 */
export async function getSubscriptions(userName: string): Promise<Subscription[]> {
  try {
    const raw = await (db as any).get?.(SUB_KEY(userName));
    if (!raw) return [];
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * 保存用户订阅列表
 */
async function saveSubscriptions(userName: string, subs: Subscription[]): Promise<void> {
  try {
    await (db as any).set?.(SUB_KEY(userName), JSON.stringify(subs));
  } catch (err) {
    console.error('[Subscription] Save error:', err);
  }
}

/**
 * 添加订阅
 */
export async function addSubscription(
  userName: string,
  sub: Omit<Subscription, 'id' | 'created_at' | 'updated_at' | 'user'>
): Promise<Subscription> {
  const subs = await getSubscriptions(userName);
  // 去重：相同标题+年份不重复订阅
  const exists = subs.find(s => s.search_title === sub.search_title && s.year === sub.year);
  if (exists) return exists;

  const newSub: Subscription = {
    ...sub,
    id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: Date.now(),
    updated_at: Date.now(),
    user: userName,
  };
  subs.push(newSub);
  await saveSubscriptions(userName, subs);
  return newSub;
}

/**
 * 删除订阅
 */
export async function deleteSubscription(userName: string, subId: string): Promise<void> {
  const subs = await getSubscriptions(userName);
 const filtered = subs.filter(s => s.id !== subId);
  await saveSubscriptions(userName, filtered);
}

/**
 * 更新订阅的最新集数
 */
export async function updateSubscriptionEpisode(
  userName: string,
  subId: string,
  newEpisode: number
): Promise<void> {
  const subs = await getSubscriptions(userName);
  const sub = subs.find(s => s.id === subId);
  if (sub && newEpisode > sub.last_episode) {
    sub.last_episode = newEpisode;
    sub.updated_at = Date.now();
    await saveSubscriptions(userName, subs);
  }
}

/**
 * 获取订阅更新通知
 */
export async function getSubscriptionUpdates(userName: string): Promise<SubscriptionUpdate[]> {
  try {
    const raw = await (db as any).get?.(UPDATE_KEY(userName));
    if (!raw) return [];
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * 添加订阅更新通知
 */
async function addSubscriptionUpdate(userName: string, update: SubscriptionUpdate): Promise<void> {
  const updates = await getSubscriptionUpdates(userName);
  // 保留最近 50 条
  updates.unshift(update);
  if (updates.length > 50) updates.length = 50;
  try {
    await (db as any).set?.(UPDATE_KEY(userName), JSON.stringify(updates));
  } catch (err) {
    console.error('[Subscription] Update notification error:', err);
  }
}

/**
 * 清除订阅更新通知
 */
export async function clearSubscriptionUpdates(userName: string): Promise<void> {
  try {
    await (db as any).set?.(UPDATE_KEY(userName), '[]');
  } catch {
    // ignore
  }
}

/**
 * 检查单个订阅是否有新集数更新
 * 在 cron 任务中调用
 */
export async function checkSubscriptionUpdate(
  userName: string,
  sub: Subscription,
  searchResults: any[]
): Promise<SubscriptionUpdate | null> {
  // 找到匹配的搜索结果
  const matched = searchResults.find(
    (r) => r.title === sub.title || r.vod_name === sub.title
  );
  if (!matched) return null;

  const currentEpisodes = matched.episodes?.length || 0;
  if (currentEpisodes > sub.last_episode) {
    const update: SubscriptionUpdate = {
      subscription_id: sub.id,
      title: sub.title,
      old_episode: sub.last_episode,
      new_episode: currentEpisodes,
      new_sources: matched.source ? [matched.source_name || matched.source] : [],
      detected_at: Date.now(),
    };
    await updateSubscriptionEpisode(userName, sub.id, currentEpisodes);
    await addSubscriptionUpdate(userName, update);
    return update;
  }
  return null;
}
