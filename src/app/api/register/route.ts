/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

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

// 生成签名
async function generateSignature(
  data: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isHttpsRequest(req: NextRequest): boolean {
  const forwardedProto = req.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    .trim()
    .toLowerCase();
  if (forwardedProto) {
    return forwardedProto === 'https';
  }
  return req.nextUrl.protocol === 'https:';
}

async function generateAuthCookie(
  username: string,
  role: 'owner' | 'admin' | 'user' = 'user'
): Promise<string> {
  const authData: any = { role };
  if (username && process.env.PASSWORD) {
    authData.username = username;
    const signature = await generateSignature(username, process.env.PASSWORD);
    authData.signature = signature;
    authData.timestamp = Date.now();
  }
  return encodeURIComponent(JSON.stringify(authData));
}

// POST /api/register - 用户注册（需要邀请码）
export async function POST(req: NextRequest) {
  const useSecureCookie = isHttpsRequest(req);

  try {
    if (STORAGE_TYPE === 'localstorage') {
      return NextResponse.json(
        { error: '当前存储模式不支持用户注册' },
        { status: 400 }
      );
    }

    const { username, password, invitationCode } = await req.json();

    if (!username || typeof username !== 'string' || username.trim().length < 2) {
      return NextResponse.json({ error: '用户名至少2个字符' }, { status: 400 });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: '密码至少6个字符' }, { status: 400 });
    }
    if (!invitationCode || typeof invitationCode !== 'string') {
      return NextResponse.json({ error: '邀请码不能为空' }, { status: 400 });
    }

    if (username === process.env.USERNAME) {
      return NextResponse.json({ error: '该用户名已被占用' }, { status: 400 });
    }

    const config = await getConfig();

    const existingUser = config.UserConfig.Users.find(
      (u) => u.username === username
    );
    if (existingUser) {
      return NextResponse.json({ error: '该用户名已被占用' }, { status: 400 });
    }

    try {
      const userExists = await db.checkUserExist(username);
      if (userExists) {
        return NextResponse.json({ error: '该用户名已被占用' }, { status: 400 });
      }
    } catch (e) {
      console.error('检查用户存在性失败', e);
    }

    const codes = config.InvitationCodes || [];
    const codeEntry = codes.find(
      (c) => c.code === invitationCode && !c.usedBy && !c.expired
    );
    if (!codeEntry) {
      return NextResponse.json({ error: '邀请码无效或已被使用' }, { status: 400 });
    }

    try {
      await db.registerUser(username, password);
    } catch (e) {
      console.error('注册用户到数据库失败', e);
      return NextResponse.json({ error: '注册失败，请稍后重试' }, { status: 500 });
    }

    config.UserConfig.Users.push({
      username,
      role: 'user',
      banned: false,
    });

    codeEntry.usedBy = username;
    codeEntry.usedAt = Date.now();

    try {
      await db.saveAdminConfig(config);
    } catch (e) {
      console.error('保存配置失败', e);
    }

    const response = NextResponse.json({ ok: true, message: '注册成功' });
    const cookieValue = await generateAuthCookie(username, 'user');
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    response.cookies.set('auth', cookieValue, {
      path: '/',
      expires,
      sameSite: 'lax',
      httpOnly: false,
      secure: useSecureCookie,
    });

    return response;
  } catch (error) {
    console.error('注册接口异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// GET /api/register - 检查注册是否可用
export async function GET() {
  try {
    if (STORAGE_TYPE === 'localstorage') {
      return NextResponse.json({ enabled: false });
    }
    const config = await getConfig();
    const codes = config.InvitationCodes || [];
    const hasAvailableCodes = codes.some((c) => !c.usedBy && !c.expired);
    return NextResponse.json({ enabled: true, hasAvailableCodes });
  } catch {
    return NextResponse.json({ enabled: false });
  }
}
