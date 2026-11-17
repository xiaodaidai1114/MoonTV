import { NextRequest, NextResponse } from 'next/server';

import { canSeeAdultZone, getRequestRole } from '@/lib/adult-guard';
import {
  ADULT_ZONE_COOKIE,
  ADULT_ZONE_MAX_AGE_SECONDS,
  getAdultZonePassword,
  isAdultZoneLocked,
  signAdultZoneToken,
  verifyAdultZoneToken,
} from '@/lib/adult-zone';

export const runtime = 'edge';

/** 查询当前是否已通过口令 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(ADULT_ZONE_COOKIE)?.value;
  const admin = canSeeAdultZone(await getRequestRole(request));
  return NextResponse.json(
    {
      admin,
      locked: isAdultZoneLocked(),
      // 非管理员一律视为未授权，前端据此隐藏内容
      authorized: admin && (await verifyAdultZoneToken(token)),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/** 校验口令并下发 cookie */
export async function POST(request: NextRequest) {
  if (!canSeeAdultZone(await getRequestRole(request))) {
    return NextResponse.json({ error: '仅管理员可访问成人专区' }, { status: 403 });
  }

  if (!isAdultZoneLocked()) {
    return NextResponse.json({ ok: true, locked: false });
  }

  let password = '';
  try {
    const body = await request.json();
    password = typeof body?.password === 'string' ? body.password : '';
  } catch {
    password = '';
  }

  if (password.trim() !== getAdultZonePassword()) {
    return NextResponse.json({ error: '口令不正确' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, locked: true });
  response.cookies.set(ADULT_ZONE_COOKIE, await signAdultZoneToken(), {
    path: '/',
    maxAge: ADULT_ZONE_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
  });
  return response;
}

/** 退出专区（下次进入需要重新输入口令） */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADULT_ZONE_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
