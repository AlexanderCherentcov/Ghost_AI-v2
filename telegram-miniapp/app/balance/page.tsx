'use client';

import { useEffect, useState } from 'react';
import { TelegramProvider, useTg } from '@/components/TelegramProvider';
import { BottomNav } from '@/components/BottomNav';
import { apiRequest } from '@/lib/auth';

const PLANS = [
  {
    key: 'BASIC',
    name: 'Базовый',
    price: 699,
    features: ['500 сообщ./мес', '20 картинок', '40 файлов'],
  },
  {
    key: 'STANDARD',
    name: 'Стандарт',
    price: 1199,
    features: ['1 500 сообщ./мес', '30 картинок', '150 файлов', '5 видео'],
    popular: true,
  },
  {
    key: 'PRO',
    name: 'Про',
    price: 2490,
    features: ['Безлимитный чат', '80 картинок', '500 файлов', '15 видео'],
  },
  {
    key: 'ULTRA',
    name: 'Ультра',
    price: 5490,
    features: ['Безлимитный чат', '150 картинок', '1 000 файлов', '40 видео'],
  },
];

interface User {
  plan: string;
  messagesUsed:  number;
  filesUsed:     number;
  imagesUsed:    number;
  videoUsed:     number;
  messagesToday: number;
  messagesLimit: number;
  filesLimit:    number;
  imagesLimit:   number;
  videoLimit:    number;
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
    } catch (err: any) {
      tg?.showAlert(err.message ?? 'Ошибка оплаты');
    } finally {
      setLoading(null);
    }
  }

  const plan = user?.plan ?? 'FREE';
  const isUnlimitedChat = plan === 'PRO' || plan === 'ULTRA';
  const isMonthlyMessages = plan === 'BASIC' || plan === 'STANDARD';

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A12] pb-[80px]">
      <div className="px-4 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <h1 className="font-medium text-white">Баланс и тарифы</h1>
        <p className="text-xs text-[rgba(255,255,255,0.35)] mt-0.5">Текущий план: <span className="text-[#7B5CF0]">{plan}</span></p>
      </div>

      <div className="px-4 py-4 space-y-6">

        {/* Usage */}
        {user && (
          <div className="bg-[#0E0E1A] border border-[rgba(255,255,255,0.06)] rounded-2xl p-4 space-y-3">
            <p className="text-xs text-[rgba(255,255,255,0.35)] font-medium uppercase tracking-wider">Использование</p>

            {plan === 'FREE' && (
              <UsageRow label="Сообщения сегодня" used={user.messagesToday} limit={10} />
            )}
            {isMonthlyMessages && (
              <UsageRow label="Сообщения" used={user.messagesUsed} limit={user.messagesLimit} />
            )}
            {isUnlimitedChat && (
              <p className="text-xs text-[rgba(255,255,255,0.3)]">Чат безлимитный, сброс каждый день</p>
            )}

            <UsageRow label="Картинки" used={user.imagesUsed} limit={user.imagesLimit} />
            {user.filesLimit > 0 && (
              <UsageRow label="Файлы" used={user.filesUsed} limit={user.filesLimit} />
            )}
            {(user.videoLimit ?? 0) > 0 && (
              <UsageRow label="Видео" used={user.videoUsed ?? 0} limit={user.videoLimit} />
            )}
          </div>
        )}

        {/* Subscriptions */}
        <div>
          <h2 className="text-xs font-medium text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-3">Подписки</h2>
          <div className="grid grid-cols-2 gap-2">
            {PLANS.map(({ key, name, price, features, popular }) => (
              <div
                key={key}
                className={`bg-[#0E0E1A] border rounded-xl p-3 flex flex-col gap-2 ${
                  popular ? 'border-[#7B5CF0]' : 'border-[rgba(255,255,255,0.06)]'
                } ${plan === key ? 'border-[#7B5CF0]/50 bg-[#7B5CF0]/5' : ''}`}
              >
                {popular && (
                  <span className="text-[10px] text-[#7B5CF0] font-medium">★ Популярный</span>
                )}
                <div>
                  <p className="text-sm font-medium text-white">{name}</p>
                  {features.map((f) => (
                    <p key={f} className="text-xs text-[rgba(255,255,255,0.35)]">{f}</p>
                  ))}
                </div>
                <button
                  onClick={() => handleBuy(key)}
                  disabled={loading === key || plan === key}
                  className="w-full py-2 rounded-lg bg-[#7B5CF0] text-white text-xs font-medium disabled:opacity-50"
                >
                  {loading === key ? '...' : plan === key ? 'Активен' : `${price.toLocaleString('ru-RU')} ₽/мес`}
                </button>
              </div>
            ))}
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
