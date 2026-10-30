/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * AI 智能选片引擎
 * 灵感来源：Seeker (觅影) gemini_brain.py
 * 适配 LunaTV 的苹果CMS资源站搜索结果
 */

// ============ 类型定义 ============

export interface AiTierItem {
  id: string;
  tag: string;
  label: string;
  resolution: string;
  estimated_size: string;
  highlight: string;
  is_default: boolean;
  source_key?: string;
  source_name?: string;
}

export interface AiRecommendation {
  best_resource_id: string;
  media_type: 'movie' | 'tv';
  normalized_title: string;
  season?: number;
  year: string;
  resolution: string;
  estimated_size: string;
  quality_score: number;
  recommend_reason: string;
  viewing_tip?: string;
  recommended_tiers: AiTierItem[];
  is_tv: boolean;
  engine: 'gemini' | 'rule_fallback';
}

export interface AiConfig {
  enabled: boolean;
  api_key: string;
  model: string;
  proxy: string;
  base_url: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: false,
  api_key: '',
  model: 'gemini-1.5-flash',
  proxy: '',
  base_url: 'https://generativelanguage.googleapis.com/v1beta',
};

// ============ 媒体类型推断 ============

/**
 * 从标题和文件名推断媒体类型（电影/电视剧）
 * 移植自 Seeker infer_media_type()
 */
export function inferMediaType(
  title: string,
  episodes?: string[],
  typeName?: string
): 'movie' | 'tv' {
  const parts = [title || ''];
  if (episodes) parts.push(...episodes);
  if (typeName) parts.push(typeName);
  const fullText = parts.join(' ');

  // 清洗干扰信息
  const cleanText = fullText
    .replace(/\b(19\d\d|20\d\d)\b/gi, '')
    .replace(/\b(1080p|2160p|720p|4k|8k|5\.1|7\.1|mkv|mp4|avi)\b/gi, '');

  const tvPatterns = [
    /\bEP?\d{1,3}\b/i,
    /\bS\d{1,2}E\d{1,2}\b/i,
    /第\s*\d{1,3}\s*[集期話话]/,
    /全\s*\d{1,3}\s*[集期]/,
    /\b\d{1,3}\s*[集期]\b/,
    /电视剧|剧集|动漫|国漫|美剧|日剧|韩剧|纪录片|综艺|动画/,
  ];

  for (const pat of tvPatterns) {
    if (pat.test(cleanText)) return 'tv';
  }

  if (episodes && episodes.length > 1) return 'tv';
  if (typeName) {
    const tagStr = typeName.toUpperCase();
    if (tagStr.includes('电影') || tagStr.includes('MOVIE')) return 'movie';
  }

  return episodes && episodes.length === 1 ? 'movie' : 'tv';
}

// ============ 画质分辨率提取 ============

export function extractResolution(title: string): string {
  const t = title.toUpperCase();
  if (/2160P|4K|UHD|REMUX/.test(t)) return '4K';
  if (/1080P|FHD|蓝光|BLUERAY|BLU-RAY/.test(t)) return '1080P';
  if (/720P|HD/.test(t)) return '720P';
  return '未知';
}

export function extractEstimatedSize(title: string): string {
  // 从标题中提取体积信息
  const sizeMatch = title.match(/(\d+(?:\.\d+)?)\s*(GB|G|MB|M)/i);
  if (sizeMatch) {
    const value = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toUpperCase();
    if (unit.startsWith('G')) return `约 ${value} GB`;
    if (unit.startsWith('M')) return `约 ${value} MB`;
  }
  // 根据分辨率推断
  const res = extractResolution(title);
  if (res === '4K') return '约 15~50 GB';
  if (res === '1080P') return '约 1.5~4.5 GB';
  if (res === '720P') return '约 0.8~2 GB';
  return '未知';
}

// ============ 规则降级推荐 ============

/**
 * 当 AI API 不可用时，基于规则进行推荐排序
 */
export function ruleBasedRecommend(
  results: any[],
  query: string
): AiRecommendation {
  if (!results || results.length === 0) {
    return {
      best_resource_id: '',
      media_type: 'movie',
      normalized_title: query,
      year: '',
      resolution: '未知',
      estimated_size: '未知',
      quality_score: 0,
      recommend_reason: '暂无可用资源',
      recommended_tiers: [],
      is_tv: false,
      engine: 'rule_fallback',
    };
  }

  // 按画质和集数丰富度排序
  const scored = results.map((r) => {
    const title = r.title || r.vod_name || '';
    const res = extractResolution(title);
    const resScore = res === '4K' ? 100 : res === '1080P' ? 80 : res === '720P' ? 60 : 40;
    const episodeCount = r.episodes?.length || 0;
    const epScore = Math.min(episodeCount * 5, 30);
    const titleMatch = title.includes(query) ? 20 : 0;
    return { result: r, score: resScore + epScore + titleMatch, res };
  });

  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  const mediaType = inferMediaType(
    best.result.title || best.result.vod_name || query,
    best.result.episodes,
    best.result.type_name
  );

  // 构建推荐档位
  const tiers: AiTierItem[] = [];
  const seen = new Set<string>();

  for (const s of scored.slice(0, 3)) {
    const res = s.res;
    if (seen.has(res)) continue;
    seen.add(res);
    const id = s.result.id || s.result.vod_id || `tier_${tiers.length}`;
    let tag = '⭐ 综合最优';
    if (res === '4K') tag = '🏆 4K 超清';
    else if (res === '1080P') tag = '⭐ 1080P 高清';
    else if (res === '720P') tag = '💎 标清可用';

    tiers.push({
      id: String(id),
      tag,
      label: `${res} ${s.result.source_name || ''}`.trim(),
      resolution: res,
      estimated_size: extractEstimatedSize(s.result.title || s.result.vod_name || ''),
      highlight: `${s.result.source_name || '资源站'} · ${s.result.episodes?.length || 0}集`,
      is_default: tiers.length === 0,
      source_key: s.result.source,
      source_name: s.result.source_name,
    });
  }

  return {
    best_resource_id: String(best.result.id || best.result.vod_id || ''),
    media_type: mediaType,
    normalized_title: query,
    year: best.result.year || '',
    resolution: best.res,
    estimated_size: extractEstimatedSize(best.result.title || best.result.vod_name || ''),
    quality_score: best.score,
    recommend_reason: `${best.res} 画质，${best.result.source_name || '推荐源'}提供，${best.result.episodes?.length || 0}集可选`,
    viewing_tip: mediaType === 'tv' ? '电视剧资源，建议选择集数最全的源' : '电影资源，建议优先选择高画质版本',
    recommended_tiers: tiers,
    is_tv: mediaType === 'tv',
    engine: 'rule_fallback',
  };
}

// ============ Gemini AI 推荐 ============

const SYSTEM_PROMPT = `你是一个顶级的影音专家与智能选片分析师。
请针对用户搜索的影视，从候选资源中进行多维度深度对比与筛选，输出真实、精准的 1~3 个推荐档位与影迷导视。
【严格真实性与防幻觉准则】：
1. 真实匹配，按需推荐：只有当候选资源标题中明确包含 4K/2160P/UHD/REMUX 字样时，才可标记为4K档。
2. 体积预估必须严谨：优先从标题提取体积；未标注时按分辨率合理估算。
3. 动态推荐档位：
   - ⭐ 综合最优（清晰度与体积兼顾）
   - 🏆 4K原盘（仅当确实有4K资源时）
   - 💎 特色版本（双语音轨/导剪版等，若有）
4. 每个档位字段：id, tag, label, resolution, estimated_size, highlight, is_default
5. viewing_tip: 20~40字观影建议
6. recommend_reason: 25~45字推荐理由
【输出JSON格式】：
{
  "best_resource_id": "id",
  "media_type": "movie|tv",
  "normalized_title": "名称",
  "season": 1,
  "year": "2024",
  "resolution": "1080P",
  "estimated_size": "约 2.2 GB",
  "quality_score": 95,
  "recommend_reason": "推荐理由",
  "viewing_tip": "观影建议",
  "recommended_tiers": [{"id":"","tag":"","label":"","resolution":"","estimated_size":"","highlight":"","is_default":true}],
  "is_tv": false
}`;

/**
 * 调用 Gemini API 进行智能选片推荐
 */
export async function geminiRecommend(
  results: any[],
  query: string,
  config: AiConfig
): Promise<AiRecommendation> {
  if (!config.api_key) {
    return ruleBasedRecommend(results, query);
  }

  try {
    // 构建候选资源摘要（控制 token 用量）
    const candidates = results.slice(0, 20).map((r, i) => ({
      id: `res_${i}`,
      title: r.title || r.vod_name || '',
      source: r.source_name || r.source || '',
      episodes: r.episodes?.length || 0,
      year: r.year || '',
      type_name: r.type_name || '',
    }));

    const userPrompt = `搜索关键词：${query}\n候选资源列表：\n${JSON.stringify(candidates, null, 2)}`;

    const endpoint = `${config.base_url}/models/${config.model}:generateContent?key=${config.api_key}`;

    const body = {
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] },
      ],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[AiRecommend] Gemini API error: ${res.status}`);
      return ruleBasedRecommend(results, query);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return ruleBasedRecommend(results, query);
    }

    const parsed = JSON.parse(text);

    // 映射回原始结果的 source 信息
    const tiers: AiTierItem[] = (parsed.recommended_tiers || []).map((t: any, i: number) => {
      const idx = parseInt(t.id?.replace('res_', '') || '0') || 0;
      const original = results[idx];
      return {
        id: t.id || `tier_${i}`,
        tag: t.tag || '',
        label: t.label || '',
        resolution: t.resolution || '未知',
        estimated_size: t.estimated_size || '未知',
        highlight: t.highlight || '',
        is_default: i === 0,
        source_key: original?.source,
        source_name: original?.source_name,
      };
    });

    return {
      best_resource_id: parsed.best_resource_id || '',
      media_type: parsed.media_type || 'movie',
      normalized_title: parsed.normalized_title || query,
      season: parsed.season,
      year: parsed.year || '',
      resolution: parsed.resolution || '未知',
      estimated_size: parsed.estimated_size || '未知',
      quality_score: parsed.quality_score || 0,
      recommend_reason: parsed.recommend_reason || '',
      viewing_tip: parsed.viewing_tip || '',
      recommended_tiers: tiers,
      is_tv: parsed.is_tv ?? false,
      engine: 'gemini',
    };
  } catch (err) {
    console.warn('[AiRecommend] Gemini request failed:', err);
    return ruleBasedRecommend(results, query);
  }
}

/**
 * 统一入口：根据配置选择 AI 或规则推荐
 */
export async function smartRecommend(
  results: any[],
  query: string,
  config: AiConfig
): Promise<AiRecommendation> {
  if (config.enabled && config.api_key) {
    return geminiRecommend(results, query, config);
  }
  return ruleBasedRecommend(results, query);
}
