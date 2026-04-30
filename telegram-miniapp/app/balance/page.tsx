'use client';

import { useEffect, useState } from 'react';
import { TelegramProvider, useTg } from '@/components/TelegramProvider';
import { BottomNav } from '@/components/BottomNav';
import { apiRequest } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanInfo {
  key: string;
  label: string;
  price: number;
  price_yearly: number;
  caspers_monthly: number;
  pro_free_daily: number;
  badge: string | null;
  popular: boolean;
  features: string[];
}

interface PlansResponse {
  plans: PlanInfo[];
  free: {
    key: string;
    label: string;
    limits: {
      std_messages_daily: number;
      images_weekly: number;
      music_weekly: number;
      videos_monthly: number;
    };
  };
}

interface User {
  plan: string;
  caspers_balance: number;
  caspers_monthly: number;
  std_messages_today: number;
  pro_messages_today: number;
  images_this_week: number;
  music_this_week: number;
  videos_this_month: number;
}

// ─── Casper tiered pricing ────────────────────────────────────────────────────

function calculateCasperPrice(amount: number): number {
  if (amount <= 0) return 0;
  const tiers = [
    { max: 100, price: 3.0 }, { max: 100, price: 2.9 },
    { max: 100, price: 2.8 }, { max: 100, price: 2.7 },
    { max: 100, price: 2.6 }, { max: 100, price: 2.5 },
    { max: 100, price: 2.4 }, { max: 100, price: 2.3 },
    { max: 100, price: 2.2 }, { max: 100, price: 2.1 },
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

// ─── Usage progress bar ───────────────────────────────────────────────────────

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min((used / Math.max(limit, 1)) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-xs text-[rgba(255,255,255,0.4)] mb-1">
        <span>{label}</span>
        <span>{used} / {limit}</span>
      </div>
      <div className="h-1 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#7B5CF0] rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function BalanceApp() {
  const tg = useTg();
  const [user, setUser]           = useState<User | null>(null);
  const [plansData, setPlansData] = useState<PlansResponse | null>(null);
  const [loading, setLoading]     = useState<string | null>(null);
  const [billing, setBilling]     = useState<'monthly' | 'yearly'>('monthly');
  const [casperAmt, setCasperAmt] = useState(100);

  useEffect(() => {
    apiRequest<User>('/me').then(setUser).catch(() => {});
    apiRequest<PlansResponse>('/plans').then(setPlansData).catch(() => {});
  }, []);

  async function handleBuy(planKey: string) {
    setLoading(planKey);
    tg?.HapticFeedback?.impactOccurred('light');
    try {
      const { paymentUrl } = await apiRequest<{ paymentUrl: string }>('/payments/create', {
        method: 'POST',
        body: JSON.stringify({ plan: planKey, billing }),
      });
      tg?.openLink(paymentUrl);
    } catch (err: unknown) {
      tg?.showAlert(err instanceof Error ? err.message : 'Ошибка оплаты');
    } finally {
      setLoading(null);
    }
  }

  async function handleBuyCaspers() {
    if (!isPaid) return;
    setLoading('caspers');
    tg?.HapticFeedback?.impactOccurred('light');
    try {
      const { paymentUrl } = await apiRequest<{ paymentUrl: string }>('/payments/caspers/create', {
        method: 'POST',
        body: JSON.stringify({ amount: casperAmt }),
      });
      tg?.openLink(paymentUrl);
    } catch (err: unknown) {
      tg?.showAlert(err instanceof Error ? err.message : 'Ошибка оплаты');
    } finally {
      setLoading(null);
    }
  }

  const plan        = user?.plan ?? 'FREE';
  const isPaid      = plan !== 'FREE';
  const plans       = plansData?.plans ?? [];
  const freeLimits  = plansData?.free?.limits;
  const casperTotal = calculateCasperPrice(casperAmt);

  return (
    <div className="flex flex-col min-h-screen pb-20" style={{ background: 'var(--bg-primary)' }}>

      {/* Header */}
      <div className="px-4 py-4" style={{ borderBottom: '0.5px solid var(--border)' }}>
        <h1 className="font-medium" style={{ color: 'var(--text-primary)' }}>Баланс и тарифы</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Текущий план: <span style={{ color: 'var(--accent)' }}>{plan}</span>
        </p>
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* Caspers balance card */}
        {user && (
          <div className="bg-[#0E0E1A] border border-[rgba(255,255,255,0.06)] rounded-2xl p-4">
            <p className="text-[10px] text-[rgba(255,255,255,0.35)] font-medium uppercase tracking-wider mb-2">
              Баланс Caspers
            </p>
            <div className="flex items-end justify-between">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold text-white">
                    {user.caspers_balance.toLocaleString('ru-RU')}
                  </span>
                  <span className="text-sm text-[rgba(255,255,255,0.4)]">Caspers</span>
                </div>
                {isPaid && (
                  <p className="text-[11px] text-[rgba(255,255,255,0.3)] mt-0.5">
                    +{user.caspers_monthly.toLocaleString('ru-RU')} каждый месяц
                  </p>
                )}
              </div>
              {!isPaid && freeLimits && (
                <div className="text-right space-y-0.5">
                  <p className="text-[10px] text-[rgba(255,255,255,0.4)]">{freeLimits.std_messages_daily} сообщ/день</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.4)]">{freeLimits.images_weekly} карт/нед</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.4)]">{freeLimits.music_weekly} треков/нед</p>
                  <p className="text-[10px] text-[rgba(255,255,255,0.4)]">{freeLimits.videos_monthly} видео/мес</p>
                </div>
              )}
            </div>

            {/* FREE usage bars */}
            {!isPaid && freeLimits && (
              <div className="mt-3 space-y-2.5 pt-3 border-t border-[rgba(255,255,255,0.05)]">
                <UsageBar label="Сообщений сегодня" used={user.std_messages_today} limit={freeLimits.std_messages_daily} />
                <UsageBar label="Картинок на неделе" used={user.images_this_week}   limit={freeLimits.images_weekly} />
                <UsageBar label="Треков на неделе"   used={user.music_this_week}    limit={freeLimits.music_weekly} />
                <UsageBar label="Видео в месяце"     used={user.videos_this_month}  limit={freeLimits.videos_monthly} />
              </div>
            )}
          </div>
        )}

        {/* Monthly / Yearly toggle */}
        <div className="flex items-center gap-3">
          <span className={`text-sm ${billing === 'monthly' ? 'text-white' : 'text-[rgba(255,255,255,0.4)]'}`}>
            Месяц
          </span>
          <button
            onClick={() => setBilling(b => b === 'monthly' ? 'yearly' : 'monthly')}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              billing === 'yearly' ? 'bg-[#7B5CF0]' : 'bg-[rgba(255,255,255,0.1)]'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              billing === 'yearly' ? 'translate-x-5' : ''
            }`} />
          </button>
          <span className={`text-sm ${billing === 'yearly' ? 'text-white' : 'text-[rgba(255,255,255,0.4)]'}`}>
            Год
          </span>
          {billing === 'yearly' && (
            <span className="text-[10px] font-semibold bg-[#7B5CF0]/20 text-[#A78BFA] px-2 py-0.5 rounded-full">
              −70%
            </span>
          )}
        </div>

        {/* Plan cards */}
        <div>
          <p className="text-[10px] font-medium text-[rgba(255,255,255,0.35)] uppercase tracking-wider mb-3">
            Подписки
          </p>

          <div className="grid grid-cols-2 gap-2">
            {plans.map((p) => {
              const isActive  = plan === p.key;
              const realPrice = billing === 'yearly' ? p.price_yearly : p.price;
              const fakePrice = billing === 'yearly' ? p.price * 2 * 12 : p.price * 2;
              const discount  = billing === 'yearly' ? '−70%' : '−50%';

              return (
                <div
                  key={p.key}
                  className={`bg-[#0E0E1A] border rounded-xl p-3 flex flex-col relative ${
                    isActive  ? 'border-[#7B5CF0]/60 bg-[#7B5CF0]/5' :
                    p.popular ? 'border-[#7B5CF0]' :
                    p.badge   ? 'border-[#7B5CF0]/40' :
                                'border-[rgba(255,255,255,0.06)]'
                  }`}
                >
                  {p.badge && !isActive && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-semibold bg-[#7B5CF0] text-white px-2 py-0.5 rounded-full whitespace-nowrap">
                      {p.badge}
                    </span>
                  )}
                  {isActive && (
                    <span className="text-[10px] text-[#7B5CF0] font-semibold mb-0.5">✓ Активен</span>
                  )}

                  <p className="text-sm font-semibold text-white">{p.label}</p>

                  <div className="flex items-center gap-1 mt-0.5 mb-0.5">
                    <span className="text-[10px] text-[rgba(255,255,255,0.3)] line-through">
                      {fakePrice.toLocaleString('ru-RU')} ₽
                    </span>
                    <span className="text-[9px] font-semibold text-red-400">{discount}</span>
                  </div>

                  <p className="text-lg font-bold text-white leading-tight">
                    {realPrice.toLocaleString('ru-RU')} ₽
                    <span className="text-[10px] font-normal text-[rgba(255,255,255,0.3)]">
                      {billing === 'yearly' ? '/год' : '/мес'}
                    </span>
                  </p>

                  <p className="text-[11px] text-[#7B5CF0] mt-0.5 mb-2">
                    {p.caspers_monthly.toLocaleString('ru-RU')} Caspers/мес
                  </p>

                  <ul className="flex-1 mb-3 space-y-0.5">
                    {p.features.map((f) => (
                      <li key={f} className="text-[10px] text-[rgba(255,255,255,0.35)] leading-snug">
                        {`• ${f}`}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleBuy(p.key)}
                    disabled={loading !== null}
                    className={`w-full py-2 rounded-lg text-xs font-semibold mt-auto disabled:opacity-50 ${
                      isActive
                        ? 'bg-[rgba(123,92,240,0.15)] text-[#A78BFA] border border-[rgba(123,92,240,0.3)]'
                        : 'bg-[#7B5CF0] text-white'
                    }`}
                  >
                    {loading === p.key ? '...' : isActive ? 'Продлить' : `${realPrice.toLocaleString('ru-RU')} ₽`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* FREE strip */}
          <div className="mt-2 flex items-center justify-between bg-[#0E0E1A] border border-[rgba(255,255,255,0.06)] rounded-xl px-3 py-2.5">
            <div>
              <span className="text-sm font-medium text-white">Бесплатный</span>
              {freeLimits && (
                <p className="text-[10px] text-[rgba(255,255,255,0.35)] mt-0.5">
                  {freeLimits.std_messages_daily} сообщ/день · {freeLimits.images_weekly} карт/нед · {freeLimits.videos_monthly} видео/мес
                </p>
              )}
            </div>
            {plan === 'FREE' && (
              <span className="text-[10px] font-semibold border border-[rgba(123,92,240,0.4)] text-[#A78BFA] bg-[rgba(123,92,240,0.1)] px-2 py-0.5 rounded-full ml-2 whitespace-nowrap">
                Активен
              </span>
            )}
          </div>
        </div>

        {/* Casper top-up */}
        <div className={`bg-[#0E0E1A] border border-[rgba(255,255,255,0.06)] rounded-2xl p-4 space-y-3 ${
          !isPaid ? 'opacity-50 pointer-events-none' : ''
        }`}>
          <div>
            <p className="text-sm font-medium text-white">Докупить Caspers</p>
            <p className="text-[11px] text-[rgba(255,255,255,0.4)] mt-0.5">
              {isPaid ? 'Пополните баланс в любое время' : 'Доступно с активной подпиской'}
            </p>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-[rgba(255,255,255,0.5)]">Количество:</span>
              <span className="text-white font-medium">{casperAmt.toLocaleString('ru-RU')} Caspers</span>
            </div>
            <input
              type="range" min={10} max={1000} step={10}
              value={casperAmt}
              onChange={(e) => setCasperAmt(Number(e.target.value))}
              className="w-full accent-[#7B5CF0]"
            />
            <div className="flex justify-between text-[10px] text-[rgba(255,255,255,0.3)] mt-0.5">
              <span>10</span><span>1 000</span>
            </div>
          </div>

          <div className="flex justify-between items-center bg-[rgba(255,255,255,0.03)] rounded-xl px-3 py-2 text-sm">
            <span className="text-[rgba(255,255,255,0.5)]">Итого:</span>
            <span className="font-semibold text-[#7B5CF0]">{casperTotal.toLocaleString('ru-RU')} ₽</span>
          </div>

          <button
            onClick={handleBuyCaspers}
            disabled={loading !== null}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-[#7B5CF0] text-white disabled:opacity-40"
          >
            {loading === 'caspers'
              ? '...'
              : `Купить ${casperAmt} Caspers за ${casperTotal.toLocaleString('ru-RU')} ₽`}
          </button>
        </div>

      </div>
      <BottomNav />
    </div>
  );
}

export default function TgBalancePage() {
  return <TelegramProvider><BalanceApp /></TelegramProvider>;
}
