/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { smartRecommend, AiConfig, DEFAULT_AI_CONFIG } from '@/lib/ai-recommend';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { query, results } = body;

    if (!query || !results || !Array.isArray(results)) {
      return NextResponse.json({ error: '缺少 query 或 results 参数' }, { status: 400 });
    }

    // 从管理员配置中读取 AI 配置
    const config = await getConfig();
    const aiConfig: AiConfig = {
      ...DEFAULT_AI_CONFIG,
      ...(config as any).AiConfig,
    };

    const recommendation = await smartRecommend(results, query, aiConfig);

    return NextResponse.json({ recommendation });
  } catch (err) {
    console.error('[AI Recommend API] Error:', err);
    return NextResponse.json({ error: 'AI 推荐服务异常' }, { status: 500 });
  }
}
