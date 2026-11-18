/**
 * 京东机房实测（2026-11-18）：这些源搜索接口在 1.5 秒内返回。
 * 播放时先用它们，失败再落到其余源，避免一上来就卡在慢源。
 */
export const PREFERRED_SOURCE_KEYS = new Set([
  'hghub-kanju',
  'juliang',
  'hongniuzy',
  'ffzyapi',
  'maoyanapi',
  'zy360',
  'hhzyapi',
  'jszyapi',
  'jyzyapi',
  'iqiyizyapi',
]);

export function isPreferredSource(source: string | undefined): boolean {
  return !!source && PREFERRED_SOURCE_KEYS.has(source);
}

export function sortSourcesByPriority<T extends { source: string }>(
  sources: T[]
): T[] {
  return sources
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const rankA = isPreferredSource(a.item.source) ? 0 : 1;
      const rankB = isPreferredSource(b.item.source) ? 0 : 1;
      if (rankA !== rankB) return rankA - rankB;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}
