import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export type RequestRole = 'owner' | 'admin' | 'user' | null;

/**
 * 取当前请求者的角色。
 *
 * 不用 cookie 里的 role 字段——它没被签名，用户可以随便改；
 * 这里只信任已由中间件校验过的 username，再从配置里查真实角色。
 */
export async function getRequestRole(request: {
  cookies: { get(name: string): { value: string } | undefined };
}): Promise<RequestRole> {
  const auth = getAuthInfoFromCookie(
    request as unknown as Parameters<typeof getAuthInfoFromCookie>[0]
  );
  const username = auth?.username;
  if (!username) return null;
  if (username === process.env.USERNAME) return 'owner';

  try {
    const config = await getConfig();
    const user = config.UserConfig.Users.find((u) => u.username === username);
    if (!user || user.banned) return null;
    return user.role;
  } catch {
    return null;
  }
}

export const canSeeAdultZone = (role: RequestRole): boolean =>
  role === 'owner' || role === 'admin';
