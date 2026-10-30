/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'upstash'
    | 'kvrocks'
    | undefined) || 'localstorage';

function generateInvitationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function checkAuth(req: NextRequest): {
  ok: boolean;
  username?: string;
  role?: string;
  response?: NextResponse;
} {
  if (STORAGE_TYPE === 'localstorage') {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '当前存储模式不支持邀请码功能' },
        { status: 400 }
      ),
    };
  }

  const authInfo = getAuthInfoFromCookie(req);
  if (!authInfo || !authInfo.username) {
    return {
      ok: false,
      response: NextResponse.json({ error: '未登录' }, { status: 401 }),
    };
  }

  const isOwner = authInfo.username === process.env.USERNAME;
  const role = (authInfo as any).role || (isOwner ? 'owner' : 'user');

  if (role !== 'owner' && role !== 'admin') {
    return {
      ok: false,
      response: NextResponse.json({ error: '权限不足' }, { status: 403 }),
    };
  }

  return { ok: true, username: authInfo.username, role };
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response!;

  try {
    const config = await getConfig();
    const codes = config.InvitationCodes || [];
    return NextResponse.json(
      { codes },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('获取邀请码失败', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
      if (!auth.ok) return auth.response!;

      try {
        const body = await req.json().catch(() => ({}));
        const count = Math.min(body.count || 1, 50);

        const config = await getConfig();
        if (!config.InvitationCodes) {
          config.InvitationCodes = [];
        }

        const newCodes = [];
        for (let i = 0; i < count; i++) {
          const code = generateInvitationCode();
          newCodes.push({
            code,
            createdAt: Date.now(),
            createdBy: auth.username!,
          });
          config.InvitationCodes.push({
            code,
            createdAt: Date.now(),
            createdBy: auth.username!,
          });
        }

        await db.saveAdminConfig(config);

        return NextResponse.json(
          { ok: true, codes: newCodes },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      } catch (error) {
        console.error('生成邀请码失败', error);
        return NextResponse.json({ error: '服务器错误' }, { status: 500 });
      }
}

export async function DELETE(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response!;

  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: '邀请码不能为空' }, { status: 400 });
    }

    const config = await getConfig();
    if (!config.InvitationCodes) {
      return NextResponse.json({ error: '邀请码不存在' }, { status: 404 });
    }

    const before = config.InvitationCodes.length;
    config.InvitationCodes = config.InvitationCodes.filter(
      (c) => c.code !== code
    );

    if (config.InvitationCodes.length === before) {
      return NextResponse.json({ error: '邀请码不存在' }, { status: 404 });
    }

    await db.saveAdminConfig(config);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('删除邀请码失败', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
