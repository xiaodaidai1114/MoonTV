/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 媒体类型智能推断
 * 灵感来源：Seeker (觅影) infer_media_type()
 * 从标题、集数、分类等字段推断影视类型（电影/电视剧）
 */

export type MediaType = 'movie' | 'tv';

/**
 * 电视剧匹配正则模式库
 */
const TV_PATTERNS = [
  /\bEP?\d{1,3}\b/i,
  /\bS\d{1,2}E\d{1,2}\b/i,
  /\bS\d{1,2}\b/i,
  /第\s*\d{1,3}\s*[集期話话]/,
  /全\s*\d{1,3}\s*[集期]/,
  /\b\d{1,3}\s*[集期]\b/,
  /\b(0[1-9]|[1-9]\d)\s*[. \-_)\]]/,
  /电视剧|剧集|动漫|国漫|美剧|日剧|韩剧|纪录片|综艺|动画|连续剧|番剧/,
];

/**
 * 电影匹配正则模式库
 */
const MOVIE_PATTERNS = [
  /电影|剧场版|院线|公映|导演剪辑|未删减|蓝光|BluRay|REMUX/i,
];

/**
 * 清洗标题中的干扰信息（年份、分辨率、格式等）
 */
function cleanText(text: string): string {
  return text
    .replace(/\b(19\d\d|20\d\d)\b/gi, '')
    .replace(/\b(1080p|2160p|720p|4k|8k|5\.1|7\.1|mkv|mp4|avi|x264|x265|h264|h265|hevc|10bit|SDR|HDR|DOLBY|ATMOS)\b/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/【.*?】/g, '')
    .trim();
}

/**
 * 从搜索结果推断媒体类型
 * @param title 影视标题
 * @param episodes 集数列表
 * @param typeName 分类名称（如 "动作片"、"电视剧"）
 * @param classValue class 字段
 */
export function inferMediaType(
  title: string,
  episodes?: string[] | number,
  typeName?: string,
  classValue?: string
): MediaType {
  const parts = [title || ''];
  if (typeName) parts.push(typeName);
  if (classValue) parts.push(classValue);
  const fullText = parts.join(' ');
  const cleaned = cleanText(fullText);

  // 优先检查电视剧模式
  for (const pat of TV_PATTERNS) {
    if (pat.test(cleaned)) return 'tv';
  }

  // 检查电影模式
  for (const pat of MOVIE_PATTERNS) {
    if (pat.test(cleaned)) return 'movie';
  }

  // 通过集数数量推断
  const epCount = typeof episodes === 'number' ? episodes : (episodes?.length ?? 0);
  if (epCount > 1) return 'tv';
  if (epCount === 1) return 'movie';

  // 通过分类名称推断
  if (typeName) {
    const tn = typeName.toUpperCase();
    if (tn.includes('电影') || tn.includes('MOVIE') || tn.includes('片')) return 'movie';
    if (tn.includes('剧') || tn.includes('TV') || tn.includes('综艺') || tn.includes('动漫')) return 'tv';
  }

  // 默认按电视剧处理（资源站中电视剧占比通常更高）
  return 'tv';
}

/**
 * 批量标注搜索结果的媒体类型
 */
export function annotateMediaType(results: any[]): any[] {
  return results.map((r) => ({
    ...r,
    media_type: inferMediaType(
      r.title || r.vod_name || '',
      r.episodes,
      r.type_name,
      r.class
    ),
  }));
}

/**
 * 获取媒体类型的中文标签
 */
export function getMediaTypeLabel(type: MediaType): string {
  return type === 'movie' ? '电影' : '电视剧';
}

/**
 * 获取媒体类型的图标名称（lucide-react）
 */
export function getMediaTypeIcon(type: MediaType): string {
  return type === 'movie' ? 'Film' : 'Tv';
}
