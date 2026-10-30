'use client';

import { useState, useEffect } from 'react';
import { Bell, BellRing, Trash2, Tv, Film, RefreshCw, X, AlertCircle } from 'lucide-react';
import type { Subscription, SubscriptionUpdate } from '@/lib/subscription';

interface SubscriptionManagerProps {
  onClose?: () => void;
}

export default function SubscriptionManager({ onClose }: SubscriptionManagerProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [updates, setUpdates] = useState<SubscriptionUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    fetch('/api/subscription')
      .then(res => res.json())
      .then(data => {
        setSubscriptions(data.subscriptions || []);
        setUpdates(data.updates || []);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = (id: string) => {
    fetch(`/api/subscription?id=${id}`, { method: 'DELETE' })
      .then(() => {
        setSubscriptions(prev => prev.filter(s => s.id !== id));
      })
      .catch(() => { /* ignore */ });
  };

  const handleClearUpdates = () => {
    fetch('/api/subscription?action=clear_updates', { method: 'DELETE' })
      .then(() => setUpdates([]))
      .catch(() => { /* ignore */ });
  };

  return (
    <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/80 backdrop-blur overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <BellRing className="w-5 h-5 text-purple-400" />
          <span className="font-medium text-zinc-100">追剧订阅</span>
          {subscriptions.length > 0 && (
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
              {subscriptions.length}
            </span>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-800 text-zinc-500">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Updates Banner */}
      {updates.length > 0 && (
        <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-purple-300 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {updates.length} 条更新通知
            </span>
            <button
              onClick={handleClearUpdates}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              清除
            </button>
          </div>
          <div className="space-y-1 max-h-24 overflow-y-auto">
            {updates.slice(0, 5).map((u, i) => (
              <div key={i} className="text-xs text-zinc-400">
                📺 {u.title}：第 {u.old_episode} → {u.new_episode} 集
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subscription List */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
            <Bell className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm">暂无订阅</span>
            <span className="text-xs mt-1">在播放页面点击订阅按钮即可追剧</span>
          </div>
        ) : (
          subscriptions.map((sub) => (
            <div
              key={sub.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
            >
              {/* Cover */}
              {sub.cover ? (
                <img
                  src={sub.cover}
                  alt={sub.title}
                  className="w-10 h-14 rounded object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-14 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  {sub.total_episodes > 1 ? <Tv className="w-4 h-4 text-zinc-600" /> : <Film className="w-4 h-4 text-zinc-600" />}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-200 truncate">{sub.title}</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {sub.year} · {sub.source_name}
                </div>
                <div className="text-xs text-zinc-600 mt-0.5">
                  已观看 {sub.last_episode} 集
                  {sub.total_episodes > 0 && ` / 共 ${sub.total_episodes} 集`}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(sub.id)}
                className="p-1.5 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
