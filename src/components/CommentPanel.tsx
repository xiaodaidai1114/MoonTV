/* eslint-disable no-console */

'use client';

import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import Swal from 'sweetalert2';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

interface VideoComment {
  cid: string;
  source: string;
  id: string;
  episode?: number;
  username: string;
  content: string;
  created_at: number;
}

interface CommentPanelProps {
  source: string;
  id: string;
  /** 当前播放集数（从 1 开始），用于在评论上标注「第几集」 */
  episode?: number;
  videoTitle?: string;
}

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export default function CommentPanel({
  source,
  id,
  episode,
  videoTitle,
}: CommentPanelProps) {
  const [comments, setComments] = useState<VideoComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(true);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myUsername, setMyUsername] = useState('');
  const [isPrivileged, setIsPrivileged] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const auth = getAuthInfoFromBrowserCookie();
    setMyUsername(auth?.username || '');
    setIsPrivileged(auth?.role === 'owner' || auth?.role === 'admin');
  }, []);

  const load = useCallback(async () => {
    if (!source || !id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ source, id });
      const res = await fetch(`/api/comments?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setComments(Array.isArray(data?.comments) ? data.comments : []);
      setSupported(data?.supported !== false);
    } catch (err) {
      console.error('加载评论失败', err);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [source, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(async () => {
    const content = input.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, id, episode, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      if (data?.comment) {
        setComments((prev) => [data.comment, ...prev]);
      }
      setInput('');
      inputRef.current?.focus();
    } catch (err) {
      console.error('发表评论失败', err);
      Swal.fire({
        icon: 'error',
        title: '发表失败',
        text: err instanceof Error ? err.message : '请稍后重试',
        timer: 2200,
        showConfirmButton: false,
      });
    } finally {
      setSubmitting(false);
    }
  }, [episode, id, input, source, submitting]);

  const remove = useCallback(
    async (cid: string) => {
      const { isConfirmed } = await Swal.fire({
        title: '删除这条评论？',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonColor: '#ef4444',
      });
      if (!isConfirmed) return;
      try {
        const res = await fetch('/api/comments', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, id, cid }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        setComments((prev) => prev.filter((item) => item.cid !== cid));
      } catch (err) {
        console.error('删除评论失败', err);
        Swal.fire({
          icon: 'error',
          title: '删除失败',
          text: err instanceof Error ? err.message : '请稍后重试',
          timer: 2200,
          showConfirmButton: false,
        });
      }
    },
    [id, source]
  );

  if (!source || !id) return null;

  return (
    <div className='mt-4'>
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-gray-200'>
          <MessageSquare className='h-4 w-4 text-green-600 dark:text-green-400' />
          评论
          {comments.length > 0 && (
            <span className='text-xs font-normal text-gray-400'>
              {comments.length} 条
            </span>
          )}
        </h3>
        {!loading && comments.length > 0 && (
          <button
            onClick={() => void load()}
            className='text-xs text-gray-400 hover:text-green-600 dark:hover:text-green-400'
          >
            刷新
          </button>
        )}
      </div>

      {/* 输入框 */}
      {supported && (
        <div className='rounded-xl border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-700 dark:bg-gray-800/40'>
          <textarea
            ref={inputRef}
            value={input}
            maxLength={500}
            rows={2}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={
              videoTitle
                ? `说说你对《${videoTitle}》的看法…（Ctrl + Enter 发送）`
                : '说点什么…（Ctrl + Enter 发送）'
            }
            className='w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-green-400 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-100'
          />
          <div className='mt-2 flex items-center justify-between'>
            <span className='text-xs text-gray-400'>
              {input.length}/500{episode ? ` · 将标注：第 ${episode} 集` : ''}
            </span>
            <button
              onClick={() => void submit()}
              disabled={!input.trim() || submitting}
              className='flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700'
            >
              <Send className='h-3.5 w-3.5' />
              {submitting ? '发布中…' : '发表评论'}
            </button>
          </div>
        </div>
      )}

      {/* 列表 */}
      <div className='mt-4 space-y-3'>
        {loading ? (
          <div className='py-6 text-center text-sm text-gray-400'>
            加载评论中…
          </div>
        ) : !supported ? (
          <div className='py-4 text-center text-xs text-gray-400'>
            当前存储模式不支持评论功能
          </div>
        ) : comments.length === 0 ? (
          <div className='py-4 text-center text-sm text-gray-400 dark:text-gray-500'>
            还没有评论，来说第一条吧
          </div>
        ) : (
          comments.map((comment) => {
            const canDelete =
              isPrivileged || (myUsername && comment.username === myUsername);
            return (
              <div
                key={comment.cid}
                className='flex items-start gap-3 rounded-xl px-1 py-2'
              >
                <div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-500/15 text-sm font-semibold text-green-700 dark:text-green-400'>
                  {(comment.username || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2 text-xs text-gray-400'>
                    <span className='font-medium text-gray-600 dark:text-gray-300'>
                      {comment.username}
                    </span>
                    <span>{formatTime(comment.created_at)}</span>
                    {comment.episode && comment.episode > 0 && (
                      <span className='rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400'>
                        第 {comment.episode} 集
                      </span>
                    )}
                  </div>
                  <p className='mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700 dark:text-gray-200'>
                    {comment.content}
                  </p>
                </div>
                {canDelete && (
                  <button
                    onClick={() => void remove(comment.cid)}
                    className='flex-shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-gray-600 dark:hover:bg-red-500/10'
                    title={isPrivileged && comment.username !== myUsername ? '管理员删除' : '删除'}
                  >
                    <Trash2 className='h-4 w-4' />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
