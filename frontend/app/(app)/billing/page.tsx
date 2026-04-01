'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { CheckIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

const PLANS = [
  {
    key: 'BASIC',
    name: 'Базовый',
    price: 699,
    price_yearly: 594,
    badge: undefined as string | undefined,
    features: ['Безлимитный чат (std)', '20 картинок/день', '40 файлов/месяц'],
  },
  {
    key: 'STANDARD',
    name: 'Стандарт',
    price: 1199,
    price_yearly: 1019,
    badge: 'Популярный',
    features: ['Безлимитный чат (std)', '50 про-сообщений/день', '30 картинок/день', '1 видео/день', '150 файлов/месяц'],
  },
  {
    key: 'PRO',
    name: 'Про',
    price: 2490,
    price_yearly: 2117,
    badge: undefined,
    features: ['Безлимитный чат ✨', 'Умные модели без ограничений', '80 картинок/день', '3 видео/день', '500 файлов/месяц'],
  },
  {
    key: 'ULTRA',
    name: 'Ультра',
    price: 5490,
    price_yearly: 4667,
    badge: 'Максимум',
    features: ['Безлимитный чат ✨', 'Умные модели без ограничений', '150 картинок/день', '5 видео/день', '1 000 файлов/месяц', 'Приоритетная обработка'],
  },
];

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  if (limit <= 0) return null;
  const pct = limit === -1 ? 0 : Math.min((used / limit) * 100, 100);
  const displayLimit = limit === -1 ? '∞' : limit;
  return (
    <div>
      <div className="flex justify-between text-xs text-[rgba(255,255,255,0.4)] mb-1">
        <span>{label}</span>
        <span>{used} / {displayLimit}</span>
      </div>
      {limit !== -1 && (
        <div className="h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const { user } = useAuthStore();
  const { show } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  async function handleBuy(planKey: string) {
    setLoading(planKey);
    try {
      const { paymentUrl } = await api.payments.create({ plan: planKey, billing: billingCycle });
      window.location.href = paymentUrl;
    } catch (err: any) {
      show(err.message, 'error');
    } finally {
      setLoading(null);
    }
  }

  const plan = user?.plan ?? 'FREE';

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-[var(--border)]">
        <h1 className="text-xl font-medium text-white">Тарифы</h1>
        <p className="text-sm text-[rgba(255,255,255,0.3)] mt-1">Текущий план: <span className="text-accent">{plan}</span></p>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full px-6 py-6 space-y-8">

        {/* Current usage */}
        {user && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
            <p className="text-xs font-medium text-[rgba(255,255,255,0.4)] uppercase tracking-wider">Использование сегодня</p>

            {/* Message progress — only for FREE (all paid plans show ∞ to user) */}
            {plan === 'FREE' && (
              <UsageBar used={user.std_messages_today} limit={user.std_messages_daily_limit} label="Сообщений сегодня" />
            )}
            {/* Pro messages — show only for STANDARD (PRO/ULTRA have hidden cap) */}
            {user.pro_messages_daily_limit !== 0 && plan === 'STANDARD' && (
              <UsageBar used={user.pro_messages_today} limit={user.pro_messages_daily_limit} label="Про-сообщений" />
            )}
            {/* Unlimited chat label for all paid plans */}
            {plan !== 'FREE' && (
              <p className="text-xs text-[rgba(255,255,255,0.3)]">
                {plan === 'PRO' || plan === 'ULTRA' ? '✨ Чат: безлимитный' : 'Стандартный чат: безлимитный'}
              </p>
            )}

            <UsageBar used={user.images_today} limit={user.images_daily_limit} label="Картинок" />
            {user.videos_daily_limit > 0 && (
              <UsageBar used={user.videos_today} limit={user.videos_daily_limit} label="Видео" />
            )}
            {user.files_monthly_limit > 0 && (
              <UsageBar used={user.files_used} limit={user.files_monthly_limit} label="Файлов (месяц)" />
            )}
          </div>
        )}

        {/* Billing toggle */}
        <div className="flex items-center gap-3">
          <span className={cn('text-sm', billingCycle === 'monthly' ? 'text-white' : 'text-[rgba(255,255,255,0.4)]')}>Месяц</span>
          <button
            onClick={() => setBillingCycle(c => c === 'monthly' ? 'yearly' : 'monthly')}
            className={cn(
              'relative w-11 h-6 rounded-full transition-colors',
              billingCycle === 'yearly' ? 'bg-accent' : 'bg-[var(--bg-elevated)]'
            )}
          >
            <span className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
              billingCycle === 'yearly' ? 'translate-x-5' : 'translate-x-0'
            )} />
          </button>
          <span className={cn('text-sm', billingCycle === 'yearly' ? 'text-white' : 'text-[rgba(255,255,255,0.4)]')}>Год</span>
          {billingCycle === 'yearly' && (
            <span className="text-xs font-medium bg-accent/20 text-accent px-2 py-0.5 rounded-full">Скидка 15%</span>
          )}
        </div>

        {/* Plans */}
        <div>
          <h2 className="text-sm font-medium text-[rgba(255,255,255,0.5)] uppercase tracking-wider mb-4">Подписки</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {PLANS.map(({ key, name, price, price_yearly, badge, features }) => {
              const displayPrice = billingCycle === 'yearly' ? price_yearly : price;
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'card relative flex flex-col',
                    badge === 'Максимум' && 'border-accent',
                    badge === 'Популярный' && 'border-accent/60',
                    plan === key && 'border-accent/40 bg-accent/5'
                  )}
                >
                  {/* Badge row — badge on top, active pill below to avoid overlap */}
                  {badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-black text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap">
                      {badge}
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-1 min-h-[18px]">
                    <h3 className="font-medium text-white">{name}</h3>
                    {plan === key && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-accent/40 text-accent bg-accent/10 whitespace-nowrap ml-2">
                        ✓ Активен
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-medium mb-1">
                    {displayPrice.toLocaleString('ru-RU')} ₽
                    <span className="text-sm text-[rgba(255,255,255,0.3)]">/мес</span>
                  </div>
                  {billingCycle === 'yearly' && (
                    <p className="text-[11px] text-[rgba(255,255,255,0.3)] mb-3">
                      {(displayPrice * 12).toLocaleString('ru-RU')} ₽/год
                    </p>
                  )}
                  <ul className="space-y-1.5 mb-5 flex-1 mt-2">
                    {features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-[rgba(255,255,255,0.4)]">
                        <CheckIcon size={12} className="text-accent flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => handleBuy(key)}
                    disabled={loading === key}
                    className={cn(
                      'w-full btn h-9 text-sm',
                      plan === key
                        ? 'btn-accent-outline'
                        : (badge === 'Максимум' || badge === 'Популярный') ? 'btn-primary' : 'btn-ghost'
                    )}
                  >
                    {loading === key ? 'Загрузка...' : plan === key ? 'Продлить' : 'Подключить'}
                  </button>
                </motion.div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
