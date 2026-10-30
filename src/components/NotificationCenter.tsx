'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, BellRing, X, Trash2, Settings, Download, Info } from 'lucide-react';
import type { NotificationItem, NotificationType } from '@/lib/notification';
import { formatNotificationTime } from '@/lib/notification';

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = () => {
    fetch('/api/notifications')
      .then(res => res.json())
      .then(data => {
        if (data.notifications) {
          setNotifications(data.notifications);
          setUnreadCount(data.unreadCount || 0);
        }
      })
      .catch(() => { /* ignore */ });
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // 每分钟刷新
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowPopup(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleMarkAllRead = () => {
    fetch('/api/notifications', { method: 'PUT' })
      .then(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
      })
      .catch(() => { /* ignore */ });
  };

  const handleClearAll = () => {
    fetch('/api/notifications', { method: 'DELETE' })
      .then(() => {
        setNotifications([]);
        setUnreadCount(0);
      })
      .catch(() => { /* ignore */ });
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'subscription': return <BellRing className="w-4 h-4 text-purple-400" />;
      case 'system': return <Settings className="w-4 h-4 text-blue-400" />;
      case 'download': return <Download className="w-4 h-4 text-green-400" />;
      case 'info': return <Info className="w-4 h-4 text-zinc-400" />;
      default: return <Bell className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div className="relative" ref={popupRef}>
      {/* Bell Button */}
      <button
        onClick={() => {
          setShowPopup(!showPopup);
          if (!showPopup && unreadCount > 0) {
            setTimeout(handleMarkAllRead, 2000);
          }
        }}
        className="relative p-2 rounded-lg hover:bg-zinc-800 transition-colors"
        aria-label="通知"
      >
        {unreadCount > 0 ? (
          <BellRing className="w-5 h-5 text-zinc-200" />
        ) : (
          <Bell className="w-5 h-5 text-zinc-400" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popup */}
      {showPopup && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 rounded-xl border border-zinc-700/50 bg-zinc-900/95 backdrop-blur shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <span className="font-medium text-zinc-100 text-sm">通知中心</span>
            <div className="flex items-center gap-2">
              {notifications.length > 0 && (
                <button
                  onClick={handleClearAll}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition-colors"
                  title="清除全部"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setShowPopup(false)}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-80">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-zinc-600">
                <Bell className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-sm">暂无通知</span>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`flex gap-3 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${
                    !notif.read ? 'bg-zinc-800/20' : ''
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">{getIcon(notif.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 font-medium truncate">{notif.title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{notif.desc}</div>
                    <div className="text-[10px] text-zinc-600 mt-1">{formatNotificationTime(notif.time)}</div>
                  </div>
                  {!notif.read && (
                    <div className="w-2 h-2 rounded-full bg-purple-400 flex-shrink-0 mt-1.5" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
