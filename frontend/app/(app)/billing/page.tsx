'use client';

import { useToast } from '@/components/ui/Toast';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { TokenIcon, CheckIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

// Тарифные пакеты токенов
// Стоимость: чат=1 токен | код=2 | документ=3 | картинка=10
const PACKS = [
  {
    key: 'BASIC',
    name: 'Базовый',
    price: 299,
    tokens: 350,
    badge: undefined as string | undefined,
    breakdown: ['300 сообщений в чат', '10 генераций картинок', '5 анализов документов'],
  },
  {
    key: 'STANDARD',
    name: 'Стандарт',
    price: 699,
    tokens: 1150,
    badge: 'Популярный',
    breakdown: ['1 000 сообщений в чат', '30 генераций картинок', '20 анализов документов'],
  },
  {
    key: 'PRO_PACK',
    name: 'Про',
    price: 1490,
    tokens: 3300,
    badge: undefined,
    breakdown: ['3 000 сообщений в чат', '80 генераций картинок', '50 анализов документов'],
  },
];

export default function BillingPage() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleBuy(key: string) {
    setLoading(key);
    try {
      const { paymentUrl } = await api.payments.create({ type: 'TOKEN_PACK', key });
      window.location.href = paymentUrl;
    } catch (err: any) {
      const { show } = useToast();
      show(err.message, 'error');
    } finally {
      setLoading(null);
    }
  }

  const balance = user?.tokenBalance ?? 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-[var(--border)]">
        <h1 className="text-xl font-medium text-white">Пополнение токенов</h1>
        <p className="text-sm text-[rgba(255,255,255,0.3)] mt-1">
          Выберите пакет и пополните баланс
        </p>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-6">
        {/* Balance */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <TokenIcon size={18} className="text-accent" />
            <span className="font-medium text-white">Баланс токенов</span>
          </div>
          <div className="text-3xl font-medium text-accent">{balance.toLocaleString('ru-RU')}</div>
          <p className="text-xs text-[rgba(255,255,255,0.3)] mt-2">
            Чат — 1 токен &nbsp;·&nbsp; Код — 2 &nbsp;·&nbsp; Документ — 3 &nbsp;·&nbsp; Картинка — 10
          </p>
        </div>

        {/* Packs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PACKS.map(({ key, name, price, tokens, badge, breakdown }) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn('card relative', badge && 'border-accent')}
            >
              {badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-black text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap">
                  {badge}
                </div>
              )}
              <h3 className="font-medium text-white mb-1">{name}</h3>
              <div className="text-2xl font-medium mb-1">{price} ₽</div>
              <div className="text-lg text-accent font-medium mb-4">{tokens.toLocaleString('ru-RU')} токенов</div>
              <ul className="space-y-1.5 mb-5">
                {breakdown.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-[rgba(255,255,255,0.4)]">
                    <CheckIcon size={12} className="text-accent flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleBuy(key)}
                disabled={loading === key}
                className={cn('w-full btn h-10 text-sm', badge ? 'btn-primary' : 'btn-ghost')}
              >
                {loading === key ? 'Загрузка...' : 'Купить'}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
