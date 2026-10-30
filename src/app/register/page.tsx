/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

function RegisterPageClient() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registerEnabled, setRegisterEnabled] = useState(true);

  const { siteName } = useSite();

  useEffect(() => {
    fetch('/api/register')
      .then((res) => res.json())
      .then((data) => {
        if (!data.enabled) {
          setRegisterEnabled(false);
          setError('当前站点未开放注册');
        } else if (!data.hasAvailableCodes) {
          setRegisterEnabled(false);
          setError('当前没有可用的邀请码');
        }
      })
      .catch(() => {
        setRegisterEnabled(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!username || username.trim().length < 2) {
      setError('用户名至少2个字符');
      return;
    }
    if (!password || password.length < 6) {
      setError('密码至少6个字符');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (!invitationCode) {
      setError('邀请码不能为空');
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          invitationCode,
        }),
      });

      if (res.ok) {
        router.replace('/');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '注册失败，请稍后重试');
      }
    } catch (error) {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
      <div className='absolute top-4 right-4'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40 backdrop-blur-xl shadow-2xl p-10 dark:border dark:border-zinc-800'>
        <h1 className='text-green-600 tracking-tight text-center text-3xl font-extrabold mb-2 bg-clip-text drop-shadow-sm'>
          {siteName}
        </h1>
        <p className='text-center text-sm text-gray-500 dark:text-gray-400 mb-8'>
          用户注册
        </p>
        <form onSubmit={handleSubmit} className='space-y-6'>
          <div>
            <label htmlFor='username' className='sr-only'>
              用户名
            </label>
            <input
              id='username'
              type='text'
              autoComplete='username'
              className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
              placeholder='输入用户名（至少2个字符）'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={!registerEnabled}
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
              className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
              placeholder='输入密码（至少6个字符）'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!registerEnabled}
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
              className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
              placeholder='再次输入密码'
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={!registerEnabled}
            />
          </div>

          <div>
            <label htmlFor='invitationCode' className='sr-only'>
              邀请码
            </label>
            <input
              id='invitationCode'
              type='text'
              className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
              placeholder='输入邀请码'
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value)}
              disabled={!registerEnabled}
            />
          </div>

          {error && (
            <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
          )}

          <button
            type='submit'
            disabled={
              !registerEnabled ||
              !username ||
              !password ||
              !confirmPassword ||
              !invitationCode ||
              loading
            }
            className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:from-green-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {loading ? '注册中...' : '注册'}
          </button>
        </form>

        <div className='mt-6 text-center'>
          <button
            onClick={() => router.push('/login')}
            className='text-sm text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors'
          >
            已有账号？返回登录
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RegisterPageClient />
    </Suspense>
  );
}
