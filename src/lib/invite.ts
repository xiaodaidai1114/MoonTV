import type { AdminConfig } from './admin.types';

export type InviteCodeEntry = NonNullable<
  AdminConfig['UserConfig']['InviteCodes']
>[number];

/** 去掉容易看错的字符（0/O、1/I/L），避免用户抄邀请码时出错 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 统一比较口径：忽略大小写、空格与连字符 */
export const normalizeInviteCode = (input: string): string =>
  String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const randomChars = (length: number): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
};

/** 生成一个展示用邀请码，形如 7K3M-9QXF */
export const generateInviteCode = (): string => {
  const raw = randomChars(8);
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
};

export type InviteCodeState = 'ok' | 'disabled' | 'expired' | 'used-up';

export const checkInviteCode = (
  entry: InviteCodeEntry | undefined,
  now = Date.now()
): { ok: boolean; state: InviteCodeState; reason?: string } => {
  if (!entry) return { ok: false, state: 'disabled', reason: '邀请码不存在' };
  if (entry.disabled) return { ok: false, state: 'disabled', reason: '邀请码已停用' };
  if (entry.expiresAt && entry.expiresAt <= now) {
    return { ok: false, state: 'expired', reason: '邀请码已过期' };
  }
  const max = entry.maxUses > 0 ? entry.maxUses : 1;
  if ((entry.usedCount || 0) >= max) {
    return { ok: false, state: 'used-up', reason: '邀请码已用完' };
  }
  return { ok: true, state: 'ok' };
};

/** 在配置里按统一口径查找邀请码 */
export const findInviteCode = (
  codes: InviteCodeEntry[] | undefined,
  input: string
): InviteCodeEntry | undefined => {
  const target = normalizeInviteCode(input);
  if (!target) return undefined;
  return (codes || []).find((item) => normalizeInviteCode(item.code) === target);
};

/** 创建一批邀请码（上限 200 个，避免把配置文件撑爆） */
export const createInviteCodes = (
  options: {
    count?: number;
    maxUses?: number;
    expiresInDays?: number;
    note?: string;
  },
  existing: InviteCodeEntry[] = []
): InviteCodeEntry[] => {
  const count = Math.min(200, Math.max(1, Math.floor(Number(options.count) || 1)));
  const maxUses = Math.min(10000, Math.max(1, Math.floor(Number(options.maxUses) || 1)));
  const days = Math.floor(Number(options.expiresInDays) || 0);
  const note = (options.note || '').trim().slice(0, 60);
  const now = Date.now();
  const seen = new Set(existing.map((item) => normalizeInviteCode(item.code)));
  const created: InviteCodeEntry[] = [];

  let guard = 0;
  while (created.length < count && guard < count * 20) {
    guard += 1;
    const code = generateInviteCode();
    const key = normalizeInviteCode(code);
    if (seen.has(key)) continue;
    seen.add(key);
    created.push({
      code,
      note: note || undefined,
      maxUses,
      usedCount: 0,
      createdAt: now,
      expiresAt: days > 0 ? now + days * 24 * 60 * 60 * 1000 : undefined,
      disabled: false,
      usedBy: [],
    });
  }
  return created;
};

/** 邀请码是否真的需要用户填写 */
export const isInviteCodeRequired = (config: AdminConfig | null | undefined): boolean =>
  Boolean(
    config?.UserConfig?.AllowRegister && config?.UserConfig?.InviteCodeRequired
  );
