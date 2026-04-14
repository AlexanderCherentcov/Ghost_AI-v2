'use client';


import { useEffect, useState } from 'react';
import { TelegramProvider, useTg } from '@/components/TelegramProvider';
import { BottomNav } from '@/components/BottomNav';
import { apiRequest } from '@/lib/auth';

const PLANS = [
  {
    key: 'TRIAL',
    name: 'Пробный',
    price: 299,
    priceLabel: '299 ₽ / 7 дней',
    features: ['30 сообщений/день', '5 картинок/день', '1 видео/день'],
    trial: true,
    popular: false,
  },
  {
    key: 'BASIC',
    name: 'Базовый',
    price: 699,
    priceLabel: '699 ₽/мес',
    features: ['Безлимитный чат', '20 картинок/день', '40 файлов/мес'],
    trial: false,
    popular: false,
  },
  {
    key: 'STANDARD',
    name: 'Стандарт',
    price: 1199,
    priceLabel: '1 199 ₽/мес',
    features: ['Безлимитный чат', '50 про/день', '30 картинок/день', '1 видео/день'],
    trial: false,
    popular: true,
  },
  {
    key: 'PRO',
    name: 'Про',
    price: 2490,
    priceLabel: '2 490 ₽/мес',
    features: ['Безлимитный чат', '200 про/день', '80 картинок/день', '3 видео/день'],
    trial: false,
    popular: false,
  },
  {
    key: 'ULTRA',
    name: 'Ультра',
    price: 5490,
    priceLabel: '5 490 ₽/мес',
    features: ['Безлимитный чат', '400 про/день', '150 картинок/день', '5 видео/день'],
    trial: false,
    popular: false,
  },
];

interface User {
  plan: string;
  std_messages_today:       number;
  pro_messages_today:       number;
  images_today:             number;
  videos_today:             number;
  files_used:               number;
  std_messages_daily_limit: number;
  pro_messages_daily_limit: number;
  images_daily_limit:       number;
  videos_daily_limit:       number;
  files_monthly_limit:      number;
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  if (limit <= 0) return null;
  const pct = Math.min((used / limit) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-xs text-[rgba(255,255,255,0.4)] mb-1">
        <span>{label}</span>
        <span>{used} / {limit}</span>
      </div>
      <div className="h-1 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
        <div className="h-full bg-[#7B5CF0] rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BalanceApp() {
  const tg = useTg();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<User>('/me').then(setUser).catch(() => {});
  }, []);

  async function handleBuy(planKey: string) {
    setLoading(planKey);
    tg?.HapticFeedback.impactOccurred('light');
    try {
      const { paymentUrl } = await apiRequest<{ paymentUrl: string }>('/payments/create', {
        method: 'POST',
        body: JSON.stringify({ plan: planKey }),
      });
      tg?.openLink(paymentUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка оплаты';
      tg?.showAlert(msg);
    } finally {
      setLoading(null);
    }
  }

  const plan = user?.plan ?? 'FREE';

  return (
    <div className="flex flex-col min-h-screen pb-[60px]" style={{ background: 'var(--bg-primary)' }}>
      <div className="px-4 py-4" style={{ borderBottom: '0.5px solid var(--border)' }}>
        <h1 className="font-medium" style={{ color: 'var(--text-primary)' }}>Баланс и тарифы</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Текущий план: <span style={{ color: 'var(--accent)' }}>{plan}</span></p>
      </div>

      <div className="px-4 py-4 space-y-6">

        {/* Usage */}
        {user && (
          <div className="bg-[#0E0E1A] border border-[rgba(255,255,255,0.06)] rounded-2xl p-4 space-y-3">
            <p className="text-xs text-[rgba(255,255,255,0.35)] font-medium uppercase tracking-wider">Использование</p>

            {/* Message progress — FREE and TRIAL show limit; paid plans show ∞ */}
            {(plan === 'FREE' || plan === 'TRIAL') && (
              <UsageRow label="Сообщения сегодня" used={user.std_messages_today} limit={user.std_messages_daily_limit} />
            )}
            {/* Pro messages — show only for STANDARD; PRO/ULTRA have hidden cap */}
            {user.pro_messages_daily_limit > 0 && plan === 'STANDARD' && (
              <UsageRow label="Про-сообщения" used={user.pro_messages_today} limit={user.pro_messages_daily_limit} />
            )}
            {plan !== 'FREE' && plan !== 'TRIAL' && (
              <p className="text-xs text-[rgba(255,255,255,0.3)]">
                {plan === 'PRO' || plan === 'ULTRA' ? '✨ Чат: безлимитный' : 'Стандартный чат: безлимитный'}
              </p>
            )}

            <UsageRow label="Картинки" used={user.images_today} limit={user.images_daily_limit} />
            {user.videos_daily_limit > 0 && (
              <UsageRow label="Видео" used={user.videos_today} limit={user.videos_daily_limit} />
            )}
            {user.files_monthly_limit > 0 && (
              <UsageRow label="Файлы (месяц)" used={user.files_used} limit={user.files_monthly_limit} />
            )}
          </div>
        )}

        {/* Subscriptions */}
        <div>
          <h2 className="text-xs font-medium text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-3">Подписки</h2>
          <div className="grid grid-cols-2 gap-2">
            {PLANS.map(({ key, name, priceLabel, features, popular, trial }) => {
              const isActive = plan === key;
              return (
                <div
                  key={key}
                  className={`bg-[#0E0E1A] border rounded-xl p-3 flex flex-col ${
                    isActive ? 'border-[#7B5CF0]/60 bg-[#7B5CF0]/5' :
                    popular ? 'border-[#7B5CF0]' :
                    trial ? 'border-[#7B5CF0]/40' : 'border-[rgba(255,255,255,0.06)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    {isActive && (
                      <span className="text-[10px] text-[#7B5CF0] font-semibold">✓ Активен</span>
                    )}
                    {popular && !isActive && (
                      <span className="text-[10px] text-[#7B5CF0] font-medium">★ Популярный</span>
                    )}
                    {trial && !isActive && (
                      <span className="text-[10px] text-[#A78BFA] font-medium">7 дней</span>
                    )}
                    {!popular && !trial && !isActive && <span />}
                  </div>
                  <p className="text-sm font-medium text-white mb-1.5">{name}</p>
                  <div className="flex-1 mb-3 space-y-0.5">
                    {features.map((f) => (
                      <p key={f} className="text-[11px] text-[rgba(255,255,255,0.35)] leading-snug">{f}</p>
                    ))}
                  </div>
                  <button
                    onClick={() => handleBuy(key)}
                    disabled={loading === key}
                    className={`w-full py-2 rounded-lg text-xs font-medium mt-auto transition-opacity ${
                      isActive
                        ? 'bg-[rgba(123,92,240,0.15)] text-[#A78BFA] border border-[rgba(123,92,240,0.3)]'
                        : 'bg-[#7B5CF0] text-white'
                    } disabled:opacity-50`}
                  >
                    {loading === key ? '...' : isActive ? 'Продлить' : priceLabel}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      <BottomNav />
    </div>
  );
}

export default function TgBalancePage() {
  return <TelegramProvider><BalanceApp /></TelegramProvider>;
}
