'use client';

import { useEffect } from 'react';
import { GhostIcon } from '@/components/icons/GhostIcon';
import { api, setAccessToken } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  // Страницы онбординга вне группы (app) — обновляем токен вручную,
  // чтобы accessToken был доступен, если пользователь перезагрузит страницу посреди онбординга
  useEffect(() => {
    const { refreshToken, setAuth } = useAuthStore.getState();
    if (!refreshToken) return;
    api.auth.refreshToken(refreshToken)
      .then(async ({ accessToken, refreshToken: newRT }) => {
        setAccessToken(accessToken);
        const me = await api.auth.me();
        setAuth(me, accessToken, newRT);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex flex-col">
      {/* Шапка */}
      <div className="flex items-center justify-center pt-8 pb-4">
        <GhostIcon size={24} className="text-accent" />
        <span className="ml-2 text-sm font-medium text-white">GhostLine</span>
      </div>
      {/* Содержимое */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        {children}
      </div>
    </div>
  );
}
