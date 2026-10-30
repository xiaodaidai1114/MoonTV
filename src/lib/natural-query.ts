/* eslint-disable no-console */

/**
 * 自然语言查询解析（本地规则版，无需外部 LLM）
 * 把『最近心情不好，想看轻松搞笑的』这类自然语言整句，
 * 解析成可用于站内搜索的关键词，以及可用于豆瓣分类的推荐标签。
 */

export interface NaturalQueryRule {
  /** 命中的模式词（用于展示与调试） */
  keywords: string[];
  /** 建议搜索的片名关键词 */
  searchTerms: string[];
  /** 建议的豆瓣类型（tv/movie） */
  doubanType: 'tv' | 'movie';
  /** 建议的豆瓣标签 */
  doubanTag: string;
  /** 语义分组，便于前端归类展示 */
  group: 'mood' | 'genre' | 'scene' | 'audience';
}
export interface NaturalQueryResult {
  /** 是否被判定为自然语言长句（否则按普通关键词搜索） */
  isNatural: boolean;
  /** 原始输入 */
  original: string;
  /** 解析出的搜索关键词（去重后） */
  searchTerms: string[];
  /** 命中的语义标签 */
  matchedTags: string[];
  /** 推荐的豆瓣类型与标签 */
  suggestion: { type: 'tv' | 'movie'; tag: string } | null;
  /** 解析说明，用于界面提示 */
  explanation: string;
}

/** 语义规则表：模式词 → 搜索词与豆瓣标签 */
const RULES: Array<NaturalQueryRule & { patterns: string[] }> = [
  {
    patterns: ['轻松', '搞笑', '喜剧', '开心', '欢乐', '下饭', '沙雕', '心情不好', '治愈'],
    keywords: ['轻松 搞笑'],
    searchTerms: ['喜剧', '搞笑'],
    doubanType: 'movie',
    doubanTag: '喜剧',
    group: 'mood',
  },
  {
    patterns: ['恐怖', '惊悚', '刺激', '吓人'],
    keywords: ['恐怖 惊悚'],
    searchTerms: ['恐怖', '惊悚'],
    doubanType: 'movie',
    doubanTag: '恐怖',
    group: 'genre',
  },
  {
    patterns: ['爱情', '恋爱', '甜', '浪漫', '情侣'],
    keywords: ['爱情 浪漫'],
    searchTerms: ['爱情', '恋爱'],
    doubanType: 'movie',
    doubanTag: '爱情',
    group: 'genre',
  },
  {
    patterns: ['科幻', '太空', '未来', '宇宙'],
    keywords: ['科幻'],
    searchTerms: ['科幻'],
    doubanType: 'movie',
    doubanTag: '科幻',
    group: 'genre',
  },
  {
    patterns: ['悬疑', '烧脑', '推理', '反转'],
    keywords: ['悬疑 推理'],
    searchTerms: ['悬疑', '推理'],
    doubanType: 'movie',
    doubanTag: '悬疑',
    group: 'genre',
  },
  {
    patterns: ['动作', '打斗', '热血', '爽'],
    keywords: ['动作 热血'],
    searchTerms: ['动作'],
    doubanType: 'movie',
    doubanTag: '动作',
    group: 'genre',
  },
  {
    patterns: ['孩子', '小孩', '亲子', '合家欢', '动画', '动漫'],
    keywords: ['合家欢 动画'],
    searchTerms: ['动画', '亲子'],
    doubanType: 'movie',
    doubanTag: '动画',
    group: 'audience',
  },
  {
    patterns: ['老人', '父母', '爸妈', '长辈', '怀旧', '老片', '经典'],
    keywords: ['怀旧 经典'],
    searchTerms: ['年代', '经典'],
    doubanType: 'tv',
    doubanTag: '年代',
    group: 'audience',
  },
  {
    patterns: ['纪录片', '纪实', '真实', '科普'],
    keywords: ['纪录片'],
    searchTerms: ['纪录片'],
    doubanType: 'movie',
    doubanTag: '纪录片',
    group: 'genre',
  },
  {
    patterns: ['国产', '国剧', '国产剧', '国产电影'],
    keywords: ['国产'],
    searchTerms: ['国产'],
    doubanType: 'tv',
    doubanTag: '国产剧',
    group: 'genre',
  },
  {
    patterns: ['韩剧', '韩国'],
    keywords: ['韩剧'],
    searchTerms: ['韩剧'],
    doubanType: 'tv',
    doubanTag: '韩剧',
    group: 'genre',
  },
  {
    patterns: ['美剧', '美国'],
    keywords: ['美剧'],
    searchTerms: ['美剧'],
    doubanType: 'tv',
    doubanTag: '美剧',
    group: 'genre',
  },
  {
    patterns: ['日剧', '日本', '日漫'],
    keywords: ['日剧'],
    searchTerms: ['日剧'],
    doubanType: 'tv',
    doubanTag: '日剧',
    group: 'genre',
  },
  {
    patterns: ['高分', '口碑', '经典', '神作', '必看'],
    keywords: ['高分 口碑'],
    searchTerms: ['高分'],
    doubanType: 'movie',
    doubanTag: '豆瓣高分',
    group: 'mood',
  },
];

/** 判断是否像自然语言长句 */
function looksNatural(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // 含明显口语/意图词、句子较长、含标点
  const naturalMarkers = [
    '想看', '想找', '有没有', '推荐', '类似', '心情', '最近',
    '适合', '什么', '一个', '一部', '点', '些',
  ];
  if (naturalMarkers.some((m) => t.includes(m))) return true;
  if (/[，。！？、,.!?]/.test(t)) return true;
  // 中文超过 8 个字且没有空格，通常不是片名
  if (t.length > 8 && !t.includes(' ')) return true;
  return false;
}

/**
 * 解析自然语言查询
 */
export function parseNaturalQuery(input: string): NaturalQueryResult {
  const original = (input || '').trim();
  const isNatural = looksNatural(original);

  if (!original) {
    return {
      isNatural: false,
      original,
      searchTerms: [],
      matchedTags: [],
      suggestion: null,
      explanation: '',
    };
  }

  const matched = RULES.filter((rule) =>
    rule.patterns.some((p) => original.includes(p))
  );

  const searchTerms: string[] = [];
  const matchedTags: string[] = [];
  for (const rule of matched) {
    matchedTags.push(rule.keywords.join(' '));
    for (const term of rule.searchTerms) {
      if (!searchTerms.includes(term)) searchTerms.push(term);
    }
  }

  // 优先用 mood/genre 类的第一条规则作为豆瓣推荐建议
  const primary = matched.find((r) => r.group === 'mood') || matched[0];
  const suggestion = primary
    ? { type: primary.doubanType, tag: primary.doubanTag }
    : null;

  // 没有命中规则时，按普通关键词处理（去掉常见虚词）
  if (searchTerms.length === 0) {
    const cleaned = original
      .replace(/[，。！？、,.!?]/g, ' ')
      .replace(/想看|想找|有没有|推荐|类似|最近|心情|适合|什么/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned) searchTerms.push(cleaned);
  }

  const explanation =
    matchedTags.length > 0
      ? `已理解你的需求：${matchedTags.join('、')}`
      : isNatural
        ? '未匹配到明确偏好，已按关键词检索'
        : '';

  return {
    isNatural,
    original,
    searchTerms,
    matchedTags,
    suggestion,
    explanation,
  };
}
