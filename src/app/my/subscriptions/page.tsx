'use client';

import PageLayout from '@/components/PageLayout';
import SubscriptionManager from '@/components/SubscriptionManager';

export default function MySubscriptionsPage() {
  return (
    <PageLayout activePath='/my/subscriptions'>
      <div className='px-4 py-6 md:px-10 max-w-3xl mx-auto'>
        <h1 className='text-2xl font-bold text-gray-800 dark:text-gray-200 mb-6'>
          我的订阅
        </h1>
        <SubscriptionManager />
      </div>
    </PageLayout>
  );
}
