/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '@/lib/db';

/**
 * 下载任务队列
 * 灵感来源：Seeker (觅影) 下载任务管理
 * 适配 LunaTV 的轻量级「稍后观看 / 缓存标记」场景
 */

export type TaskStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
export type TaskType = 'cache' | 'download' | 'watch_later';

export interface DownloadTask {
  id: string;
  type: TaskType;
  title: string;
  search_title: string;
  source: string;
  source_name: string;
  episode_index: number;
  episode_title: string;
  url: string;
  cover: string;
  year: string;
  status: TaskStatus;
  progress: number;
  created_at: number;
  updated_at: number;
  user: string;
  error?: string;
}

const TASK_KEY = (user: string) => `download_tasks:${user}`;
const MAX_TASKS = 200;

/**
 * 获取用户任务列表
 */
export async function getTasks(userName: string): Promise<DownloadTask[]> {
  try {
    const raw = await (db as any).get?.(TASK_KEY(userName));
    if (!raw) return [];
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * 保存任务列表
 */
async function saveTasks(userName: string, tasks: DownloadTask[]): Promise<void> {
  try {
    await (db as any).set?.(TASK_KEY(userName), JSON.stringify(tasks));
  } catch (err) {
    console.error('[TaskQueue] Save error:', err);
  }
}

/**
 * 添加任务
 */
export async function addTask(
  userName: string,
  task: Omit<DownloadTask, 'id' | 'created_at' | 'updated_at' | 'user' | 'status' | 'progress'>
): Promise<DownloadTask> {
  const tasks = await getTasks(userName);
  // 去重：相同标题+集数不重复添加
  const exists = tasks.find(
    t => t.search_title === task.search_title &&
         t.episode_index === task.episode_index &&
         t.status !== 'cancelled' &&
         t.status !== 'failed'
  );
  if (exists) return exists;

  const newTask: DownloadTask = {
    ...task,
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    status: 'pending',
    progress: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
    user: userName,
  };
  tasks.unshift(newTask);
  if (tasks.length > MAX_TASKS) tasks.length = MAX_TASKS;
  await saveTasks(userName, tasks);
  return newTask;
}

/**
 * 删除任务
 */
export async function removeTask(userName: string, taskId: string): Promise<void> {
  const tasks = await getTasks(userName);
  const filtered = tasks.filter(t => t.id !== taskId);
  await saveTasks(userName, filtered);
}

/**
 * 更新任务状态
 */
export async function updateTaskStatus(
  userName: string,
  taskId: string,
  status: TaskStatus,
  progress?: number,
  error?: string
): Promise<void> {
  const tasks = await getTasks(userName);
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    task.status = status;
    task.updated_at = Date.now();
    if (progress !== undefined) task.progress = progress;
    if (error) task.error = error;
    await saveTasks(userName, tasks);
  }
}

/**
 * 获取指定状态的任务
 */
export async function getTasksByStatus(
  userName: string,
  status: TaskStatus
): Promise<DownloadTask[]> {
  const tasks = await getTasks(userName);
  return tasks.filter(t => t.status === status);
}

/**
 * 清除已完成/已取消/已失败的任务
 */
export async function clearFinishedTasks(userName: string): Promise<void> {
  const tasks = await getTasks(userName);
  const active = tasks.filter(
    t => t.status === 'pending' || t.status === 'downloading'
  );
  await saveTasks(userName, active);
}

/**
 * 任务状态对应的图标和颜色
 */
export function getTaskStatusInfo(status: TaskStatus): { icon: string; color: string; label: string } {
  switch (status) {
    case 'pending': return { icon: 'Clock', color: 'text-yellow-500', label: '等待中' };
    case 'downloading': return { icon: 'Download', color: 'text-blue-500', label: '进行中' };
    case 'completed': return { icon: 'CheckCircle', color: 'text-green-500', label: '已完成' };
    case 'failed': return { icon: 'XCircle', color: 'text-red-500', label: '失败' };
    case 'cancelled': return { icon: 'Ban', color: 'text-gray-500', label: '已取消' };
    default: return { icon: 'Circle', color: 'text-gray-400', label: '未知' };
  }
}
