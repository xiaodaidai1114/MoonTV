import { getConfig } from '@/lib/config';

import RegisterForm from './register-form';

export const dynamic = 'force-dynamic';

/**
 * 注册页：注册开关与邀请码要求都在服务端读取，
 * 避免依赖浏览器端注入的运行时配置。
 */
export default async function RegisterPage() {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  let registerEnabled = process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true';
  let inviteRequired = false;

  if (storageType !== 'localstorage') {
    try {
      const config = await getConfig();
      registerEnabled = Boolean(config.UserConfig.AllowRegister);
      inviteRequired = config.UserConfig.InviteCodeRequired === true;
    } catch {
      // 读不到配置时退回「未开放注册」，避免给出误导入口
      registerEnabled = false;
    }
  }

  return (
    <RegisterForm
      inviteRequired={inviteRequired}
      registerEnabled={registerEnabled}
    />
  );
}
