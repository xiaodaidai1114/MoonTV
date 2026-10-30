'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getDoubanList } from '@/lib/douban.client';
import { DoubanItem } from '@/lib/types';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

interface CollectionDef {
  key: string;
  title: string;
  desc: string;
  tag: string;
  type: 'tv' | 'movie';
}

// 以内容特征组织分区，避免缺乏数据支撑的年龄标签
const COLLECTIONS: CollectionDef[] = [
  {
    key: 'classic',
    title: '经典怀旧',
    desc: '年代老片与经典剧集，适合喜欢怀旧质感的观众',
    tag: '经典',
    type: 'movie',
  },
  {
    key: 'family',
    title: '合家欢',
    desc: '动画与家庭题材，适合全家一起看',
    tag: '动画',
    type: 'movie',
  },
  {
    key: 'suspense',
    title: '悬疑烧脑',
    desc: '推理反转与悬疑佳作，烧脑不困',
    tag: '悬疑',
    type: 'movie',
  },
  {
    key: 'top',
    title: '高分佳作',
    desc: '口碑与评分双高的精选内容',
    tag: '豆瓣高分',
    type: 'movie',
  },
  {
    key: 'cn-tv',
    title: '国产剧集',
    desc: '国产电视剧与热门国剧',
    tag: '国产剧',
    type: 'tv',
  },
  {
    key: 'documentary',
    title: '纪录片纪实',
    desc: '真实故事与人文纪实',
    tag: '纪录片',
    type: 'movie',
  },
];

export default function CollectionsPage() {
  const [activeKey, setActiveKey] = useState<string>(COLLECTIONS[0].key);
  const [items, setItems] = useState<DoubanItem[]>([]);
  const [loading, setLoading] = useState(true);

  const active =
    COLLECTIONS.find((c) => c.key === activeKey) || COLLECTIONS[0];

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const res = await getDoubanList({
          tag: active.tag,
          type: active.type,
          pageLimit: 30,
          pageStart: 0,
        });
        if (!cancelled) {
          setItems(res.code === 200 ? res.list : []);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeKey]);

  return (
    <PageLayout activePath='/collections'>
      <div className='px-4 sm:px-10 py-6 mb-14'>
        <h1 className='text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2'>
          特色专区
        </h1>
        <p className='text-sm text-gray-500 dark:text-gray-400 mb-6'>
          {active.desc}
        </p>

        {/* 分区切换 */}
        <div className='flex flex-wrap gap-2 mb-8'>
          {COLLECTIONS.map((c) => (
            <button
              key={c.key}
              onClick={() => setActiveKey(c.key)}
              className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                activeKey === c.key
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {c.title}
            </button>
          ))}
        </div>

        {/* 内容网格 */}
        {loading ? (
          <div className='flex items-center justify-center py-20 text-gray-400'>
            <Loader2 className='w-6 h-6 animate-spin mr-2' />
            正在加载...
          </div>
        ) : items.length === 0 ? (
          <div className='flex items-center justify-center py-20 text-gray-400'>
            该分区暂无内容
          </div>
        ) : (
          <div className='grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4'>
            {items.map((item) => (
              <VideoCard
                key={item.id}
                from='douban'
                title={item.title}
                poster={item.poster}
                douban_id={Number(item.id)}
                rate={item.rate}
                year={item.year}
                type={active.type}
              />
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
