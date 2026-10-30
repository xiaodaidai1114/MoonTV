/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  getSubscriptions,
  addSubscription,
  deleteSubscription,
  getSubscriptionUpdates,
  clearSubscriptionUpdates,
} from '@/lib/subscription';

export const runtime = 'nodejs';

// GET: 获取订阅列表 + 更新通知
export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const subscriptions = await getSubscriptions(authInfo.username);
  const updates = await getSubscriptionUpdates(authInfo.username);

  return NextResponse.json({ subscriptions, updates });
}

// POST: 添加订阅
export async function POST(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, search_title, cover, year, source, source_name, last_episode, total_episodes } = body;

    if (!search_title) {
      return NextResponse.json({ error: '缺少 search_title' }, { status: 400 });
    }

    const sub = await addSubscription(authInfo.username, {
      title: title || search_title,
      search_title,
      cover: cover || '',
      year: year || '',
      source: source || '',
      source_name: source_name || '',
      last_episode: last_episode || 0,
      total_episodes: total_episodes || 0,
    });

    return NextResponse.json({ subscription: sub });
  } catch (err) {
    console.error('[Subscription API] POST error:', err);
    return NextResponse.json({ error: '添加订阅失败' }, { status: 500 });
  }
}

// DELETE: 删除订阅或清除更新通知
export async function DELETE(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const subId = searchParams.get('id');
  const action = searchParams.get('action');

  if (action === 'clear_updates') {
    await clearSubscriptionUpdates(authInfo.username);
    return NextResponse.json({ success: true });
  }

  if (!subId) {
    return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  }

  await deleteSubscription(authInfo.username, subId);
  return NextResponse.json({ success: true });
}
