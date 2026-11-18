/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import { ChevronDown, Download, Heart, Share2 } from 'lucide-react';
import { useState } from 'react';

import { SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

import { FollowingIconButton } from '@/components/FollowingIcon';

interface VideoDetailPanelProps {
  videoTitle: string;
  videoYear: string;
  totalEpisodes: number;
  currentEpisodeIndex: number;
  detail: SearchResult | null;
  favorited: boolean;
  following: boolean;
  onToggleFavorite: () => void;
  onToggleFollowing: () => void;
  videoUrl: string;
  videoDoubanId: number;
  currentSource: string;
  currentId: string;
  onDownload: () => void;
}

/**
 * 播放页下方的影片标题、操作按钮与简介区域。
 */
export function VideoDetailPanel(props: VideoDetailPanelProps) {
  const {
    videoTitle,
    videoYear,
    totalEpisodes,
    currentEpisodeIndex,
    detail,
    favorited,
    following,
    onToggleFavorite,
    onToggleFollowing,
    videoUrl,
    videoDoubanId,
    currentSource,
    currentId,
    onDownload,
  } = props;
  const [introOpen, setIntroOpen] = useState(false);
  const [shareTip, setShareTip] = useState('');
  const episodeLabel =
    totalEpisodes > 1
      ? detail?.episodes_titles?.[currentEpisodeIndex] ||
        `第 ${currentEpisodeIndex + 1} 集`
      : '';

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: videoTitle || '影片', url });
        return;
      }
    } catch {
      // 用户取消系统分享时静默
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareTip('链接已复制');
      window.setTimeout(() => setShareTip(''), 1600);
    } catch {
      setShareTip('复制失败');
    }
  };

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-start gap-3'>
        {detail?.poster && (
          <img
            src={processImageUrl(detail.poster)}
            alt=''
            className='hidden h-16 w-12 flex-shrink-0 rounded-md object-cover md:block'
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        <div className='min-w-0 flex-1'>
          <h1 className='text-lg font-bold leading-snug text-gray-900 sm:text-xl dark:text-gray-100'>
            {videoTitle || '影片标题'}
            {episodeLabel && (
              <span className='ml-2 text-base font-medium text-gray-500 dark:text-gray-400'>
                {episodeLabel}
              </span>
            )}
          </h1>
          <div className='mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400'>
            {(detail?.year || videoYear) && <span>{detail?.year || videoYear}</span>}
            {detail?.type_name && <span>· {detail.type_name}</span>}
            {detail?.class && <span>· {detail.class}</span>}
            {detail?.source_name && <span>· {detail.source_name}</span>}
            {totalEpisodes > 1 && <span>· 共 {totalEpisodes} 集</span>}
          </div>
        </div>
      </div>

      <div className='flex items-start justify-around gap-1 border-y border-black/5 py-2.5 sm:justify-start sm:gap-6 dark:border-white/10'>
        <button
          type='button'
          onClick={onToggleFavorite}
          className={`flex min-w-[3.2rem] flex-col items-center gap-1 text-xs ${
            favorited ? 'text-pink-500' : 'text-gray-600 dark:text-gray-300'
          }`}
        >
          <Heart className={`h-5 w-5 ${favorited ? 'fill-current' : ''}`} />
          {favorited ? '已收藏' : '收藏'}
        </button>
        {currentSource && currentId && (
          <div className='flex min-w-[3.2rem] flex-col items-center gap-1 text-xs text-gray-600 dark:text-gray-300'>
            <FollowingIconButton
              following={following}
              size={20}
              padding={0}
              theme='detail'
              onClick={(e) => {
                e.stopPropagation();
                onToggleFollowing();
              }}
            />
            <span className={following ? 'text-green-600 dark:text-green-400' : ''}>
              {following ? '已追更' : '追更'}
            </span>
          </div>
        )}
        {videoUrl && (
          <button
            type='button'
            onClick={onDownload}
            className='flex min-w-[3.2rem] flex-col items-center gap-1 text-xs text-gray-600 dark:text-gray-300'
          >
            <Download className='h-5 w-5' />
            下载
          </button>
        )}
        <button
          type='button'
          onClick={() => void share()}
          className='flex min-w-[3.2rem] flex-col items-center gap-1 text-xs text-gray-600 dark:text-gray-300'
        >
          <Share2 className='h-5 w-5' />
          {shareTip || '分享'}
        </button>
        {videoDoubanId !== 0 && (
          <a
            href={`https://movie.douban.com/subject/${videoDoubanId.toString()}`}
            target='_blank'
            rel='noopener noreferrer'
            className='flex min-w-[3.2rem] flex-col items-center gap-1 text-xs text-gray-600 dark:text-gray-300'
          >
            <span className='flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white'>
              豆
            </span>
            豆瓣
          </a>
        )}
      </div>

      {detail?.desc && (
        <div className='rounded-xl bg-black/[0.03] px-3 py-2.5 dark:bg-white/[0.04]'>
          <button
            type='button'
            onClick={() => setIntroOpen((open) => !open)}
            className='flex w-full items-center justify-between text-sm font-medium text-gray-800 dark:text-gray-100'
          >
            简介
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${introOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <p
            className={`mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-600 dark:text-gray-300 ${
              introOpen ? '' : 'line-clamp-2'
            }`}
          >
            {detail.desc}
          </p>
        </div>
      )}
    </div>
  );
}
