'use client';

import { useEffect, useState } from 'react';
import { TelegramProvider } from '@/components/TelegramProvider';
import { BottomNav } from '@/components/BottomNav';
import { apiRequest } from '@/lib/auth';

interface UserInfo {
  id: string;
  name: string | null;
  plan: string;
  balanceMessages: number;
  addonMessages: number;
  balanceImages: number;
  addonImages: number;
}

const PLAN_LABELS: Record<string, string> = {
  FREE: 'Бесплатный',
  BASIC: 'Базовый',
  STANDARD: 'Стандарт',
  PRO: 'Про',
  ULTRA: 'Ультра',
};

function AccountApp() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<UserInfo>('/me')
      .then((u) => setUser(u))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalMsgs = (user?.balanceMessages ?? 0) + (user?.addonMessages ?? 0);
  const totalImgs = (user?.balanceImages ?? 0) + (user?.addonImages ?? 0);

  return (
    <div className="flex flex-col h-screen pb-[60px]" style={{ background: '#06060B', color: 'white' }}>
      {/* Header */}
      <div
        className="flex items-center px-4 pt-5 pb-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <span className="text-base font-medium tracking-tight">Аккаунт</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4 px-4">
        {loading ? (
          <p className="text-center text-sm mt-10" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Загрузка...
          </p>
        ) : user ? (
          <div className="space-y-3">
            {/* Avatar + name */}
            <div
              className="flex items-center gap-4 p-4 rounded-2xl"
              style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
                style={{ background: 'rgba(123,92,240,0.15)' }}
              >
                👻
              </div>
              <div className="min-w-0">
                <p className="text-base font-medium text-white truncate">
                  {user.name ?? 'Ghost User'}
                </p>
                <span
                  className="inline-block text-xs px-2 py-0.5 rounded-full mt-1"
                  style={{ background: 'rgba(123,92,240,0.15)', color: '#7B5CF0' }}
                >
                  {PLAN_LABELS[user.plan] ?? user.plan}
                </span>
              </div>
            </div>

            {/* Balance */}
            <div
              className="p-4 rounded-2xl"
              style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Баланс
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="p-3 rounded-xl text-center"
                  style={{ background: 'rgba(123,92,240,0.08)' }}
                >
                  <p className="text-xl font-medium" style={{ color: '#7B5CF0' }}>{totalMsgs}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>сообщений</p>
                </div>
                <div
                  className="p-3 rounded-xl text-center"
                  style={{ background: 'rgba(92,240,200,0.08)' }}
                >
                  <p className="text-xl font-medium" style={{ color: '#5CF0C8' }}>{totalImgs}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>картинок</p>
                </div>
              </div>
            </div>

            {/* Plan info */}
            {user.plan === 'FREE' && (
              <div
                className="p-4 rounded-2xl"
                style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Пробный план
                </p>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  5 сообщений в день · 3 картинки в месяц
                </p>
                <a
                  href="/balance"
                  className="block mt-3 py-2.5 rounded-xl text-sm text-center font-medium"
                  style={{ background: '#7B5CF0', color: 'white' }}
                >
                  Улучшить тариф
                </a>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center text-sm mt-10" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Не удалось загрузить данные
          </p>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

export default function AccountPage() {
  return (
    <TelegramProvider>
      <AccountApp />
    </TelegramProvider>
  );
}
