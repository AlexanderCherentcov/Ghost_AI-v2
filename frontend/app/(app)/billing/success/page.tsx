'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckIcon, XIcon } from '@/components/icons';
import { api } from '@/lib/api';

type Status = 'loading' | 'succeeded' | 'cancelled' | 'pending' | 'error';

export default function BillingSuccessPage() {
  const params = useSearchParams();
  const paymentId = params.get('paymentId') ?? params.get('payment_id');
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    if (!paymentId) { setStatus('error'); return; }

    let attempts = 0;
    const MAX = 8;

    async function poll() {
      try {
        const data = await api.payments.status(paymentId!);
        if (data.status === 'SUCCEEDED') { setStatus('succeeded'); return; }
        if (data.status === 'CANCELED' || data.status === 'CANCELLED') { setStatus('cancelled'); return; }
        if (++attempts < MAX) setTimeout(poll, 2000);
        else setStatus(data.status === 'PENDING' ? 'pending' : 'error');
      } catch {
        setStatus('error');
      }
    }

    poll();
  }, [paymentId]);

  if (status === 'loading') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[rgba(255,255,255,0.4)]">Проверяем статус оплаты...</p>
      </div>
    );
  }

  if (status === 'succeeded') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', bounce: 0.3 }}>
          <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckIcon size={28} className="text-green-400" />
          </div>
          <h1 className="text-2xl font-medium text-white mb-3">Оплата прошла!</h1>
          <p className="text-sm text-[rgba(255,255,255,0.4)] mb-8 max-w-sm mx-auto">
            Токены начислены на ваш баланс.
          </p>
          <Link href="/chat" className="btn btn-primary h-11 px-8">Вернуться в чат</Link>
        </motion.div>
      </div>
    );
  }

  if (status === 'cancelled') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', bounce: 0.3 }}>
          <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
            <XIcon size={28} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-medium text-white mb-3">Оплата отменена</h1>
          <p className="text-sm text-[rgba(255,255,255,0.4)] mb-8 max-w-sm mx-auto">
            Платёж был отменён. Токены не списаны.
          </p>
          <Link href="/billing" className="btn btn-ghost h-11 px-8">Вернуться к тарифам</Link>
        </motion.div>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-16 h-16 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center mx-auto mb-6">
            <div className="w-6 h-6 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <h1 className="text-2xl font-medium text-white mb-3">Платёж обрабатывается</h1>
          <p className="text-sm text-[rgba(255,255,255,0.4)] mb-8 max-w-sm mx-auto">
            ЮКасса ещё обрабатывает платёж. Токены будут начислены автоматически.
          </p>
          <Link href="/billing" className="btn btn-ghost h-11 px-8">Вернуться к тарифам</Link>
        </motion.div>
      </div>
    );
  }

  // error
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto mb-6">
          <XIcon size={28} className="text-red-400" />
        </div>
        <h1 className="text-2xl font-medium text-white mb-3">Не удалось проверить</h1>
        <p className="text-sm text-[rgba(255,255,255,0.4)] mb-8 max-w-sm mx-auto">
          Не удалось получить статус платежа. Если деньги списаны — обратитесь в поддержку.
        </p>
        <Link href="/billing" className="btn btn-ghost h-11 px-8">Вернуться к тарифам</Link>
      </motion.div>
    </div>
  );
}
