/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import AddDownloadModal from '@/components/AddDownloadModal';
import { BackButton } from '@/components/BackButton';
import CacheManager from '@/components/CacheManager';
import CommentPanel from '@/components/CommentPanel';
import DanmakuSelector from '@/components/DanmakuSelector';
import EpisodeSelector from '@/components/EpisodeSelector';
import PageLayout from '@/components/PageLayout';

import { PlayerOverlayHeader } from './components/PlayerOverlayHeader';
import {
  ErrorView,
  LoadingView,
  VideoLoadingMask,
} from './components/PlayStatusView';
import { VideoDetailPanel } from './components/VideoDetailPanel';
import { formatTime } from './play-utils';
import { usePlayEngine } from './usePlayEngine';

/** 避免点到浮层时把点击传到 ArtPlayer（会误触发播放/暂停） */
function stopPlayerPointer(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

/**
 * 播放页客户端组件。
 *
 * 仅负责：调用 {@link usePlayEngine} 获取状态/回调，并按视图分层渲染。
 * 加载、错误、视频遮罩、详情面板等均已拆分为独立展示组件。
 */
export default function PlayClient() {
  const router = useRouter();
  const [showAddDownload, setShowAddDownload] = useState(false);

  const {
    // 加载 / 错误
    loading,
    loadingStage,
    loadingMessage,
    error,
    // 视频与元数据
    detail,
    totalEpisodes,
    videoTitle,
    videoYear,
    videoDoubanId,
    currentSource,
    currentId,
    searchTitle,
    currentEpisodeIndex,
    videoUrl,
    skipConfig,
    // 播放器
    artRef,
    playerHost,
    preview,
    isVideoLoading,
    videoLoadingStage,
    setLoading,
    setIsVideoLoading,
    setVideoLoadingStage,
    // 源 / 换源
    availableSources,
    sourceSearchLoading,
    sourceSearchError,
    precomputedVideoInfo,
    preferBestSource,
    handleSourceChange,
    handleEpisodeChange,
    // 弹幕
    showDanmakuSelector,
    handleDanmakuSelect,
    handleDanmakuClose,
    // 缓存管理
    showCacheManager,
    setShowCacheManager,
    // 收藏 / 追更
    favorited,
    following,
    handleToggleFavorite,
    handleToggleFollowing,
  } = usePlayEngine();

  // 播放器内的弹窗（弹幕源 / 缓存管理）打开时锁住页面滚动，
  // 避免移动端未全屏时手指在遮罩上滑动仍然滚动到背后的页面内容。
  const isPlayerModalOpen = showDanmakuSelector || showCacheManager;

  useEffect(() => {
    if (!isPlayerModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPlayerModalOpen]);

  if (loading) {
    return (
      <PageLayout activePath='/play'>
        {/* 加载态也留一个返回入口：搜错片/等太久不想等时能直接退出去。
            用绝对定位覆盖，避免给整屏的加载视图额外撑出滚动条。 */}
        <div className='relative'>
          <div className='absolute left-3 top-3 z-10 lg:left-[5rem] lg:top-4 2xl:left-32'>
            <BackButton showLabel />
          </div>
          <LoadingView stage={loadingStage} message={loadingMessage} />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout activePath='/play'>
        <ErrorView
          message={error}
          videoTitle={videoTitle}
          onPrimary={() =>
            videoTitle
              ? router.push(`/search?q=${encodeURIComponent(videoTitle)}`)
              : router.back()
          }
          onRetry={() => window.location.reload()}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/play'>
      <div className='mx-auto w-full px-3 pb-6 md:max-w-[95%] md:px-0 md:pb-10'>
        {/* 播放器 + 选集 + 简介。手机上顺序接近 B 站：播放器、标题操作、选集、评论 */}
        <div className='-mx-3 overflow-hidden md:mx-0 md:mt-4 md:rounded-2xl md:bg-white md:shadow-sm md:ring-1 md:ring-black/5 lg:mt-6 dark:md:bg-white/[0.03] dark:md:ring-white/10'>
          <div className='flex flex-col md:grid md:grid-cols-4'>
            {/* 播放器 */}
            <div className='order-1 bg-black md:col-span-3 md:row-start-1'>
              <div
                className={`relative isolate w-full h-[56vw] max-h-[320px] min-h-[210px] md:h-[420px] lg:h-[520px] xl:h-[620px] ${
                  isPlayerModalOpen ? 'z-[1200]' : ''
                }`}
              >
                <div
                  ref={artRef}
                  className='bg-black w-full h-full overflow-hidden shadow-lg'
                ></div>
                {playerHost &&
                  createPortal(
                    <>
                      <PlayerOverlayHeader
                        title={
                          videoTitle
                            ? totalEpisodes > 1
                              ? `${videoTitle} · 第 ${
                                  currentEpisodeIndex + 1
                                } 集`
                              : videoTitle
                            : ''
                        }
                      />
                      {/* 进度预览：桌面跟随鼠标，移动端固定居中 */}
                      {preview?.visible && (
                        <div
                          className='moontv-progress-preview pointer-events-none absolute z-40'
                          style={{
                            left: `clamp(calc(5rem + 8px), ${preview.left}%, calc(100% - 5rem - 8px))`,
                            bottom:
                              'calc(var(--art-bottom-height, 52px) - 16px)',
                            transform: 'translateX(-50%)',
                          }}
                        >
                          <div className='relative h-[90px] w-40 overflow-hidden rounded-md bg-black shadow-xl ring-1 ring-white/20'>
                            {preview.image ? (
                              <img
                                src={preview.image}
                                alt=''
                                className='block h-full w-full max-w-none object-contain'
                                draggable={false}
                              />
                            ) : (
                              <div className='flex h-full w-full items-center justify-center bg-black/60 text-xs text-white/40'>
                                加载中…
                              </div>
                            )}
                            <span className='absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white'>
                              {formatTime(preview.time)}
                            </span>
                          </div>
                        </div>
                      )}
                      {/* 弹幕选择器 / 缓存管理 / 提示：挂进播放器节点，网页全屏与原生全屏都能看见 */}
                      {showDanmakuSelector && (
                        <div
                          className='moontv-player-modal'
                          onClick={stopPlayerPointer}
                          onMouseDown={stopPlayerPointer}
                        >
                          <DanmakuSelector
                            videoTitle={videoTitle}
                            isVisible={showDanmakuSelector}
                            currentEpisode={currentEpisodeIndex + 1}
                            currentEpisodeTitle={
                              detail?.episodes_titles?.[currentEpisodeIndex]
                            }
                            onSelect={handleDanmakuSelect}
                            onClose={handleDanmakuClose}
                          />
                        </div>
                      )}
                      <div
                        onClick={stopPlayerPointer}
                        onMouseDown={stopPlayerPointer}
                      >
                        <VideoLoadingMask
                          visible={isVideoLoading}
                          stage={videoLoadingStage}
                        />
                      </div>
                      {showCacheManager && (
                        <div
                          className='moontv-player-modal'
                          onClick={stopPlayerPointer}
                          onMouseDown={stopPlayerPointer}
                        >
                          <CacheManager
                            isOpen={showCacheManager}
                            onClose={() => setShowCacheManager(false)}
                          />
                        </div>
                      )}
                    </>,
                    playerHost
                  )}
              </div>
            </div>

            {/* 标题、收藏/分享、简介：紧贴播放器，和 B 站一样先看信息再选集 */}
            <div className='order-2 border-t border-black/5 px-3 py-3 md:col-span-3 md:row-start-2 md:border-t md:px-5 md:py-4 dark:border-white/10'>
              <VideoDetailPanel
                videoTitle={videoTitle}
                videoYear={videoYear}
                totalEpisodes={totalEpisodes}
                currentEpisodeIndex={currentEpisodeIndex}
                detail={detail}
                favorited={favorited}
                following={following}
                onToggleFavorite={handleToggleFavorite}
                onToggleFollowing={handleToggleFollowing}
                videoUrl={videoUrl}
                videoDoubanId={videoDoubanId}
                currentSource={currentSource}
                currentId={currentId}
                onDownload={() => setShowAddDownload(true)}
              />
            </div>

            {/* 选集和换源：手机横向滑，桌面在右侧 */}
            <div className='order-3 h-[200px] border-t border-black/5 md:col-start-4 md:row-start-1 md:h-[420px] md:overflow-hidden md:border-l md:border-t-0 lg:h-[520px] xl:h-[620px] dark:border-white/10'>
              <EpisodeSelector
                totalEpisodes={totalEpisodes}
                episodes_titles={detail?.episodes_titles || []}
                value={currentEpisodeIndex + 1}
                onChange={handleEpisodeChange}
                onSourceChange={handleSourceChange}
                currentSource={currentSource}
                currentId={currentId}
                videoTitle={searchTitle || videoTitle}
                availableSources={availableSources}
                sourceSearchLoading={sourceSearchLoading}
                sourceSearchError={sourceSearchError}
                precomputedVideoInfo={precomputedVideoInfo}
                preferBestSource={preferBestSource}
                setLoading={setLoading}
                setIsVideoLoading={setIsVideoLoading}
                setVideoLoadingStage={setVideoLoadingStage}
              />
            </div>
          </div>
        </div>

        {/* 评论单独一块，跟在选集后面 */}
        {currentSource && currentId && (
          <div className='mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 md:p-6 dark:bg-white/[0.03] dark:ring-white/10'>
            <CommentPanel
              source={currentSource}
              id={currentId}
              episode={currentEpisodeIndex + 1}
              videoTitle={videoTitle}
            />
          </div>
        )}
      </div>

      {/* 添加下载弹窗 */}
      <AddDownloadModal
        isOpen={showAddDownload}
        onClose={() => setShowAddDownload(false)}
        onAddTask={(config) => {
          // 触发自定义事件，通知导航栏的下载管理器
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('addDownloadTask', { detail: config })
            );
          }
          setShowAddDownload(false);
        }}
        initialUrl={videoUrl || ''}
        episodes={(detail?.episodes || []).map((url, i) => ({
          url,
          title: `${videoTitle}_${
            detail?.episodes_titles?.[i] || `第${i + 1}集`
          }`,
          label: detail?.episodes_titles?.[i] || `第${i + 1}集`,
        }))}
        currentEpisodeIndex={currentEpisodeIndex}
        initialTitle={`${videoTitle}${
          totalEpisodes > 1
            ? `_${
                detail?.episodes_titles?.[currentEpisodeIndex] ||
                `第${currentEpisodeIndex + 1}集`
              }`
            : ''
        }`}
        skipConfig={skipConfig}
      />
    </PageLayout>
  );
}
