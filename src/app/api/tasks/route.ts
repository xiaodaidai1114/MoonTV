/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth';
import {
  getTasks,
  addTask,
  removeTask,
  updateTaskStatus,
  clearFinishedTasks,
  TaskStatus,
} from '@/lib/task-queue';

export const runtime = 'nodejs';

// GET: 获取任务列表
export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tasks = await getTasks(authInfo.username);
  return NextResponse.json({ tasks });
}

// POST: 添加任务
export async function POST(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, search_title, source, source_name, episode_index, episode_title, url, cover, year, type } = body;

    if (!search_title) {
      return NextResponse.json({ error: '缺少 search_title' }, { status: 400 });
    }

    const task = await addTask(authInfo.username, {
      type: type || 'watch_later',
      title: title || search_title,
      search_title,
      source: source || '',
      source_name: source_name || '',
      episode_index: episode_index || 0,
      episode_title: episode_title || '',
      url: url || '',
      cover: cover || '',
      year: year || '',
    });

    return NextResponse.json({ task });
  } catch (err) {
    console.error('[Tasks API] POST error:', err);
    return NextResponse.json({ error: '添加任务失败' }, { status: 500 });
  }
}

// PUT: 更新任务状态
export async function PUT(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, status, progress, error } = body;

    if (!id || !status) {
      return NextResponse.json({ error: '缺少 id 或 status' }, { status: 400 });
    }

    await updateTaskStatus(authInfo.username, id, status as TaskStatus, progress, error);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[Tasks API] PUT error:', err);
    return NextResponse.json({ error: '更新任务失败' }, { status: 500 });
  }
}

// DELETE: 删除任务或清除已完成
export async function DELETE(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('id');
  const action = searchParams.get('action');

  if (action === 'clear_finished') {
    await clearFinishedTasks(authInfo.username);
    return NextResponse.json({ success: true });
  }

  if (!taskId) {
    return NextResponse.json({ error: '缺少 id' }, { status: 400 });
  }

  await removeTask(authInfo.username, taskId);
  return NextResponse.json({ success: true });
}
