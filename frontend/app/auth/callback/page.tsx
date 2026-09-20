'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { api, setAccessToken } from '@/lib/api';
import { PageLoader } from '@/components/ui/PageLoader';
import { safeRedirect } from '@/lib/safe-redirect';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { setAuth, clearAuth } = useAuthStore();

  // Читаем токены синхронно при первом рендере — до того, как Next.js App Router вызовет
  // history.replaceState (которая срезает хэш), и до запуска любых эффектов.
  // Приоритет: window.__oauthHash (выставлен инлайн-скриптом, переживает переключения
  // COOP-контекста) → sessionStorage → window.location.hash (запасной вариант).
  const [tokenData] = useState(() => {
    if (typeof window === 'undefined') return { access: '', refresh: '', code: '', redirect: '/chat' };

    // Ссылка входа из бота Telegram: ?code=... — одноразовый код вместо готовых
    // токенов в URL. Встроенный браузер Telegram ненадёжно передаёт #hash при
    // открытии внешней ссылки (баг наблюдался вживую — страница грузится с пустым
    // hash, мгновенный разлогин), а query-параметр — часть самого HTTP-запроса и
    // до сервера доходит всегда. См. /auth/telegram-bot в backend/src/routes/auth.ts.
    const query = new URLSearchParams(window.location.search);
    const code = query.get('code') ?? '';
    if (code) {
      // URLSearchParams.get уже декодирует значение — повторный decodeURIComponent не нужен
      // (и падал бы на «%» в адресе). safeRedirect не даёт увести пользователя на чужой сайт.
      return { access: '', refresh: '', code, redirect: safeRedirect(query.get('redirect')) };
    }

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
      code: '',
      redirect: safeRedirect(params.get('redirect')),
    };
  });

  useEffect(() => {
    const { access, refresh, code, redirect } = tokenData;

    if (code) {
      api.auth.exchange(code)
        .then(({ accessToken, refreshToken, user }) => {
          setAccessToken(accessToken);
          setAuth(user, accessToken, refreshToken);
          router.replace(redirect);
        })
        .catch(() => {
          clearAuth();
          router.replace('/login');
        });
      return;
    }

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

  return <PageLoader label="Входим" />;
}
