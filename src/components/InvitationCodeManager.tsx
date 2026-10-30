/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Copy, Plus, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { useState } from 'react';

interface InvitationCode {
  code: string;
  createdAt: number;
  createdBy: string;
  usedBy?: string;
  usedAt?: number;
  expired?: boolean;
}

export default function InvitationCodeManager() {
  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchCodes = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/invitation');
      if (res.ok) {
        const data = await res.json();
        setCodes(data.codes || []);
      }
    } catch (e) {
      console.error('获取邀请码失败', e);
    } finally {
      setLoading(false);
    }
  };

  useState(() => {
    fetchCodes();
  });

  const handleGenerate = async (count = 1) => {
    try {
      setGenerating(true);
      const res = await fetch('/api/admin/invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      });
      if (res.ok) {
        await fetchCodes();
      }
    } catch (e) {
      console.error('生成邀请码失败', e);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm('确定删除邀请码 ' + code + ' ?')) return;
    try {
      const res = await fetch('/api/admin/invitation?code=' + code, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchCodes();
      }
    } catch (e) {
      console.error('删除邀请码失败', e);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const availableCodes = codes.filter((c) => !c.usedBy && !c.expired);
  const usedCodes = codes.filter((c) => c.usedBy);

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
            邀请码管理
          </h3>
          <p className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
            生成邀请码供新用户注册使用
          </p>
        </div>
        <div className='flex gap-2'>
          <button
            onClick={() => handleGenerate(1)}
            disabled={generating}
            className='inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50'
          >
            <Plus size={16} />
            {generating ? '生成中...' : '生成1个'}
          </button>
          <button
            onClick={() => handleGenerate(10)}
            disabled={generating}
            className='inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50'
          >
            <Plus size={16} />
            批量生成10个
          </button>
        </div>
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div className='rounded-lg border border-gray-200 dark:border-gray-700 p-4'>
          <div className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            可用邀请码
          </div>
          <div className='text-2xl font-bold text-green-600 dark:text-green-400 mt-1'>
            {availableCodes.length}
          </div>
        </div>
        <div className='rounded-lg border border-gray-200 dark:border-gray-700 p-4'>
          <div className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            已使用邀请码
          </div>
          <div className='text-2xl font-bold text-gray-500 dark:text-gray-400 mt-1'>
            {usedCodes.length}
          </div>
        </div>
      </div>

      {loading ? (
        <div className='text-center py-8 text-gray-500 dark:text-gray-400'>
          加载中...
        </div>
      ) : codes.length === 0 ? (
        <div className='text-center py-8 text-gray-500 dark:text-gray-400'>
          暂无邀请码，点击上方按钮生成
        </div>
      ) : (
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg max-h-[28rem] overflow-y-auto overflow-x-auto'>
          <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
            <thead className='bg-gray-50 dark:bg-zinc-800 sticky top-0'>
              <tr>
                <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>邀请码</th>
                <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>状态</th>
                <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>创建时间</th>
                <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>使用者</th>
                <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>操作</th>
              </tr>
            </thead>
            <tbody className='bg-white dark:bg-zinc-900 divide-y divide-gray-200 dark:divide-gray-700'>
              {codes.map((item) => (
                <tr key={item.code}>
                  <td className='px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100'>{item.code}</td>
                  <td className='px-4 py-3 text-sm'>
                    {item.usedBy ? (
                      <span className='inline-flex items-center gap-1 text-gray-500 dark:text-gray-400'>
                        <XCircle size={14} />
                        已使用
                      </span>
                    ) : (
                      <span className='inline-flex items-center gap-1 text-green-600 dark:text-green-400'>
                        <CheckCircle size={14} />
                        可用
                      </span>
                    )}
                  </td>
                  <td className='px-4 py-3 text-sm text-gray-500 dark:text-gray-400'>{formatDate(item.createdAt)}</td>
                  <td className='px-4 py-3 text-sm text-gray-500 dark:text-gray-400'>{item.usedBy || '-'}</td>
                  <td className='px-4 py-3 text-sm'>
                    <div className='flex gap-2'>
                      {!item.usedBy && (
                        <button
                          onClick={() => handleCopy(item.code)}
                          className='text-gray-500 hover:text-green-600 dark:hover:text-green-400 transition-colors'
                          title='复制'
                        >
                          {copiedCode === item.code ? (
                            <CheckCircle size={16} className='text-green-600' />
                          ) : (
                            <Copy size={16} />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item.code)}
                        className='text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors'
                        title='删除'
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
