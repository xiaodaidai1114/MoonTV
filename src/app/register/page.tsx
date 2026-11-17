/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { ArrowLeft, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

function RegisterPageClient() {
  const router = useRouter();
  const { siteName } = useSite();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteRequired, setInviteRequired] = useState(false);
  const [registerEnabled, setRegisterEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const runtime = (window as any).RUNTIME_CONFIG;
      setInviteRequired(Boolean(runtime?.INVITE_CODE_REQUIRED));
      setRegisterEnabled(Boolean(runtime?.ENABLE_REGISTER));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) return setError('请输入用户名');
    if (!password) return setError('请输入密码');
    if (password !== confirmPassword) return setError('两次输入的密码不一致');
    if (inviteRequired && !inviteCode.trim()) return setError('请输入邀请码');

    try {
      setLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          ...(inviteRequired ? { inviteCode: inviteCode.trim() } : {}),
        }),
      });

      if (res.ok) {
        router.replace('/');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || '注册失败，请稍后重试');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur';

  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
      <div className='absolute top-4 right-4'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40 backdrop-blur-xl shadow-2xl p-8 sm:p-10 dark:border dark:border-zinc-800'>
        <div className='flex items-center gap-2 mb-2'>
          <Link
            href='/login'
            className='inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          >
            <ArrowLeft className='w-3.5 h-3.5' />
            返回登录
          </Link>
        </div>

        <h1 className='text-green-600 tracking-tight text-center text-3xl font-extrabold mb-2 bg-clip-text drop-shadow-sm'>
          {siteName}
        </h1>
        <p className='text-center text-sm text-gray-500 dark:text-gray-400 mb-6'>
          {inviteRequired ? '本站仅限邀请注册' : '注册新账号'}
        </p>

        {!registerEnabled ? (
          <div className='text-center space-y-4'>
            <p className='text-sm text-gray-600 dark:text-gray-300'>
              站长暂未开放注册。
            </p>
            <Link
              href='/login'
              className='inline-flex justify-center rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700'
            >
              返回登录
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className='space-y-4'>
            <div>
              <label htmlFor='username' className='sr-only'>
                用户名
              </label>
              <input
                id='username'
                type='text'
                autoComplete='username'
                className={inputClass}
                placeholder='用户名'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor='password' className='sr-only'>
                密码
              </label>
              <input
                id='password'
                type='password'
                autoComplete='new-password'
                className={inputClass}
                placeholder='密码'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor='confirmPassword' className='sr-only'>
                确认密码
              </label>
              <input
                id='confirmPassword'
                type='password'
                autoComplete='new-password'
                className={inputClass}
                placeholder='再输入一次密码'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {inviteRequired && (
              <div>
                <label htmlFor='inviteCode' className='sr-only'>
                  邀请码
                </label>
                <div className='relative'>
                  <Ticket className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' />
                  <input
                    id='inviteCode'
                    type='text'
                    inputMode='text'
                    autoComplete='off'
                    autoCapitalize='characters'
                    spellCheck={false}
                    className={`${inputClass} pl-9 font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal`}
                    placeholder='邀请码'
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  />
                </div>
                <p className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
                  邀请码由站长发放，一个邀请码可能限次数使用
                </p>
              </div>
            )}

            {error && (
              <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
            )}

            <button
              type='submit'
              disabled={loading}
              className='w-full inline-flex justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {loading ? '注册中...' : '注册并登录'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageClient />
    </Suspense>
  );
}
