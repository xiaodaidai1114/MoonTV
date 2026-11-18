/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import {
  AiChatResult,
  buildSuggestions,
  describeDiscover,
  describeSmallTalk,
  describeTitleResult,
  parseChatIntent,
  searchPlayableTitle,
} from '@/lib/ai-recommend';
import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export const runtime = 'edge';

interface ChatBody {
  message?: string;
  history?: { role?: string; content?: string }[];
}

export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const config = await getConfig();
    const user = config.UserConfig.Users?.find(
      (u) => u.username === authInfo.username
    );
    if (user?.banned) {
      return NextResponse.json({ error: '用户已被封禁' }, { status: 401 });
    }

    const body = (await request.json()) as ChatBody;
    const message = (body.message || '').trim();
    if (!message) {
      return NextResponse.json({ error: '请输入想看的内容' }, { status: 400 });
    }
    if (message.length > 200) {
      return NextResponse.json({ error: '描述太长了，简短一点' }, { status: 400 });
    }

    const intent = parseChatIntent(message);

    if (intent.mode === 'title' && intent.title) {
      const cards = await searchPlayableTitle(
        authInfo.username,
        intent.title,
        request.signal
      );
      const result: AiChatResult = {
        mode: 'title',
        reply: describeTitleResult(intent.title, cards),
        cards,
        intent: {
          contentKind: intent.contentKind,
          genre: intent.genre || undefined,
          region: intent.region || undefined,
          year: intent.year || undefined,
          title: intent.title,
        },
        suggestions: buildSuggestions(intent),
      };
      return NextResponse.json(result);
    }

    if (intent.mode === 'smalltalk') {
      const result: AiChatResult = {
        mode: 'smalltalk',
        reply: describeSmallTalk(),
        cards: [],
        intent: { contentKind: intent.contentKind },
        suggestions: [
          '推荐几部高分悬疑剧',
          '有没有下饭的喜剧',
          '找一部适合全家看的电影',
          '最近有什么新番',
        ],
      };
      return NextResponse.json(result);
    }

    const kind =
      intent.contentKind === 'movie'
        ? 'movie'
        : 'tv';
    const category =
      intent.contentKind === 'anime'
        ? '动画'
        : intent.contentKind === 'show'
          ? '综艺'
          : intent.contentKind === 'short'
            ? '短剧'
            : intent.contentKind === 'doc'
              ? '纪录片'
              : intent.genre;

    const result: AiChatResult = {
      mode: 'discover',
      reply: describeDiscover(intent),
      cards: [],
      douban: {
        kind,
        category,
        region: intent.region,
        year: intent.year,
        sort: intent.sort,
      },
      intent: {
        contentKind: intent.contentKind,
        genre: intent.genre || undefined,
        region: intent.region || undefined,
        year: intent.year || undefined,
      },
      suggestions: buildSuggestions(intent),
    };
    return NextResponse.json(result);
  } catch (error) {
    console.error('AI 找剧失败:', error);
    return NextResponse.json(
      { error: '我这边有点忙，稍后再试一次' },
      { status: 500 }
    );
  }
}
