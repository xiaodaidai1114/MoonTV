/* eslint-disable no-console */

import { mapWithConcurrency } from '@/lib/concurrency';
import { getAvailableApiSites } from '@/lib/config';
import { searchFromApiStream } from '@/lib/downstream';
import { matchesSearchTitle } from '@/lib/search-title';
import type { SearchResult } from '@/lib/types';
import { isYellowResult } from '@/lib/yellow';

export interface AiChatCard {
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

export interface AiDoubanQuery {
  kind: 'movie' | 'tv';
  category: string;
  region: string;
  year: string;
  sort: string;
}

export interface AiChatResult {
  mode: 'title' | 'discover' | 'smalltalk';
  reply: string;
  cards: AiChatCard[];
  douban?: AiDoubanQuery;
  intent: {
    contentKind: 'movie' | 'tv' | 'anime' | 'show' | 'short' | 'doc';
    genre?: string;
    region?: string;
    year?: string;
    title?: string;
  };
  suggestions: string[];
}

const GENRE_WORDS: Array<{ word: string; category: string }> = [
  { word: '悬疑', category: '悬疑' },
  { word: '犯罪', category: '犯罪' },
  { word: '推理', category: '悬疑' },
  { word: '破案', category: '悬疑' },
  { word: '爱情', category: '爱情' },
  { word: '恋爱', category: '爱情' },
  { word: '甜', category: '爱情' },
  { word: '喜剧', category: '喜剧' },
  { word: '搞笑', category: '喜剧' },
  { word: '下饭', category: '喜剧' },
  { word: '科幻', category: '科幻' },
  { word: '恐怖', category: '恐怖' },
  { word: '惊悚', category: '惊悚' },
  { word: '动作', category: '动作' },
  { word: '打斗', category: '动作' },
  { word: '古装', category: '古装' },
  { word: '武侠', category: '武侠' },
  { word: '仙侠', category: '奇幻' },
  { word: '奇幻', category: '奇幻' },
  { word: '家庭', category: '家庭' },
  { word: '亲情', category: '家庭' },
  { word: '战争', category: '战争' },
  { word: '青春', category: '青春' },
  { word: '校园', category: '青春' },
  { word: '历史', category: '历史' },
  { word: '职场', category: '职场' },
  { word: '治愈', category: '剧情' },
  { word: '剧情', category: '剧情' },
  { word: '冒险', category: '冒险' },
  { word: '灾难', category: '灾难' },
  { word: '传记', category: '传记' },
  { word: '音乐', category: '音乐' },
  { word: '运动', category: '运动' },
  { word: '纪录片', category: '纪录片' },
  { word: '真人秀', category: '真人秀' },
  { word: '脱口秀', category: '脱口秀' },
];

const REGION_WORDS: Array<{ pattern: RegExp; region: string }> = [
  { pattern: /国产|大陆|内地/, region: '中国大陆' },
  { pattern: /韩剧|韩国|韩影/, region: '韩国' },
  { pattern: /日剧|日本|日影|日漫/, region: '日本' },
  { pattern: /美剧|美国|好莱坞|美影/, region: '美国' },
  { pattern: /港剧|香港|港片/, region: '中国香港' },
  { pattern: /台剧|台湾|台片/, region: '中国台湾' },
  { pattern: /泰剧|泰国/, region: '泰国' },
  { pattern: /英剧|英国/, region: '英国' },
  { pattern: /法剧|法国/, region: '法国' },
  { pattern: /印度/, region: '印度' },
];

const KIND_LABEL: Record<string, string> = {
  movie: '电影',
  tv: '剧集',
  anime: '动漫',
  show: '综艺',
  short: '短剧',
  doc: '纪录片',
};

function detectKind(text: string): AiChatResult['intent']['contentKind'] {
  if (/短剧|微短剧/.test(text)) return 'short';
  if (/动漫|番剧|动画|新番/.test(text)) return 'anime';
  if (/综艺|真人秀|脱口秀/.test(text)) return 'show';
  if (/纪录片/.test(text)) return 'doc';
  if (/电影|影片|片子/.test(text)) return 'movie';
  if (/剧|电视剧/.test(text)) return 'tv';
  return 'tv';
}

function extractTitle(text: string): string | undefined {
  const quoted = text.match(/[《「“"]([^》」”"]{1,30})[》」”"]/);
  if (quoted) return quoted[1].trim();

  // 「类似 XXX」中的作品名：允许片名里带「的」（如 漫长的季节），
  // 只按空格和句读截断，并去掉结尾的类型后缀。
  const similar = text.match(/(?:类似|像|差不多和)\s*([^\s，。！？]{2,20})/);
  if (similar) {
    return similar[1]
      .trim()
      .replace(/(?:的电影|的电视剧|的剧|的片子|的综艺|的动漫)$/, '')
      .trim();
  }

  // 整句就是一个片名（不含题材/地区/类型词）
  const compact = text.replace(/[\s，。！？?、]/g, '');
  if (
    compact.length >= 2 &&
    compact.length <= 12 &&
    !/推荐|找|搜|看|什么|有没有|哪部|好看|剧|电影|综艺|动漫|短剧|片/.test(compact)
  ) {
    return compact;
  }
  return undefined;
}

function extractYear(text: string): string {
  const explicit = text.match(/(19|20)\d{2}/);
  if (explicit) return explicit[0];
  if (/今年|本年/.test(text)) return String(new Date().getFullYear());
  if (/去年/.test(text)) return String(new Date().getFullYear() - 1);
  if (/前年/.test(text)) return String(new Date().getFullYear() - 2);
  return '';
}

export function parseChatIntent(text: string): AiChatResult['intent'] & {
  mode: AiChatResult['mode'];
  genre: string;
  region: string;
  year: string;
  sort: string;
} {
  const contentKind = detectKind(text);
  const genreWord = GENRE_WORDS.find((item) => text.includes(item.word));
  const genre = genreWord?.category || '';
  const region = REGION_WORDS.find((item) => item.pattern.test(text))?.region || '';
  const year = extractYear(text);
  const sort = /高分|评分|口碑|经典|神作/.test(text)
    ? 'S'
    : /最新|新上|刚出|新剧|新番/.test(text)
      ? 'R'
      : 'T';
  const title = extractTitle(text);

  const wantsDiscover =
    !!genre || !!region || /推荐|有什么|有哪些|找点|来点|好看的|片单|下饭|片荒|类似|像.*一样|差不多/.test(text);

  let mode: AiChatResult['mode'] = 'smalltalk';
  if (title) mode = 'title';
  else if (wantsDiscover) mode = 'discover';

  return {
    mode,
    contentKind,
    genre,
    region,
    year,
    sort,
    title,
  };
}

export function buildSuggestions(
  intent: ReturnType<typeof parseChatIntent>
): string[] {
  const kind = KIND_LABEL[intent.contentKind] || '剧集';
  const pool = [
    intent.genre ? `再来点高分的${intent.genre}${kind}` : `今晚有什么高分的${kind}`,
    intent.region ? `换个地区的${kind}` : '有没有下饭的喜剧',
    '给我来点烧脑悬疑',
    '最近有什么新出的好剧',
    '找一部适合全家一起看的电影',
  ];
  return Array.from(new Set(pool)).slice(0, 4);
}

/** 具体片名：直接到各视频源里找可播放入口。 */
export async function searchPlayableTitle(
  username: string | undefined,
  title: string,
  signal?: AbortSignal
): Promise<AiChatCard[]> {
  const sites = (await getAvailableApiSites(username)).filter(
    (site) => site.adult !== true
  );
  if (sites.length === 0) return [];

  const perSite = await mapWithConcurrency(sites, 8, async (site) => {
    const results: SearchResult[] = [];
    try {
      const generator = searchFromApiStream(site, title, true, 8000, signal);
      for await (const page of generator) {
        results.push(...page);
        if (results.length >= 20) break;
      }
    } catch {
      return [] as SearchResult[];
    }
    return results.filter(
      (result) =>
        result &&
        !isYellowResult(result) &&
        matchesSearchTitle(result.title || '', title) &&
        Array.isArray(result.episodes) &&
        result.episodes.length > 0
    );
  });

  const cards: AiChatCard[] = [];
  const seen = new Set<string>();
  perSite.flat().forEach((result) => {
    const key = `${result.source}+${result.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    cards.push({
      kind: 'source',
      id: result.id,
      source: result.source,
      source_name: result.source_name,
      title: result.title,
      poster: result.poster,
      year: result.year && result.year !== 'unknown' ? result.year : '',
      episodes: result.episodes.length,
      remarks: result.type_name || '',
    });
  });

  cards.sort((a, b) => {
    const ea = (a.episodes || 0) > 0 ? 1 : 0;
    const eb = (b.episodes || 0) > 0 ? 1 : 0;
    if (ea !== eb) return eb - ea;
    return (b.episodes || 0) - (a.episodes || 0);
  });

  return cards.slice(0, 12);
}

export function describeTitleResult(title: string, cards: AiChatCard[]): string {
  if (cards.length === 0) {
    return `我在片源里没找到《${title}》的可播放版本。可以换个片名、去掉副标题再试，或者直接去搜索页看看。`;
  }
  const sources = new Set(cards.map((card) => card.source_name).filter(Boolean));
  return `找到《${title}》了，${sources.size} 个片源可用，共 ${cards.length} 个入口。点下面的卡片就能开始看。`;
}

export function describeDiscover(
  intent: ReturnType<typeof parseChatIntent>
): string {
  const kind = KIND_LABEL[intent.contentKind] || '剧集';
  const parts: string[] = [];
  if (intent.region) parts.push(intent.region);
  if (intent.year) parts.push(intent.year);
  if (intent.genre) parts.push(intent.genre);
  const label = parts.join(' · ');
  const tail =
    intent.sort === 'S'
      ? '，按口碑排序'
      : intent.sort === 'R'
        ? '，按最新上线排序'
        : '，优先热门';
  if (label) {
    return `好，给你挑一些${label}${kind}${tail}。点开卡片后会自动在片源里找可播放的版本。`;
  }
  return `给你挑了几部最近值得看的${kind}${tail}。点开卡片后会自动在片源里找可播放的版本。`;
}

export function describeSmallTalk(): string {
  return '我帮你找片。可以直接说片名，也可以说想看什么类型，比如「高分悬疑韩剧」「下饭喜剧」「类似《漫长的季节》」。';
}
