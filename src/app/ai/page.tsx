/* eslint-disable no-console */

'use client';

import { ArrowUp, Sparkles, User } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { getDoubanRecommends } from '@/lib/douban.client';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

interface ChatCard {
  kind: 'source' | 'douban';
  title: string;
  poster: string;
  year: string;
  rate?: string;
  id?: string;
  source?: string;
  source_name?: string;
  episodes?: number;
  douban_id?: number;
  remarks?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  cards?: ChatCard[];
  suggestions?: string[];
  loading?: boolean;
}

interface DoubanQuery {
  kind: 'movie' | 'tv';
  category: string;
  region: string;
  year: string;
  sort: string;
}

interface ChatApiResponse {
  mode: 'title' | 'discover' | 'smalltalk';
  reply: string;
  cards?: ChatCard[];
  douban?: DoubanQuery;
  suggestions?: string[];
}

const WELCOME_SUGGESTIONS = [
  '推荐几部高分悬疑剧',
  '有没有下饭的喜剧',
  '找一部适合全家看的电影',
  '最近有什么新番',
];

let messageSeq = 0;
const nextId = () => `m${Date.now()}_${messageSeq++}`;

function AiChatClient() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '今天想看点什么？说片名我直接帮你找片源；说类型、地区或年份，我给你挑片单。',
      suggestions: WELCOME_SUGGESTIONS,
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const updateMessage = useCallback(
    (id: string, patch: Partial<ChatMessage>) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === id ? { ...message, ...patch } : message
        )
      );
    },
    []
  );

  const loadDoubanCards = useCallback(
    async (query: DoubanQuery): Promise<ChatCard[]> => {
      try {
        const result = await getDoubanRecommends({
          kind: query.kind,
          pageLimit: 12,
          pageStart: 0,
          category: query.category || 'all',
          format: 'all',
          label: 'all',
          region: query.region || 'all',
          year: query.year || 'all',
          platform: 'all',
          sort: query.sort || 'T',
        });
        if (!result?.list) return [];
        return result.list.slice(0, 12).map((item) => ({
          kind: 'douban' as const,
          title: item.title,
          poster: item.poster,
          year: item.year,
          rate: item.rate,
          douban_id: Number(item.id),
        }));
      } catch (err) {
        console.error('AI 片单加载失败', err);
        return [];
      }
    },
    []
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending) return;
      setSending(true);
      setInput('');

      const userMessage: ChatMessage = {
        id: nextId(),
        role: 'user',
        text,
      };
      const assistantId = nextId();
      const pending: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        text: '正在翻片库…',
        loading: true,
      };
      setMessages((prev) => [...prev, userMessage, pending]);

      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.error || `HTTP ${response.status}`);
        }
        const data = (await response.json()) as ChatApiResponse;

        let cards = data.cards || [];
        if (data.mode === 'discover' && data.douban) {
          cards = await loadDoubanCards(data.douban);
          if (cards.length === 0) {
            updateMessage(assistantId, {
              text: '这次没挑到合适的片单，换个说法我再试试？',
              loading: false,
              suggestions: data.suggestions,
            });
            return;
          }
        }

        updateMessage(assistantId, {
          text:
            data.mode === 'discover' && data.douban
              ? `${data.reply}`
              : data.reply,
          cards,
          suggestions: data.suggestions,
          loading: false,
        });
      } catch (err) {
        console.error('AI 找剧请求失败', err);
        updateMessage(assistantId, {
          text:
            err instanceof Error && err.message
              ? `出了点问题：${err.message}`
              : '出了点问题，稍后我再试一次。',
          loading: false,
          suggestions: WELCOME_SUGGESTIONS,
        });
      } finally {
        setSending(false);
      }
    },
    [loadDoubanCards, sending, updateMessage]
  );

  // 从首页带着关键词进来时自动发一条
  useEffect(() => {
    if (!initialQuery || autoSentRef.current) return;
    autoSentRef.current = true;
    void send(initialQuery);
  }, [initialQuery, send]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void send(input);
  };

  const renderCard = (card: ChatCard, index: number) => {
    if (card.kind === 'douban') {
      return (
        <div key={`d-${card.douban_id}-${index}`} className='w-full'>
          <VideoCard
            from='douban'
            title={card.title}
            poster={card.poster}
            rate={card.rate}
            year={card.year}
            douban_id={card.douban_id}
          />
        </div>
      );
    }
    return (
      <div key={`s-${card.source}-${card.id}-${index}`} className='w-full'>
        <VideoCard
          from='search'
          id={card.id}
          source={card.source}
          source_name={card.source_name}
          title={card.title}
          poster={card.poster}
          year={card.year}
          episodes={card.episodes}
          type={(card.episodes || 0) > 1 ? 'tv' : ''}
        />
      </div>
    );
  };

  return (
    <PageLayout>
      <div className='mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-4xl flex-col px-3 pb-40 pt-6 sm:px-6 md:pb-8'>
        <div className='mb-5 flex items-center gap-3'>
          <div className='flex h-10 w-10 items-center justify-center rounded-2xl bg-green-500/15 text-green-600 dark:text-green-400'>
            <Sparkles className='h-5 w-5' />
          </div>
          <div>
            <h1 className='text-lg font-bold text-gray-900 dark:text-gray-100'>
              AI 找剧
            </h1>
            <p className='text-xs text-gray-500 dark:text-gray-400'>
              说人话就能找片，自动匹配可播放的片源
            </p>
          </div>
        </div>

        <div className='flex-1 space-y-5'>
          {messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className='flex justify-end'>
                <div className='flex max-w-[85%] items-start gap-2'>
                  <div className='rounded-2xl rounded-tr-sm bg-green-600 px-4 py-2.5 text-sm text-white shadow-sm'>
                    {message.text}
                  </div>
                  <div className='mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'>
                    <User className='h-4 w-4' />
                  </div>
                </div>
              </div>
            ) : (
              <div key={message.id} className='flex items-start gap-2'>
                <div className='mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-600 dark:text-green-400'>
                  <Sparkles className='h-4 w-4' />
                </div>
                <div className='min-w-0 max-w-[92%] flex-1'>
                  <div className='rounded-2xl rounded-tl-sm border border-gray-200/70 bg-white px-4 py-3 text-sm leading-relaxed text-gray-700 shadow-sm dark:border-gray-700/60 dark:bg-gray-800/80 dark:text-gray-200'>
                    {message.loading ? (
                      <span className='inline-flex items-center gap-2 text-gray-500 dark:text-gray-400'>
                        <span className='h-2 w-2 animate-pulse rounded-full bg-green-500' />
                        {message.text}
                      </span>
                    ) : (
                      message.text
                    )}
                  </div>

                  {!!message.cards?.length && (
                    <div className='mt-3 grid grid-cols-3 gap-x-2 gap-y-6 sm:grid-cols-[repeat(auto-fill,_minmax(8.5rem,_1fr))] sm:gap-x-4'>
                      {message.cards.map(renderCard)}
                    </div>
                  )}

                  {!!message.suggestions?.length && (
                    <div className='mt-3 flex flex-wrap gap-2'>
                      {message.suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => void send(suggestion)}
                          disabled={sending}
                          className='rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:border-green-400 hover:text-green-600 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300'
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className='fixed inset-x-0 z-[550] mx-auto w-full max-w-4xl border-t border-gray-200 bg-white/95 p-2 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur bottom-[calc(3.5rem+env(safe-area-inset-bottom))] dark:border-gray-700 dark:bg-gray-900/95 md:static md:bottom-auto md:mt-5 md:rounded-2xl md:border md:shadow-lg'
        >
          <div className='flex items-end gap-2'>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              maxLength={200}
              placeholder='比如：想找一部高分悬疑韩剧 / 类似漫长的季节'
              className='max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl bg-transparent px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 dark:text-gray-100'
            />
            <button
              type='submit'
              disabled={!input.trim() || sending}
              className='flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-green-600 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700'
              aria-label='发送'
            >
              <ArrowUp className='h-5 w-5' />
            </button>
          </div>
        </form>
      </div>
    </PageLayout>
  );
}

export default function AiPage() {
  return (
    <Suspense>
      <AiChatClient />
    </Suspense>
  );
}
