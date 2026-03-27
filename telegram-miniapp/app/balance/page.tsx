'use client';

import { useEffect, useState } from 'react';
import { TelegramProvider, useTg } from '@/components/TelegramProvider';
import { BottomNav } from '@/components/BottomNav';
import { apiRequest } from '@/lib/auth';

const SUBSCRIPTIONS = [
  { key: 'BASIC',    name: 'Базовый',  price: 499,  msgs: 500,   imgs: 10  },
  { key: 'STANDARD', name: 'Стандарт', price: 999,  msgs: 1500,  imgs: 20, popular: true },
  { key: 'PRO',      name: 'Про',      price: 2190, msgs: 4000,  imgs: 50  },
  { key: 'ULTRA',    name: 'Ультра',   price: 4490, msgs: 10000, imgs: 120 },
];

const ADDON_GROUPS = [
  {
    title: 'Стандартные сообщения',
    subtitle: 'Claude Haiku · 1 = 1 токен',
    packs: [
      { key: 'MESSAGES_STD_200',  label: '200 сообщ.',   price: 199 },
      { key: 'MESSAGES_STD_500',  label: '500 сообщ.',   price: 399 },
      { key: 'MESSAGES_STD_1500', label: '1 500 сообщ.', price: 999 },
    ],
  },
  {
    title: 'Расширенные сообщения',
    subtitle: 'DeepSeek · код и документы · 1 = 2 токена',
    packs: [
      { key: 'MESSAGES_EXT_300',  label: '300 сообщ.',   price: 199 },
      { key: 'MESSAGES_EXT_800',  label: '800 сообщ.',   price: 399 },
      { key: 'MESSAGES_EXT_2000', label: '2 000 сообщ.', price: 799 },
    ],
  },
  {
    title: 'Картинки',
    subtitle: 'Flux 1.1 Pro',
    packs: [
      { key: 'IMAGES_10',  label: '10 картинок',  price: 299  },
      { key: 'IMAGES_30',  label: '30 картинок',  price: 699  },
      { key: 'IMAGES_100', label: '100 картинок', price: 1990 },
    ],
  },
];

interface User {
  balanceMessages: number;
  addonMessages: number;
  balanceImages: number;
  addonImages: number;
  plan: string;
}

function BalanceApp() {
  const tg = useTg();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<User>('/me').then(setUser).catch(() => {});
  }, []);

  async function handleBuy(type: 'SUBSCRIPTION' | 'ADDON', key: string) {
    setLoading(key);
    tg?.HapticFeedback.impactOccurred('light');
    try {
      const { paymentUrl } = await apiRequest<{ paymentUrl: string }>('/payments/create', {
        method: 'POST',
        body: JSON.stringify({ type, key }),
      });
      tg?.openLink(paymentUrl);
    } catch (err: any) {
      tg?.showAlert(err.message ?? 'Ошибка оплаты');
    } finally {
      setLoading(null);
    }
  }

  const msgs   = (user?.balanceMessages ?? 0) + (user?.addonMessages ?? 0);
  const images = (user?.balanceImages ?? 0) + (user?.addonImages ?? 0);

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A12] pb-[80px]">
      <div className="px-4 py-4 border-b border-[rgba(255,255,255,0.06)]">
        <h1 className="font-medium text-white">Баланс и тарифы</h1>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Balance card */}
        <div className="bg-[#0E0E1A] border border-[rgba(255,255,255,0.06)] rounded-2xl p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm text-[rgba(255,255,255,0.4)]">Текущий тариф</span>
            <span className="text-sm text-[#7B5CF0]">{user?.plan ?? 'FREE'}</span>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xs text-[rgba(255,255,255,0.35)] mb-0.5">Сообщения</p>
              <p className="text-xl font-medium text-white">{msgs.toLocaleString('ru-RU')}</p>
            </div>
            <div className="w-px bg-[rgba(255,255,255,0.06)]" />
            <div>
              <p className="text-xs text-[rgba(255,255,255,0.35)] mb-0.5">Картинки</p>
              <p className="text-xl font-medium text-white">{images}</p>
            </div>
          </div>
        </div>

        {/* Subscriptions */}
        <div>
          <h2 className="text-xs font-medium text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-3">Подписки</h2>
          <div className="grid grid-cols-2 gap-2">
            {SUBSCRIPTIONS.map(({ key, name, price, msgs: m, imgs: i, popular }) => (
              <div
                key={key}
                className={`bg-[#0E0E1A] border rounded-xl p-3 flex flex-col gap-2 ${popular ? 'border-[#7B5CF0]' : 'border-[rgba(255,255,255,0.06)]'}`}
              >
                {popular && (
                  <span className="text-[10px] text-[#7B5CF0] font-medium">★ Популярный</span>
                )}
                <div>
                  <p className="text-sm font-medium text-white">{name}</p>
                  <p className="text-xs text-[rgba(255,255,255,0.35)]">{m.toLocaleString('ru-RU')} сообщ. · {i} фото</p>
                </div>
                <button
                  onClick={() => handleBuy('SUBSCRIPTION', key)}
                  disabled={loading === key}
                  className="w-full py-2 rounded-lg bg-[#7B5CF0] text-white text-xs font-medium disabled:opacity-50"
                >
                  {loading === key ? '...' : `${price.toLocaleString('ru-RU')} ₽/мес`}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Addons */}
        <div>
          <h2 className="text-xs font-medium text-[rgba(255,255,255,0.4)] uppercase tracking-wider mb-3">Аддоны — не сгорают</h2>
          <div className="space-y-3">
            {ADDON_GROUPS.map(({ title, subtitle, packs }) => (
              <div key={title} className="bg-[#0E0E1A] border border-[rgba(255,255,255,0.06)] rounded-xl p-3">
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="text-xs text-[rgba(255,255,255,0.3)] mb-2">{subtitle}</p>
                <div className="flex flex-col gap-1.5">
                  {packs.map(({ key, label, price }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-xs text-[rgba(255,255,255,0.6)]">{label}</span>
                      <button
                        onClick={() => handleBuy('ADDON', key)}
                        disabled={loading === key}
                        className="px-3 py-1.5 rounded-lg bg-[#1A1A2E] border border-[rgba(255,255,255,0.1)] text-[#7B5CF0] text-xs font-medium disabled:opacity-50 hover:border-[#7B5CF0] transition-colors"
                      >
                        {loading === key ? '...' : `${price.toLocaleString('ru-RU')} ₽`}
                      </button>
                    </div>
                  ))}
                </div>
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
