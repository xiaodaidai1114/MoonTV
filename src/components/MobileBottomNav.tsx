/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Cat, Clapperboard, Clover, Compass, Film, Flame, Home, Library, Search, Sparkles, Trophy, Tv, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { memo, useEffect, useState } from 'react';

import { useNavigationLoading } from './NavigationLoadingProvider';

interface MobileBottomNavProps {
  /**
   * 主动指定当前激活的路径。当未提供时，自动使用 usePathname() 获取的路径。
   */
  activePath?: string;
}

const MobileBottomNav = ({ activePath }: MobileBottomNavProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { startLoading } = useNavigationLoading();

  // 当前激活路径：优先使用传入的 activePath，否则使用「路径 + 查询参数」。
  // 必须带上查询参数，否则 /douban?type=xxx 这类导航项永远无法匹配到激活状态。
  const searchQuery = searchParams?.toString() ?? '';
  const currentActive =
    activePath ?? (searchQuery ? `${pathname}?${searchQuery}` : pathname);

  // 片库弹层：把电影/剧集/短剧/纪录片/动漫/综艺收进一个入口
  const [libraryItems] = useState([
    { icon: Film, label: '电影', href: '/douban?type=movie' },
    { icon: Tv, label: '剧集', href: '/douban?type=tv' },
    { icon: Clapperboard, label: '短剧', href: '/short-drama' },
    { icon: Compass, label: '纪录片', href: '/douban?type=doc' },
    { icon: Cat, label: '动漫', href: '/douban?type=anime' },
    { icon: Clover, label: '综艺', href: '/douban?type=show' },
  ]);
  const [showLibrarySheet, setShowLibrarySheet] = useState(false);

  const [navItemsAll] = useState([
    { icon: Home, label: '首页', href: '/' },
    { icon: Search, label: '搜索', href: '/search' },
    { icon: Library, label: '片库', href: '#library' },
    {
      icon: Sparkles,
      label: 'AI找剧',
      href: '/ai',
    },
    {
      icon: Trophy,
      label: '榜单',
      href: '/ranking',
    },
    {
      icon: Flame,
      label: '专区',
      href: '/adult',
    },
  ]);

  // 成人专区只对管理员显示
  const [showAdultZone, setShowAdultZone] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/adult/auth', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) setShowAdultZone(data?.admin === true);
      } catch {
        // 取不到就当作没有权限
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const navItems = navItemsAll.filter(
    (item) => item.href !== '/adult' || showAdultZone
  );

  // 检查是否启用简洁模式 - 使用状态管理
  const [simpleMode, setSimpleMode] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    if (typeof window !== 'undefined') {
      const savedSimpleMode = localStorage.getItem('simpleMode');
      if (savedSimpleMode !== null) {
        setSimpleMode(JSON.parse(savedSimpleMode));
      }
    }
  }, []);

  const isActive = (href: string) => {
    // 解码URL以进行正确的比较
    const decodedActive = decodeURIComponent(currentActive);
    const decodedItemHref = decodeURIComponent(href);

    const [itemPath, itemQuery = ''] = decodedItemHref.split('?');
    const [activePath, activeQuery = ''] = decodedActive.split('?');

    // 带查询参数的导航项（如 /douban?type=movie）：先看完全匹配，
    // 再看路径一致且 type 一致（查询参数顺序可能不同）
    if (itemQuery) {
      if (decodedActive === decodedItemHref) return true;
      if (activePath !== itemPath) return false;
      const itemType = itemQuery.match(/type=([^&]+)/)?.[1] ?? '';
      const activeType =
        activeQuery.match(/type=([^&]+)/)?.[1] ??
        // /douban 未携带 type 时，页面默认展示电影
        (itemPath === '/douban' ? 'movie' : '');
      return itemType !== '' && itemType === activeType;
    }

    // 不带查询参数的导航项（如 /、/search、/ranking）：路径一致即视为激活
    return activePath === itemPath;
  };

  return (
    <>
      <nav
      className='md:hidden fixed left-0 right-0 z-[600] bg-white/90 backdrop-blur-xl border-t border-gray-200/50 overflow-hidden dark:bg-gray-900/80 dark:border-gray-700/50'
      style={{
        /* 紧贴视口底部，同时在内部留出安全区高度 */
        bottom: 0,
        paddingBottom: 'env(safe-area-inset-bottom)',
        minHeight: 'calc(3.5rem + env(safe-area-inset-bottom))',
      }}
    >
      <ul className='flex items-center overflow-x-auto scrollbar-hide'>
        {navItems.map((item) => {
          const active = isActive(item.href);

          // 简洁模式下只显示首页和搜索，但在服务器端渲染时先不渲染
          if (!isClient) {
            return null; // 服务器端渲染时不显示任何内容，避免闪烁
          }

          if (simpleMode && !['/', '/search'].includes(item.href)) {
            return null;
          }

          // 片库入口：点击弹出选择层
          if (item.href === '#library') {
            const libraryActive =
              pathname.startsWith('/douban') || pathname.startsWith('/short-drama');
            return (
              <li
                key={item.href}
                className='flex-shrink-0'
                style={{
                  width: simpleMode ? '50vw' : '20vw',
                  minWidth: simpleMode ? '50vw' : '20vw',
                }}
              >
                <button
                  className='flex flex-col items-center justify-center w-full h-14 gap-1 text-xs'
                  onClick={() => setShowLibrarySheet(true)}
                >
                  <item.icon
                    className={`h-6 w-6 ${
                      libraryActive
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  />
                  <span
                    className={
                      libraryActive
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-600 dark:text-gray-300'
                    }
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            );
          }

          return (
            <li
              key={item.href}
              className='flex-shrink-0'
              style={{
                width: simpleMode ? '50vw' : '20vw',
                minWidth: simpleMode ? '50vw' : '20vw',
              }}
            >
              <Link
                href={item.href}
                className='flex flex-col items-center justify-center w-full h-14 gap-1 text-xs'
                onClick={() => {
                  // 如果不是当前激活的链接，则触发加载动画
                  if (!active) {
                    startLoading();
                  }
                }}
              >
                <item.icon
                  className={`h-6 w-6 ${
                    active
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                />
                <span
                  className={
                    active
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-600 dark:text-gray-300'
                  }
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      </nav>

      {/* 片库选择弹层：必须挂在 nav 外面——nav 的 backdrop-blur + overflow-hidden
          会把 fixed 弹层裁剪成导航条大小，导致点击片库后出现白色小块、导航被盖住 */}
      {showLibrarySheet && (
        <div
          className='md:hidden fixed inset-0 z-[1000] bg-black/40'
          onClick={() => setShowLibrarySheet(false)}
        >
          <div
            className='absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white p-5 pb-8 dark:bg-gray-900'
            style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className='mb-4 flex items-center justify-between'>
              <h3 className='text-base font-semibold text-gray-800 dark:text-gray-200'>
                选择片库分类
              </h3>
              <button
                onClick={() => setShowLibrarySheet(false)}
                className='rounded-full p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                aria-label='关闭'
              >
                <X className='h-5 w-5' />
              </button>
            </div>
            <div className='grid grid-cols-3 gap-3'>
              {libraryItems.map((item) => {
                const decodedActive = decodeURIComponent(currentActive);
                const decodedHref = decodeURIComponent(item.href);
                const typeMatch = item.href.match(/type=([^&]+)/)?.[1];
                const active =
                  decodedActive === decodedHref ||
                  (decodedActive.startsWith('/douban') &&
                    !!typeMatch &&
                    decodedActive.includes(`type=${typeMatch}`)) ||
                  (item.href === '/short-drama' &&
                    decodedActive.startsWith('/short-drama'));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => {
                      setShowLibrarySheet(false);
                      if (!active) startLoading();
                    }}
                    className={`flex flex-col items-center gap-2 rounded-xl border py-4 text-xs font-medium transition-colors ${
                      active
                        ? 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    <Icon className='h-6 w-6' />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// 使用 React.memo 优化，避免父组件更新时导致不必要的重新渲染
export default memo(MobileBottomNav);
