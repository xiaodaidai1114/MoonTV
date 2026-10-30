/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '@/lib/db';

/**
 * 通知中心
 * 灵感来源：Seeker (觅影) 通知系统
 * 支持订阅更新、系统公告、下载完成等事件通知
 */

export type NotificationType = 'subscription' | 'system' | 'download' | 'info';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  desc: string;
  time: number;
  read: boolean;
}

const NOTIF_KEY = (user: string) => `notifications:${user}`;
const MAX_NOTIFICATIONS = 100;

/**
 * 获取用户通知列表
 */
export async function getNotifications(userName: string): Promise<NotificationItem[]> {
  try {
    const raw = await (db as any).get?.(NOTIF_KEY(userName));
    if (!raw) return [];
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * 保存通知列表
 */
async function saveNotifications(userName: string, items: NotificationItem[]): Promise<void> {
  try {
    await (db as any).set?.(NOTIF_KEY(userName), JSON.stringify(items));
  } catch (err) {
    console.error('[Notification] Save error:', err);
  }
}

/**
 * 添加通知
 */
export async function addNotification(
  userName: string,
  type: NotificationType,
  title: string,
  desc: string
): Promise<NotificationItem> {
  const items = await getNotifications(userName);
  const item: NotificationItem = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    title,
    desc,
    time: Date.now(),
    read: false,
  };
  items.unshift(item);
  if (items.length > MAX_NOTIFICATIONS) items.length = MAX_NOTIFICATIONS;
  await saveNotifications(userName, items);
  return item;
}

/**
 * 标记所有通知为已读
 */
export async function markAllRead(userName: string): Promise<void> {
  const items = await getNotifications(userName);
  items.forEach(i => i.read = true);
  await saveNotifications(userName, items);
}

/**
 * 清除所有通知
 */
export async function clearAllNotifications(userName: string): Promise<void> {
  await saveNotifications(userName, []);
}

/**
 * 获取未读通知数量
 */
export async function getUnreadCount(userName: string): Promise<number> {
  const items = await getNotifications(userName);
  return items.filter(i => !i.read).length;
}

/**
 * 广播系统通知（给所有用户）
 */
export async function broadcastNotification(
  users: string[],
  title: string,
  desc: string
): Promise<void> {
  for (const user of users) {
    await addNotification(user, 'system', title, desc);
  }
}

/**
 * 通知类型对应的图标名称（lucide-react）
 */
export function getNotificationIcon(type: NotificationType): string {
  switch (type) {
    case 'subscription': return 'BellRing';
    case 'system': return 'Settings';
    case 'download': return 'Download';
    case 'info': return 'Info';
    default: return 'Bell';
  }
}

/**
 * 格式化通知时间
 */
export function formatNotificationTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN');
}
