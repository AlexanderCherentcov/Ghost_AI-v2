'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { TokenIcon, CheckIcon } from '@/components/icons';
import { formatTokens } from '@/lib/utils';
import { cn } from '@/lib/utils';

const PLANS = [
  { key: 'FREE',  name: 'Ghost Free',  price: 0,    tokens: 50_000,      features: ['Chat только', '50K токенов в мес', 'Базовая поддержка'] },
  { key: 'PRO',   name: 'Ghost Pro',   price: 499,  tokens: 500_000,     features: ['Все режимы', '500K токенов в мес', 'Приоритет'], badge: 'Популярный' },
  { key: 'ULTRA', name: 'Ghost Ultra', price: 1490, tokens: 2_000_000,   features: ['Все режимы', '2M токенов в мес', 'API доступ'] },
  { key: 'TEAM',  name: 'Ghost Team',  price: 3900, tokens: 10_000_000,  features: ['До 10 юзеров', '10M токенов в мес', 'Dedicated поддержка'] },
];

const PACKS = [
  { key: 'STARTER', name: 'Starter', price: 99,   tokens: 100_000 },
  { key: 'MEDIUM',  name: 'Medium',  price: 390,  tokens: 500_000 },
  { key: 'LARGE',   name: 'Large',   price: 1290, tokens: 2_000_000 },
  { key: 'MEGA',    name: 'Mega',    price: 4900, tokens: 10_000_000 },
];

export default function BillingPage() {
  const { user, setUser } = useAuthStore();
  const [tab, setTab] = useState<'plans' | 'packs'>('plans');
  const [loading, setLoading] = useState<string | null>(null);

  async function handleBuy(type: 'TOKEN_PACK' | 'SUBSCRIPTION', key: string) {
    setLoading(key);
    try {
      const { paymentUrl } = await api.payments.create({ type, key });
      window.location.href = paymentUrl;
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(null);
    }
  }

  const balance = user?.tokenBalance ?? 0;
  const planTokens = { FREE: 50_000, PRO: 500_000, ULTRA: 2_000_000, TEAM: 10_000_000 };
  const maxTokens = planTokens[user?.plan ?? 'FREE'];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-[var(--border)]">
        <h1 className="text-xl font-medium text-white">Тарифы и токены</h1>
        <p className="text-sm text-[rgba(255,255,255,0.3)] mt-1">
          Текущий план: <span className="text-accent">{user?.plan ?? 'FREE'}</span>
        </p>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-6">
        {/* Balance */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TokenIcon size={18} className="text-accent" />
              <span className="font-medium text-white">Баланс токенов</span>
            </div>
            <span className="text-sm text-[rgba(255,255,255,0.4)]">
              {formatTokens(balance)} / {formatTokens(maxTokens)}
            </span>
          </div>
          <div className="h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-accent rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((balance / maxTokens) * 100, 100)}%` }}
              transition={{ duration: 0.8 }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-1 mb-6 w-fit">
          {(['plans', 'packs'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-5 py-2 rounded-lg text-sm transition-all',
                tab === t ? 'bg-[var(--bg-elevated)] text-white' : 'text-[rgba(255,255,255,0.4)] hover:text-white'
              )}
            >
              {t === 'plans' ? 'Подписки' : 'Разовые пакеты'}
            </button>
          ))}
        </div>

        {/* Plans */}
        {tab === 'plans' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map(({ key, name, price, tokens, features, badge }) => {
              const isCurrent = user?.plan === key;
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('card relative', badge && 'border-accent shadow-accent', isCurrent && 'opacity-60')}
                >
                  {badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-white text-xs px-3 py-1 rounded-full whitespace-nowrap">
                      {badge}
                    </div>
                  )}
                  <h3 className="font-medium text-white mb-1">{name}</h3>
                  <div className="mb-3">
                    <span className="text-xl font-medium">{price === 0 ? 'Бесплатно' : `${price} ₽`}</span>
                    {price > 0 && <span className="text-xs text-[rgba(255,255,255,0.3)]">/мес</span>}
                  </div>
                  <div className="text-sm text-accent mb-3">{formatTokens(tokens)} токенов</div>
                  <ul className="space-y-1.5 mb-5">
                    {features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-[rgba(255,255,255,0.4)]">
                        <CheckIcon size={14} className="text-accent flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && price > 0 && (
                    <button
                      onClick={() => handleBuy('SUBSCRIPTION', key)}
                      disabled={loading === key}
                      className={cn('w-full btn h-10 text-sm', badge ? 'btn-primary' : 'btn-ghost')}
                    >
                      {loading === key ? 'Загрузка...' : 'Подписаться'}
                    </button>
                  )}
                  {isCurrent && (
                    <div className="w-full h-10 flex items-center justify-center text-sm text-accent">
                      ✓ Текущий план
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Packs */}
        {tab === 'packs' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PACKS.map(({ key, name, price, tokens }) => (
              <motion.div
                key={key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="card"
              >
                <h3 className="font-medium text-white mb-2">{name}</h3>
                <div className="text-2xl font-medium mb-1">{price} ₽</div>
                <div className="text-sm text-accent mb-5">{formatTokens(tokens)} токенов</div>
                <button
                  onClick={() => handleBuy('TOKEN_PACK', key)}
                  disabled={loading === key}
                  className="w-full btn btn-ghost h-10 text-sm"
                >
                  {loading === key ? 'Загрузка...' : 'Купить'}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
