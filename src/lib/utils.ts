/* eslint-disable @typescript-eslint/no-explicit-any,no-console */
import he from 'he';
import Hls from 'hls.js';

function getDoubanImageProxyConfig(): {
  proxyType:
    | 'direct'
    | 'server'
    | 'img3'
    | 'cmliussss-cdn-tencent'
    | 'cmliussss-cdn-ali'
    | 'custom';
  proxyUrl: string;
} {
  const doubanImageProxyType =
    localStorage.getItem('doubanImageProxyType') ||
    (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY_TYPE ||
    'direct';
  const doubanImageProxy =
    localStorage.getItem('doubanImageProxyUrl') ||
    (window as any).RUNTIME_CONFIG?.DOUBAN_IMAGE_PROXY ||
    '';
  return {
    proxyType: doubanImageProxyType,
    proxyUrl: doubanImageProxy,
  };
}

/**
 * 处理图片 URL，如果设置了图片代理则使用代理
 */
export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const normalizedUrl = originalUrl.trim();

  // Bangumi 封面统一走本站 /bgm-img，避免浏览器直连 lain.bgm.tv 被限速或拿到空图
  const bangumiPath = normalizedUrl.match(
    /^(?:https?:)?\/\/lain\.bgm\.tv(?:\/bgm-img)?(\/pic\/cover\/[^?#]+)/i
  );
  if (bangumiPath) {
    return `/bgm-img${bangumiPath[1]}`;
  }

  // 已经是本地代理、内联资源或本地资源时，直接返回
  if (
    normalizedUrl.startsWith('/api/image-proxy?url=') ||
    normalizedUrl.startsWith('data:') ||
    normalizedUrl.startsWith('blob:') ||
    normalizedUrl.startsWith('/')
  ) {
    return normalizedUrl;
  }

  // HTTPS 页面下直接加载 http 图片会触发 Mixed Content，统一走服务端代理兜底
  if (normalizedUrl.startsWith('http://')) {
    return `/api/image-proxy?url=${encodeURIComponent(normalizedUrl)}`;
  }

  // 部分图床的域名/端口在家宽网络下直连不通（如 360资源 imgzy360.com:7788
  // 非标准端口被运营商拦截），但云服务器侧可达——统一走本站图片代理，
  // 由服务器代拉并带半年浏览器缓存。遇到新的失效图床往列表里补即可。
  const SERVER_PROXIED_IMAGE_HOSTS = ['imgzy360.com'];
  if (
    SERVER_PROXIED_IMAGE_HOSTS.some((host) =>
      normalizedUrl.includes(host)
    )
  ) {
    return `/api/image-proxy?url=${encodeURIComponent(normalizedUrl)}`;
  }

  // 仅处理豆瓣图片代理
  if (!normalizedUrl.includes('doubanio.com')) {
    return normalizedUrl;
  }

  const { proxyType, proxyUrl } = getDoubanImageProxyConfig();
  switch (proxyType) {
    case 'server':
      return `/api/image-proxy?url=${encodeURIComponent(normalizedUrl)}`;
    case 'img3':
      return normalizedUrl.replace(/img\d+\.doubanio\.com/g, 'img3.doubanio.com');
    case 'cmliussss-cdn-tencent':
      return normalizedUrl.replace(
        /img\d+\.doubanio\.com/g,
        'img.doubanio.cmliussss.net'
      );
    case 'cmliussss-cdn-ali':
      return normalizedUrl.replace(
        /img\d+\.doubanio\.com/g,
        'img.doubanio.cmliussss.com'
      );
    case 'custom':
      return `${proxyUrl}${encodeURIComponent(normalizedUrl)}`;
    case 'direct':
    default:
      return normalizedUrl;
  }
}

/**
 * 从m3u8地址获取视频质量等级和网络信息
 * @param m3u8Url m3u8播放列表的URL
 * @returns Promise<{quality: string, loadSpeed: string, pingTime: number}> 视频质量等级和网络信息
 */
/**
 * 轻量测速：只拉 m3u8 清单和首个分片的前 ~256KB，不创建真实视频实例。
 *
 * 与 getVideoResolutionFromM3u8（完整视频加载）相比，单次探测从数秒降到
 * 1-2 秒，且不会和正在播放的视频抢占解码资源。画质信息只有在清单是
 * master playlist（带 RESOLUTION 标注）时才能拿到，否则返回空字符串，
 * 由调用方决定是否补测。
 */
export async function probeSourceSpeed(m3u8Url: string): Promise<{
  quality: string;
  loadSpeed: string;
  pingTime: number;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const pingStart = performance.now();
    const playlistRes = await fetch(m3u8Url, { signal: controller.signal });
    const pingTime = Math.round(performance.now() - pingStart);
    if (!playlistRes.ok) {
      throw new Error(`HTTP ${playlistRes.status}`);
    }
    const playlist = await playlistRes.text();

    // master playlist：取第一个带 RESOLUTION 的变体（画质可直接读出），
    // 继续向下一层媒体清单探测速度
    let quality = '';
    let mediaUrl = m3u8Url;
    if (playlist.includes('#EXT-X-STREAM-INF')) {
      const lines = playlist.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i].includes('#EXT-X-STREAM-INF')) continue;
        const resMatch = lines[i].match(/RESOLUTION=(\d+)x(\d+)/i);
        if (resMatch) {
          const height = Number(resMatch[2]);
          quality =
            height >= 2000
              ? '4K'
              : height >= 1440
                ? '2K'
                : height >= 1080
                  ? '1080p'
                  : height >= 720
                    ? '720p'
                    : height >= 480
                      ? '480p'
                      : `${height}p`;
        }
        const next = lines[i + 1]?.trim();
        if (next && !next.startsWith('#')) {
          mediaUrl = new URL(next, m3u8Url).href;
          break;
        }
      }
    }

    // 媒体清单：找到第一个分片地址
    const mediaRes = await fetch(mediaUrl, { signal: controller.signal });
    const mediaText = await mediaRes.text();
    const segmentLine = mediaText
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));
    if (!segmentLine) {
      throw new Error('清单里没有分片');
    }
    const segmentUrl = new URL(segmentLine, mediaUrl).href;

    // 拉首个分片：累计 ~256KB 或 3 秒后停止，换算速度
    const segStart = performance.now();
    const segRes = await fetch(segmentUrl, { signal: controller.signal });
    if (!segRes.ok || !segRes.body) {
      throw new Error(`分片 HTTP ${segRes.status}`);
    }
    const reader = segRes.body.getReader();
    let bytes = 0;
    const bytesTarget = 256 * 1024;
    const elapsedMs = () => performance.now() - segStart;
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      bytes += value.length;
      if (bytes >= bytesTarget || elapsedMs() > 3000) {
        reader.cancel().catch(() => {});
        break;
      }
    }
    const seconds = Math.max(elapsedMs() / 1000, 0.001);
    const kbps = bytes / 1024 / seconds;
    const loadSpeed =
      kbps >= 1024 ? `${(kbps / 1024).toFixed(2)} MB/s` : `${Math.round(kbps)} KB/s`;

    return { quality, loadSpeed, pingTime };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getVideoResolutionFromM3u8(m3u8Url: string): Promise<{
  quality: string; // 如720p、1080p等
  loadSpeed: string; // 自动转换为KB/s或MB/s
  pingTime: number; // 网络延迟（毫秒）
}> {
  try {
    // 直接使用m3u8 URL作为视频源，避免CORS问题
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';

      // 测量网络延迟（ping时间） - 使用m3u8 URL而不是ts文件
      const pingStart = performance.now();
      let pingTime = 0;

      // 测量ping时间（使用m3u8 URL）
      fetch(m3u8Url, { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
          pingTime = performance.now() - pingStart;
        })
        .catch(() => {
          pingTime = performance.now() - pingStart; // 记录到失败为止的时间
        });

      // 固定使用hls.js加载
      const hls = new Hls();

      // 设置超时处理
      const timeout = setTimeout(() => {
        hls.destroy();
        video.remove();
        reject(new Error('Timeout loading video metadata'));
      }, 4000);

      video.onerror = () => {
        clearTimeout(timeout);
        hls.destroy();
        video.remove();
        reject(new Error('Failed to load video metadata'));
      };

      let actualLoadSpeed = '未知';
      let hasSpeedCalculated = false;
      let hasMetadataLoaded = false;

      let fragmentStartTime = 0;

      // 检查是否可以返回结果
      const checkAndResolve = () => {
        if (
          hasMetadataLoaded &&
          (hasSpeedCalculated || actualLoadSpeed !== '未知')
        ) {
          clearTimeout(timeout);
          const width = video.videoWidth;
          if (width && width > 0) {
            hls.destroy();
            video.remove();

            // 根据视频宽度判断视频质量等级，使用经典分辨率的宽度作为分割点
            const quality =
              width >= 3840
                ? '4K' // 4K: 3840x2160
                : width >= 2560
                ? '2K' // 2K: 2560x1440
                : width >= 1920
                ? '1080p' // 1080p: 1920x1080
                : width >= 1280
                ? '720p' // 720p: 1280x720
                : width >= 854
                ? '480p'
                : 'SD'; // 480p: 854x480

            resolve({
              quality,
              loadSpeed: actualLoadSpeed,
              pingTime: Math.round(pingTime),
            });
          } else {
            // webkit 无法获取尺寸，直接返回
            resolve({
              quality: '未知',
              loadSpeed: actualLoadSpeed,
              pingTime: Math.round(pingTime),
            });
          }
        }
      };

      // 监听片段加载开始
      hls.on(Hls.Events.FRAG_LOADING, () => {
        fragmentStartTime = performance.now();
      });

      // 监听片段加载完成，只需首个分片即可计算速度
      hls.on(Hls.Events.FRAG_LOADED, (event: any, data: any) => {
        if (
          fragmentStartTime > 0 &&
          data &&
          data.payload &&
          !hasSpeedCalculated
        ) {
          const loadTime = performance.now() - fragmentStartTime;
          const size = data.payload.byteLength || 0;

          if (loadTime > 0 && size > 0) {
            const speedKBps = size / 1024 / (loadTime / 1000);

            // 立即计算速度，无需等待更多分片
            const avgSpeedKBps = speedKBps;

            if (avgSpeedKBps >= 1024) {
              actualLoadSpeed = `${(avgSpeedKBps / 1024).toFixed(1)} MB/s`;
            } else {
              actualLoadSpeed = `${avgSpeedKBps.toFixed(1)} KB/s`;
            }
            hasSpeedCalculated = true;
            checkAndResolve(); // 尝试返回结果
          }
        }
      });

      hls.loadSource(m3u8Url);
      hls.attachMedia(video);

      // 监听hls.js错误
      hls.on(Hls.Events.ERROR, (event: any, data: any) => {
        console.error('HLS错误:', data);
        if (data.fatal) {
          clearTimeout(timeout);
          hls.destroy();
          video.remove();
          reject(new Error(`HLS播放失败: ${data.type}`));
        }
      });

      // 监听视频元数据加载完成
      video.onloadedmetadata = () => {
        hasMetadataLoaded = true;
        checkAndResolve(); // 尝试返回结果
      };
    });
  } catch (error) {
    throw new Error(
      `Error getting video resolution: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';

  const cleanedText = text
    .replace(/<[^>]+>/g, '\n') // 将 HTML 标签替换为换行
    .replace(/\n+/g, '\n') // 将多个连续换行合并为一个
    .replace(/[ \t]+/g, ' ') // 将多个连续空格和制表符合并为一个空格，但保留换行符
    .replace(/^\n+|\n+$/g, '') // 去掉首尾换行
    .trim(); // 去掉首尾空格

  // 使用 he 库解码 HTML 实体
  return he.decode(cleanedText);
}

/**
 * 获取配置的超时时间（秒）
 * 从 localStorage 读取，如果不存在或无效则返回默认值3秒
 */
export function getRequestTimeout(): number {
  if (typeof window === 'undefined') {
    return 30; // 服务器端返回默认值
  }
  
  try {
    const savedTimeout = localStorage.getItem('requestTimeout');
    if (savedTimeout) {
      const timeoutSeconds = parseInt(savedTimeout, 10);
      if (!isNaN(timeoutSeconds) && timeoutSeconds >= 1 && timeoutSeconds <= 60) {
        return timeoutSeconds;
      }
    }
  } catch (error) {
    console.warn('Failed to read timeout from localStorage:', error);
  }
  
  return 30; // 默认30秒
}
