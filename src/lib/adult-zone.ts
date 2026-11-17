/**
 * 成人专区的访问口令。
 *
 * 口令存在环境变量 ADULT_ZONE_PASSWORD 里，改完 `docker compose up -d` 即可生效，
 * 不需要重新构建镜像。校验通过后下发一个 HMAC 签名 cookie，有效期 7 天；
 * 改口令会让所有已签发的 cookie 立即失效。
 */

export const ADULT_ZONE_COOKIE = 'adult_zone';
const TOKEN_SUBJECT = 'moontv-adult-zone-v1';

/** 是否配置了口令；没配置时专区保持开放，避免把入口锁死 */
export function getAdultZonePassword(): string {
  return (process.env.ADULT_ZONE_PASSWORD || '').trim();
}

export function isAdultZoneLocked(): boolean {
  return getAdultZonePassword().length > 0;
}

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

/** 用当前口令派生签名，口令一改签名就变 */
export async function signAdultZoneToken(): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getAdultZonePassword()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(TOKEN_SUBJECT)
  );
  return toHex(signature);
}

export async function verifyAdultZoneToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!isAdultZoneLocked()) return true;
  if (!token) return false;
  try {
    return token === (await signAdultZoneToken());
  } catch {
    return false;
  }
}

export const ADULT_ZONE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
