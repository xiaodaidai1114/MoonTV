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

/**
 * 成人专区栏目。词表来自星夜、乐播、森林、玉兔、滴滴、CK 的真实分类名，
 * 用来对上各源的 type_name，而不是只靠一个宽泛关键词去搜标题。
 */
export const adultCategories: { id: string; label: string; words: string[] }[] =
  [
    {
      id: 'domestic',
      label: '国产自拍',
      words: ['国产自拍', '国产视频', '国产色情', '国产精品', '国产专区', '自拍偷拍', '素人自拍', '探花'],
    },
    {
      id: 'media',
      label: '传媒',
      words: ['麻豆', '传媒', '天美', '精东', '糖心', 'swag', '91制片'],
    },
    {
      id: 'uncensored',
      label: '无码',
      words: ['无码', '日韩无码', '日本无码', '亚洲无码'],
    },
    {
      id: 'censored',
      label: '有码中字',
      words: ['有码', '中文字幕', '日本有码'],
    },
    {
      id: 'western',
      label: '欧美',
      words: ['欧美'],
    },
    {
      id: 'ethics',
      label: '伦理三级',
      words: ['伦理', '三级'],
    },
    {
      id: 'anime',
      label: '成人动漫',
      words: ['动漫', '卡通', '里番'],
    },
    {
      id: 'live',
      label: '主播',
      words: ['主播'],
    },
    {
      id: 'leak',
      label: '偷拍网曝',
      words: ['偷拍', '网曝', '吃瓜', '黑料'],
    },
    {
      id: 'uniform',
      label: '制服丝袜',
      words: ['制服', '丝袜', '黑丝'],
    },
    {
      id: 'wife',
      label: '人妻熟女',
      words: ['人妻', '熟女'],
    },
    {
      id: 'photo',
      label: '写真',
      words: ['写真'],
    },
  ];

/** 兼容旧引用 */
export const adultKeywords = adultCategories.map((item) => item.id);

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
