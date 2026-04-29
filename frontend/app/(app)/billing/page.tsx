'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/auth.store';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { CheckIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

// Plans with fake discount display:
// - Monthly: shown crossed-out = actual × 2 (fake 50% off)
// - Yearly: actual = price × 12 × 0.8, crossed-out = fake_monthly × 12
const PLANS = [
  {
    key: 'BASIC',
    name: 'Базовый',
    price: 790,         // real monthly
    price_yearly: 7584, // real yearly (790 * 12 * 0.8)
    caspers: 300,
    proFreeDaily: 0,
    badge: undefined as string | undefined,
    features: [
      'Стандартный чат: безлимит',
      '300 Caspers в месяц',
      'Про чат: за Caspers (1/сообщ.)',
      'Изображения — 10 Caspers/шт',
      'Видео — от 25 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
  {
    key: 'PRO',
    name: 'Про',
    price: 1690,
    price_yearly: 16224, // 1690 * 12 * 0.8
    caspers: 700,
    proFreeDaily: 20,
    badge: 'Популярный',
    features: [
      'Стандартный чат: безлимит',
      '700 Caspers в месяц',
      'Про чат: 20 запросов/день бесплатно',
      'Изображения — 10 Caspers/шт',
      'Видео — от 25 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
  {
    key: 'VIP',
    name: 'VIP',
    price: 3990,
    price_yearly: 38304, // 3990 * 12 * 0.8
    caspers: 1800,
    proFreeDaily: 50,
    badge: undefined,
    features: [
      'Стандартный чат: безлимит',
      '1 800 Caspers в месяц',
      'Про чат: 50 запросов/день бесплатно',
      'Изображения — 10 Caspers/шт',
      'Видео — от 25 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
  {
    key: 'ULTRA',
    name: 'Ультра',
    price: 5990,
    price_yearly: 57504, // 5990 * 12 * 0.8
    caspers: 2800,
    proFreeDaily: -1,
    badge: 'Максимум',
    features: [
      'Стандартный чат: безлимит',
      '2 800 Caspers в месяц',
      'Про чат: безлимит',
      'Изображения — 10 Caspers/шт',
      'Видео — от 25 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
];

function calculateCasperPrice(amount: number): number {
  if (amount <= 0) return 0;
  const tiers = [
    { max: 100, price: 3.0 },
    { max: 100, price: 2.9 },
    { max: 100, price: 2.8 },
    { max: 100, price: 2.7 },
    { max: 100, price: 2.6 },
    { max: 100, price: 2.5 },
    { max: 100, price: 2.4 },
    { max: 100, price: 2.3 },
    { max: 100, price: 2.2 },
    { max: 100, price: 2.1 },
  ];
  let total = 0;
  let remaining = amount;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const inTier = Math.min(remaining, tier.max);
    total += inTier * tier.price;
    remaining -= inTier;
  }
  return Math.round(total);
}

function pricePerCasper(amount: number): number {
  if (amount <= 0) return 3.0;
  const total = calculateCasperPrice(amount);
  return Math.round((total / amount) * 10) / 10;
}

export default function BillingPage() {
  const { user } = useAuthStore();
  const { show } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [casperSlider, setCasperSlider] = useState(100);

  const plan = user?.plan ?? 'FREE';
  const isPaid = plan !== 'FREE';

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

  async function handleBuyCaspers() {
    if (!isPaid) return;
    setLoading('caspers');
    try {
      const { paymentUrl } = await api.payments.createCaspers({ amount: casperSlider });
      window.location.href = paymentUrl;
    } catch (err: any) {
      show(err.message, 'error');
    } finally {
      setLoading(null);
    }
  }

  const casperTotal = calculateCasperPrice(casperSlider);
  const casperPPU = pricePerCasper(casperSlider);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className="px-6 py-5 border-b border-[var(--border)]">
        <h1 className="text-xl font-medium text-white">Тарифы</h1>
        <p className="text-sm text-[rgba(255,255,255,0.3)] mt-1">
          Текущий план: <span className="text-accent">{plan}</span>
        </p>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-6 space-y-8">

        {/* Casper balance display */}
        {user && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-1">
                  Баланс Caspers
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-medium text-white">
                    {user.caspers_balance.toLocaleString('ru-RU')}
                  </span>
                  <span className="text-[rgba(255,255,255,0.5)] text-sm">Caspers</span>
                </div>
                {plan !== 'FREE' && (
                  <p className="text-xs text-[rgba(255,255,255,0.3)] mt-1">
                    {user.caspers_monthly} Caspers начисляется каждый месяц
                  </p>
                )}
              </div>
              {plan === 'FREE' && (
                <div className="text-right">
                  <p className="text-xs text-[rgba(255,255,255,0.4)]">5 сообщений/день</p>
                  <p className="text-xs text-[rgba(255,255,255,0.4)]">5 картинок/неделю</p>
                  <p className="text-xs text-[rgba(255,255,255,0.4)]">5 треков/неделю</p>
                  <p className="text-xs text-[rgba(255,255,255,0.4)]">3 видео/неделю</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Monthly/Yearly toggle */}
        <div className="flex items-center gap-3">
          <span className={cn('text-sm', billingCycle === 'monthly' ? 'text-white' : 'text-[rgba(255,255,255,0.4)]')}>
            Месяц
          </span>
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
          <span className={cn('text-sm', billingCycle === 'yearly' ? 'text-white' : 'text-[rgba(255,255,255,0.4)]')}>
            Год
          </span>
          {billingCycle === 'yearly' && (
            <span className="text-xs font-medium bg-accent/20 text-accent px-2 py-0.5 rounded-full">
              Скидка 70%
            </span>
          )}
        </div>

        {/* Plan cards — 4 columns */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-[rgba(255,255,255,0.5)] uppercase tracking-wider">Подписки</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PLANS.map(({ key, name, price, price_yearly, caspers, badge, features }) => {
              const realPrice = billingCycle === 'yearly' ? price_yearly : price;
              // Fake crossed-out: actual × 2 (monthly), or fake_monthly × 12 (yearly)
              const fakeMonthly = price * 2;
              const fakePrice = billingCycle === 'yearly' ? fakeMonthly * 12 : fakeMonthly;

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'card relative flex flex-col',
                    badge === 'Популярный' && 'border-accent/60',
                    badge === 'Максимум' && 'border-accent',
                    plan === key && 'border-accent/40 bg-accent/5'
                  )}
                >
                  {badge && (
                    <div className={cn(
                      'absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap',
                      badge === 'Популярный' ? 'bg-accent text-black' : 'bg-accent text-black'
                    )}>
                      {badge}
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-2 min-h-[20px]">
                    <h3 className="font-medium text-white">{name}</h3>
                    {plan === key && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-accent/40 text-accent bg-accent/10 whitespace-nowrap ml-2">
                        Активен
                      </span>
                    )}
                  </div>

                  {/* Price with fake discount */}
                  <div className="mb-1">
                    <span className="text-xs text-[rgba(255,255,255,0.3)] line-through mr-2">
                      {fakePrice.toLocaleString('ru-RU')} ₽
                    </span>
                    <span className="text-xs font-medium bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                      Скидка 50%
                    </span>
                  </div>
                  <div className="text-2xl font-medium mb-1">
                    {realPrice.toLocaleString('ru-RU')} ₽
                    <span className="text-sm text-[rgba(255,255,255,0.3)]">
                      {billingCycle === 'yearly' ? '/год' : '/мес'}
                    </span>
                  </div>

                  <p className="text-[11px] text-accent mb-3">
                    {caspers.toLocaleString('ru-RU')} Caspers/мес
                  </p>

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
                    disabled={loading !== null}
                    className={cn(
                      'w-full btn h-9 text-sm',
                      plan === key
                        ? 'btn-accent-outline'
                        : badge === 'Популярный' || badge === 'Максимум'
                          ? 'btn-primary'
                          : 'btn-ghost'
                    )}
                  >
                    {loading === key ? 'Загрузка...' : plan === key ? 'Продлить' : 'Подключить'}
                  </button>
                </motion.div>
              );
            })}
          </div>

          {/* FREE plan strip */}
          <div className="flex items-center justify-between bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-5 py-3 mt-2">
            <div>
              <span className="font-medium text-white text-sm">Бесплатный план</span>
              <span className="ml-3 text-xs text-[rgba(255,255,255,0.4)]">
                5 сообщений/день · 5 картинок/неделю · 3 видео/неделю · 5 треков/неделю
              </span>
            </div>
            {plan === 'FREE' && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-accent/40 text-accent bg-accent/10 whitespace-nowrap ml-3">
                Активен
              </span>
            )}
          </div>
        </div>

        {/* Casper top-up section */}
        <div className={cn(
          'bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 space-y-4',
          !isPaid && 'opacity-60'
        )}>
          <div>
            <h2 className="text-base font-medium text-white">Докупить Caspers</h2>
            <p className="text-xs text-[rgba(255,255,255,0.4)] mt-0.5">
              {isPaid
                ? 'Пополните баланс в любое время'
                : 'Доступно с активной подпиской'}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[rgba(255,255,255,0.6)]">Количество:</span>
              <span className="font-medium text-white">{casperSlider.toLocaleString('ru-RU')} Caspers</span>
            </div>
            <input
              type="range"
              min={10}
              max={1000}
              step={10}
              value={casperSlider}
              onChange={(e) => setCasperSlider(Number(e.target.value))}
              disabled={!isPaid}
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex items-center justify-between text-xs text-[rgba(255,255,255,0.4)]">
              <span>10</span>
              <span>1 000</span>
            </div>
          </div>

          <div className="bg-[var(--bg-elevated)] rounded-xl p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-[rgba(255,255,255,0.5)]">Цена за 1 Casper:</span>
              <span className="text-white">{casperPPU} ₽</span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-[rgba(255,255,255,0.7)]">Итого:</span>
              <span className="text-accent">{casperTotal.toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>

          <button
            onClick={handleBuyCaspers}
            disabled={!isPaid || loading !== null}
            className="w-full btn btn-primary h-10 text-sm"
          >
            {loading === 'caspers'
              ? 'Загрузка...'
              : `Купить ${casperSlider.toLocaleString('ru-RU')} Caspers за ${casperTotal.toLocaleString('ru-RU')} ₽`}
          </button>
        </div>

      </div>
    </div>
  );
}
