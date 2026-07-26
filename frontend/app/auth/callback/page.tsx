'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { api, setAccessToken } from '@/lib/api';
import { GhostIcon } from '@/components/icons/GhostIcon';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { setAuth, clearAuth } = useAuthStore();

  // Читаем токены синхронно при первом рендере — до того, как Next.js App Router вызовет
  // history.replaceState (которая срезает хэш), и до запуска любых эффектов.
  // Приоритет: window.__oauthHash (выставлен инлайн-скриптом, переживает переключения
  // COOP-контекста) → sessionStorage → window.location.hash (запасной вариант).
  const [tokenData] = useState(() => {
    if (typeof window === 'undefined') return { access: '', refresh: '', redirect: '/chat' };
    const w = window as any;
    const fromGlobal: string = w.__oauthHash ?? '';
    const fromSS: string = (() => {
      try { const v = sessionStorage.getItem('_oauthHash') ?? ''; if (v) sessionStorage.removeItem('_oauthHash'); return v; } catch { return ''; }
    })();
    const hash = fromGlobal || fromSS || window.location.hash || '';
    w.__oauthHash = undefined;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    return {
      access: params.get('access') ?? '',
      refresh: params.get('refresh') ?? '',
      redirect: decodeURIComponent(params.get('redirect') ?? '/chat'),
    };
  });

  useEffect(() => {
    const { access, refresh, redirect } = tokenData;

    if (!access || !refresh) {
      clearAuth();
      router.replace('/login');
      return;
    }

    setAccessToken(access);

    api.auth.me()
      .then((user) => {
        setAuth(user, access, refresh);
        router.replace(redirect);
      })
      .catch(() => {
        clearAuth();
        router.replace('/login');
      });
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex flex-col items-center justify-center gap-4">
      <GhostIcon size={40} className="text-accent animate-float" animated />
      <p className="text-sm text-[rgba(255,255,255,0.3)]">Входим в тень...</p>
    </div>
  );
}
