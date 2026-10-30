'use client';

import { useState, useEffect } from 'react';
import {
  Clock, Download, CheckCircle, XCircle, Ban, Trash2,
  RefreshCw, X, Film, Tv, Play
} from 'lucide-react';
import type { DownloadTask, TaskStatus } from '@/lib/task-queue';
import { getTaskStatusInfo } from '@/lib/task-queue';

interface TaskQueueProps {
  onClose?: () => void;
}

export default function TaskQueue({ onClose }: TaskQueueProps) {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = () => {
    fetch('/api/tasks')
      .then(res => res.json())
      .then(data => {
        setTasks(data.tasks || []);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleDelete = (id: string) => {
    fetch(`/api/tasks?id=${id}`, { method: 'DELETE' })
      .then(() => {
        setTasks(prev => prev.filter(t => t.id !== id));
      })
      .catch(() => { /* ignore */ });
  };

  const handleClearFinished = () => {
    fetch('/api/tasks?action=clear_finished', { method: 'DELETE' })
      .then(() => {
        setTasks(prev => prev.filter(t => t.status === 'pending' || t.status === 'downloading'));
      })
      .catch(() => { /* ignore */ });
  };

  const StatusIcon = ({ status }: { status: TaskStatus }) => {
    const info = getTaskStatusInfo(status);
    const icons: Record<string, React.ReactNode> = {
      Clock: <Clock className={`w-4 h-4 ${info.color}`} />,
      Download: <Download className={`w-4 h-4 ${info.color} animate-pulse`} />,
      CheckCircle: <CheckCircle className={`w-4 h-4 ${info.color}`} />,
      XCircle: <XCircle className={`w-4 h-4 ${info.color}`} />,
      Ban: <Ban className={`w-4 h-4 ${info.color}`} />,
      Circle: <Clock className={`w-4 h-4 ${info.color}`} />,
    };
    return <>{icons[info.icon] || icons.Circle}</>;
  };

  const finishedCount = tasks.filter(t => ['completed', 'failed', 'cancelled'].includes(t.status)).length;

  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/80 backdrop-blur overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-400" />
          <span className="font-medium text-zinc-100">任务队列</span>
          {tasks.length > 0 && (
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
              {tasks.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {finishedCount > 0 && (
            <button
              onClick={handleClearFinished}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800"
            >
              清除已完成
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Task List */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
            <Download className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm">暂无任务</span>
            <span className="text-xs mt-1">在播放页面可添加稍后观看任务</span>
          </div>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
            >
              {/* Cover */}
              {task.cover ? (
                <img
                  src={task.cover}
                  alt={task.title}
                  className="w-10 h-14 rounded object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-14 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  {task.episode_index > 1 || task.episode_index === 0 ? (
                    <Tv className="w-4 h-4 text-zinc-600" />
                  ) : (
                    <Film className="w-4 h-4 text-zinc-600" />
                  )}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-200 truncate">
                  {task.title}
                  {task.episode_index > 0 && ` · 第${task.episode_index}集`}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5 truncate">
                  {task.source_name}
                </div>
                {/* Progress bar */}
                {task.status === 'downloading' && task.progress > 0 && (
                  <div className="mt-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}
                {task.error && (
                  <div className="text-xs text-red-400 mt-0.5 truncate">{task.error}</div>
                )}
              </div>

              {/* Status + Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex items-center gap-1">
                  <StatusIcon status={task.status} />
                  <span className="text-xs text-zinc-500">
                    {getTaskStatusInfo(task.status).label}
                  </span>
                </div>
                {task.url && task.status === 'completed' && (
                  <a
                    href={`/play?q=${encodeURIComponent(task.search_title)}&source=${task.source}`}
                    className="p-1.5 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-blue-400"
                    title="播放"
                  >
                    <Play className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => handleDelete(task.id)}
                  className="p-1.5 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
