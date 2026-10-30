import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

import { checkImageProxyTarget, isImageContentType } from '@/lib/proxy-guard';

export const runtime = 'nodejs';

// 磁盘缓存目录
const CACHE_DIR = path.join(process.cwd(), '.image-cache');
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB 上限

// 确保缓存目录存在
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

// 清理过期缓存（简单的 LRU 策略）
async function cleanOldCache() {
  try {
    const files = await fs.readdir(CACHE_DIR);
    const stats = await Promise.all(
      files.map(async (f) => {
        const fp = path.join(CACHE_DIR, f);
        const st = await fs.stat(fp);
        return { name: f, path: fp, mtime: st.mtimeMs, size: st.size };
      })
    );
    const totalSize = stats.reduce((sum, s) => sum + s.size, 0);
    if (totalSize > MAX_CACHE_SIZE) {
      // 按修改时间排序，删除最旧的文件直到低于上限
      stats.sort((a, b) => a.mtime - b.mtime);
      let currentSize = totalSize;
      for (const f of stats) {
        if (currentSize <= MAX_CACHE_SIZE * 0.8) break;
        await fs.unlink(f.path).catch(() => { /* ignore */ });
        currentSize -= f.size;
      }
    }
  } catch {
    // ignore
  }
}

// OrionTV 兼容接口
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
  }

  // 只允许代理公网 http(s) 图片，避免被用来探测内网服务
  const invalidReason = checkImageProxyTarget(imageUrl);
  if (invalidReason) {
    return NextResponse.json({ error: invalidReason }, { status: 400 });
  }

  // 计算缓存 key 和 ETag
  const urlHash = createHash('md5').update(imageUrl).digest('hex');
  const cachePath = path.join(CACHE_DIR, `${urlHash}.img`);
  const etag = `W/"${urlHash}"`;
  const cacheHeaders: Record<string, string> = {
    'Cache-Control': 'public, max-age=2592000, immutable',
    'ETag': etag,
    'X-Content-Type-Options': 'nosniff',
  };

  // 1. 检查客户端 ETag（304 极速返回）
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }

  // 2. 检查本地磁盘缓存
  try {
    const cached = await fs.readFile(cachePath);
    const ext = imageUrl.split('.').pop()?.toLowerCase();
    const mediaType = ext === 'webp' ? 'image/webp' : ext === 'png' ? 'image/png' : 'image/jpeg';
    cacheHeaders['Content-Type'] = mediaType;
    return new Response(cached, { status: 200, headers: cacheHeaders });
  } catch {
    // 缓存未命中，继续从上游获取
  }

  try {
    const imageResponse = await fetch(imageUrl, {
      headers: {
        Referer: 'https://movie.douban.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
    });

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: imageResponse.statusText },
        { status: imageResponse.status }
      );
    }

    const contentType = imageResponse.headers.get('content-type');

    // 只转发真正的图片，避免上游返回 HTML 时在本站域名下被当作页面执行
    if (!isImageContentType(contentType)) {
      imageResponse.body?.cancel();
      return NextResponse.json(
        { error: 'Upstream response is not an image' },
        { status: 415 }
      );
    }

    if (!imageResponse.body) {
      return NextResponse.json(
        { error: 'Image response has no body' },
        { status: 500 }
      );
    }

    // 读取图片内容到 buffer（用于磁盘缓存）
    const imageBuffer = await imageResponse.arrayBuffer();

    // 异步写入磁盘缓存（不阻塞响应）
    ensureCacheDir().then(() => {
      fs.writeFile(cachePath, Buffer.from(imageBuffer)).then(() => {
        cleanOldCache();
      }).catch(() => { /* ignore */ });
    });

    // 创建响应头
    const headers = new Headers();
    if (contentType) {
      headers.set('Content-Type', contentType);
    }
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'public, max-age=2592000, immutable');
    headers.set('ETag', etag);
    headers.set('CDN-Cache-Control', 'public, s-maxage=2592000');
    headers.set('Vercel-CDN-Cache-Control', 'public, s-maxage=2592000');
    headers.set('Netlify-Vary', 'query');

    return new Response(imageBuffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error fetching image' },
      { status: 500 }
    );
  }
}
