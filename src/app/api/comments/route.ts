/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'edge';

const MAX_CONTENT_LENGTH = 500;
const MAX_COMMENTS_RETURNED = 200;

async function requireUser(request: NextRequest): Promise<
  | { ok: true; username: string; role: 'owner' | 'admin' | 'user' | undefined }
  | { ok: false; response: NextResponse }
> {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return {
      ok: false,
      response: NextResponse.json({ error: '未登录' }, { status: 401 }),
    };
  }

  const config = await getConfig();
  const user = config.UserConfig.Users?.find(
    (u) => u.username === authInfo.username
  );
  if (user?.banned) {
    return {
      ok: false,
      response: NextResponse.json({ error: '用户已被封禁' }, { status: 401 }),
    };
  }

  return {
    ok: true,
    username: authInfo.username,
    role: user?.role,
  };
}

function parseVideoKey(body: {
  source?: unknown;
  id?: unknown;
}): { source: string; id: string } | null {
  const source = String(body.source ?? '').trim();
  const id = String(body.id ?? '').trim();
  if (!source || !id || source.length > 100 || id.length > 200) return null;
  return { source, id };
}

/** GET：读取某部影片的全部评论 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const key = parseVideoKey({
      source: searchParams.get('source') ?? '',
      id: searchParams.get('id') ?? '',
    });
    if (!key) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    if (!db.supportsComments()) {
      return NextResponse.json({ comments: [], supported: false });
    }

    const comments = await db.getVideoComments(key.source, key.id);
    comments.sort((a, b) => b.created_at - a.created_at);

    return NextResponse.json(
      {
        comments: comments.slice(0, MAX_COMMENTS_RETURNED),
        total: comments.length,
        supported: true,
      },
      { headers: { 'Cache-Control': 'private, max-age=10' } }
    );
  } catch (error) {
    console.error('读取评论失败:', error);
    return NextResponse.json({ error: '读取评论失败' }, { status: 500 });
  }
}

/** POST：发表评论 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as {
      source?: unknown;
      id?: unknown;
      episode?: unknown;
      content?: unknown;
    };
    const key = parseVideoKey(body);
    if (!key) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    const content = String(body.content ?? '').trim();
    if (!content) {
      return NextResponse.json({ error: '评论内容不能为空' }, { status: 400 });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `评论最多 ${MAX_CONTENT_LENGTH} 字` },
        { status: 400 }
      );
    }

    const episodeRaw = Number(body.episode);
    const episode =
      Number.isInteger(episodeRaw) && episodeRaw >= 1 ? episodeRaw : undefined;

    const comment = {
      cid: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      source: key.source,
      id: key.id,
      episode,
      username: auth.username,
      content,
      created_at: Date.now(),
    };
    await db.addVideoComment(comment);

    return NextResponse.json({ ok: true, comment });
  } catch (error) {
    console.error('发表评论失败:', error);
    const message =
      error instanceof Error && error.message.includes('不支持')
        ? error.message
        : '发表评论失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE：删除评论（本人或管理员） */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as {
      source?: unknown;
      id?: unknown;
      cid?: unknown;
    };
    const key = parseVideoKey(body);
    const cid = String(body.cid ?? '').trim();
    if (!key || !cid) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    if (!db.supportsComments()) {
      return NextResponse.json(
        { error: '当前存储方式不支持评论' },
        { status: 501 }
      );
    }

    const comments = await db.getVideoComments(key.source, key.id);
    const target = comments.find((item) => item.cid === cid);
    if (!target) {
      return NextResponse.json({ error: '评论不存在' }, { status: 404 });
    }

    const isPrivileged = auth.role === 'owner' || auth.role === 'admin';
    if (target.username !== auth.username && !isPrivileged) {
      return NextResponse.json({ error: '只能删除自己的评论' }, { status: 403 });
    }

    await db.deleteVideoComment(key.source, key.id, cid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('删除评论失败:', error);
    return NextResponse.json({ error: '删除评论失败' }, { status: 500 });
  }
}
