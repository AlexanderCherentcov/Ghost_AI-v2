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
    badge: undefined as string | undefined,
    features: ['500 сообщений/месяц', '30 картинок/месяц', '40 файлов/месяц'],
  },
  {
    key: 'STANDARD',
    name: 'Стандарт',
    price: 1199,
    badge: 'Популярный',
    features: ['1 500 сообщений/месяц', '70 картинок/месяц', '150 файлов/месяц'],
  },
  {
    key: 'PRO',
    name: 'Про',
    price: 2490,
    badge: undefined,
    features: ['Безлимитный чат', '150 картинок/месяц', '500 файлов/месяц', 'Модель DeepSeek'],
  },
  {
    key: 'ULTRA',
    name: 'Ультра',
    price: 5490,
    badge: 'Максимум',
    features: ['Безлимитный чат', '350 картинок/месяц', '1 000 файлов/месяц', 'Модель DeepSeek', 'Приоритетная обработка'],
  },
];

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  if (limit <= 0) return null;
  const pct = Math.min((used / limit) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-xs text-[rgba(255,255,255,0.4)] mb-1">
        <span>{label}</span>
        <span>{used} / {limit}</span>
      </div>
      <div className="h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { user } = useAuthStore();
  const { show } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleBuy(planKey: string) {
    setLoading(planKey);
    try {
      const { paymentUrl } = await api.payments.create({ plan: planKey });
      window.location.href = paymentUrl;
    } catch (err: any) {
      show(err.message, 'error');
    } finally {
      setLoading(null);
    }
  }

  const plan = user?.plan ?? 'FREE';
  const isDaily = plan === 'FREE' || plan === 'PRO' || plan === 'ULTRA';

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
            <p className="text-xs font-medium text-[rgba(255,255,255,0.4)] uppercase tracking-wider">Использование</p>
            {isDaily ? (
              <>
                <div>
                  <div className="flex justify-between text-xs text-[rgba(255,255,255,0.4)] mb-1">
                    <span>Сообщения сегодня</span>
                    <span>{user.messagesToday} / {plan === 'FREE' ? 10 : plan === 'PRO' ? 200 : 400}</span>
                  </div>
                  <div className="h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full"
                      style={{ width: `${Math.min((user.messagesToday / (plan === 'FREE' ? 10 : plan === 'PRO' ? 200 : 400)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                {plan !== 'FREE' && (
                  <p className="text-xs text-[rgba(255,255,255,0.3)]">Чат: безлимитный (дневной сброс)</p>
                )}
              </>
            ) : (
              <UsageBar used={user.messagesUsed} limit={user.messagesLimit} label="Сообщений" />
            )}
            <UsageBar used={user.imagesUsed} limit={user.imagesLimit} label="Картинок" />
            {user.filesLimit > 0 && (
              <UsageBar used={user.filesUsed} limit={user.filesLimit} label="Файлов" />
            )}
          </div>
        )}

        {/* Plans */}
        <div>
          <h2 className="text-sm font-medium text-[rgba(255,255,255,0.5)] uppercase tracking-wider mb-4">Подписки</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {PLANS.map(({ key, name, price, badge, features }) => (
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
                {badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-black text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap">
                    {badge}
                  </div>
                )}
                {plan === key && (
                  <div className="absolute -top-3 right-3 bg-[var(--bg-elevated)] border border-accent/40 text-accent text-[10px] font-medium px-2 py-0.5 rounded-full">
                    Активен
                  </div>
                )}
                <h3 className="font-medium text-white mb-1">{name}</h3>
                <div className="text-2xl font-medium mb-4">
                  {price.toLocaleString('ru-RU')} ₽
                  <span className="text-sm text-[rgba(255,255,255,0.3)]">/мес</span>
                </div>
                <ul className="space-y-1.5 mb-5 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-[rgba(255,255,255,0.4)]">
                      <CheckIcon size={12} className="text-accent flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleBuy(key)}
                  disabled={loading === key || plan === key}
                  className={cn(
                    'w-full btn h-9 text-sm',
                    (badge === 'Максимум' || badge === 'Популярный') ? 'btn-primary' : 'btn-ghost',
                    plan === key && 'opacity-50 cursor-default'
                  )}
                >
                  {loading === key ? 'Загрузка...' : plan === key ? 'Текущий план' : 'Подключить'}
                </button>
              </motion.div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
