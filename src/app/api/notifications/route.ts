/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  getNotifications,
  markAllRead,
  clearAllNotifications,
  getUnreadCount,
} from '@/lib/notification';

export const runtime = 'nodejs';

// GET: 获取通知列表 + 未读数
export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const notifications = await getNotifications(authInfo.username);
  const unreadCount = await getUnreadCount(authInfo.username);

  return NextResponse.json({ notifications, unreadCount });
}

// PUT: 标记所有已读
export async function PUT(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await markAllRead(authInfo.username);
  return NextResponse.json({ success: true });
}

// DELETE: 清除所有通知
export async function DELETE(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await clearAllNotifications(authInfo.username);
  return NextResponse.json({ success: true });
}
