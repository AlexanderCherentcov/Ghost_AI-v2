'use client';

import { useEffect, useState } from 'react';
import { TelegramProvider, useTg } from '@/components/TelegramProvider';
import { BottomNav } from '@/components/BottomNav';
import { apiRequest } from '@/lib/auth';

const SUPPORT_GROUP_URL = process.env.NEXT_PUBLIC_SUPPORT_GROUP_URL ?? 'https://t.me/GhostLineSupport_bot';

interface UserInfo {
  id: string;
  name: string | null;
  plan: string;
  std_messages_today:       number;
  images_today:             number;
  std_messages_daily_limit: number;
  images_daily_limit:       number;
}

const PLAN_LABELS: Record<string, string> = {
  FREE:     'Бесплатный',
  BASIC:    'Базовый',
  STANDARD: 'Стандарт',
  PRO:      'Про',
  ULTRA:    'Ультра',
};

function AccountApp() {
  const tg = useTg();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest<UserInfo>('/me')
      .then((u) => setUser(u))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function openSupport() {
    tg?.HapticFeedback.impactOccurred('light');
    tg?.openLink(SUPPORT_GROUP_URL);
  }

  const msgLimit = user?.std_messages_daily_limit === -1 ? '∞' : (user?.std_messages_daily_limit ?? 10);
  const imgLimit = user?.images_daily_limit ?? 3;

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

            {/* Usage today */}
            <div
              className="p-4 rounded-2xl"
              style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Сегодня
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="p-3 rounded-xl text-center"
                  style={{ background: 'rgba(123,92,240,0.08)' }}
                >
                  <p className="text-xl font-medium" style={{ color: '#7B5CF0' }}>
                    {user.std_messages_today}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    из {msgLimit} сообщений
                  </p>
                </div>
                <div
                  className="p-3 rounded-xl text-center"
                  style={{ background: 'rgba(92,240,200,0.08)' }}
                >
                  <p className="text-xl font-medium" style={{ color: '#5CF0C8' }}>
                    {user.images_today}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    из {imgLimit} картинок
                  </p>
                </div>
              </div>
            </div>

            {/* Upgrade CTA for free plan */}
            {user.plan === 'FREE' && (
              <div
                className="p-4 rounded-2xl"
                style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Бесплатный план
                </p>
                <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  10 сообщений/день · 3 картинки/день
                </p>
                <a
                  href="/balance"
                  className="block py-2.5 rounded-xl text-sm text-center font-medium"
                  style={{ background: '#7B5CF0', color: 'white' }}
                >
                  Улучшить тариф
                </a>
              </div>
            )}

            {/* Support */}
            <div
              className="p-4 rounded-2xl"
              style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Помощь
              </p>
              <button
                onClick={openSupport}
                className="w-full py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(123,92,240,0.15)', color: '#7B5CF0' }}
              >
                💬 Написать в поддержку
              </button>
            </div>
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
