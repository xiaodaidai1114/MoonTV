/**
 * 成人向内容识别词。
 *
 * 用法有两处：
 *  1. 站点默认屏蔽 —— 搜索/详情里 type_name 命中即过滤（DisableYellowFilter 为 false 时生效）；
 *  2. 成人专区 —— 只有命中这些词的条目才会出现在 /adult 页面。
 *
 * 词表按 type_name 做子串匹配，宁可多列一些上游常见分类名，避免漏网。
 */
export const yellowWords = [
  // 分类名直接标记
  '伦理片',
  '伦理',
  '理论片',
  '福利',
  '福利片',
  '福利视频',
  '色情',
  '色情片',
  '情色',
  '成人',
  '成人片',
  '三级',
  '三级片',
  '里番',
  '里番动漫',
  // 题材/标签
  '自拍',
  '偷拍',
  '乱伦',
  '强奸',
  '迷奸',
  '换妻',
  '门事件',
  '萝莉',
  '制服诱惑',
  '制服',
  '黑丝',
  '丝袜',
  '写真',
  '热舞',
  '激情',
  '挑逗',
  // 厂牌 / 平台
  '国产传媒',
  '传媒',
  '国产精品',
  '麻豆',
  'swag',
  'cosplay',
  '网红主播',
  '主播',
  '无码',
  '有码',
  '日本无码',
  '日本有码',
  '同性片',
  '欧美成人',
];

/** 成人专区默认关键词（每个关键词对应一次多源搜索） */
export const adultKeywords = [
  '伦理',
  '福利',
  '自拍',
  '偷拍',
  '无码',
  '里番',
  '三级',
  '主播',
  '写真',
  '麻豆',
];

/** 判断一条搜索结果的分类是否属于成人内容 */
export function isYellowResult(result: {
  type_name?: string;
  class?: string;
  title?: string;
}): boolean {
  const source = `${result.type_name || ''} ${result.class || ''}`.toLowerCase();
  if (!source.trim()) return false;
  return yellowWords.some((word) => source.includes(word.toLowerCase()));
}
