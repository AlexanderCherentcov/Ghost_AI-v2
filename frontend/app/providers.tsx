'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { ToastProvider } from '@/components/ui/Toast';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { api, setAccessToken, getAccessToken } from '@/lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

function AuthInit({ children }: { children: React.ReactNode }) {
  // Ждём, пока Zustand persist гидрируется из localStorage (только на клиенте)
  const [hydrated, setHydrated] = useState(false);
  // usePathname безопасен для SSR — одинаковое значение на сервере и клиенте, без рассинхрона гидратации
  const pathname = usePathname();

  useEffect(() => {
    // skipHydration=true в сторе — запускаем гидратацию вручную здесь, на клиенте.
    // Это гарантирует, что localStorage читается только в браузере, никогда на сервере.
    const unsub = useAuthStore.persist?.onFinishHydration(() => setHydrated(true));
    useAuthStore.persist?.rehydrate();
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    // Callback-страницы сами выставляют токены — не вмешиваемся
    if (pathname.startsWith('/auth/callback') || pathname.startsWith('/auth/telegram/callback')) return;

    const { refreshToken, user, setAuth, clearAuth } = useAuthStore.getState();

    // Уже авторизован с access token в памяти (например, свежий OAuth-логин) — обновление не нужно
    if (user && getAccessToken()) return;

    // Есть refresh token — используем его, чтобы получить свежий access token
    if (refreshToken) {
      api.auth.refreshToken(refreshToken)
        .then(async ({ accessToken, refreshToken: newRT }) => {
          setAccessToken(accessToken);
          const me = await api.auth.me();
          setAuth(me, accessToken, newRT);
        })
        .catch((err) => {
          // Сбрасываем авторизацию только при явном 401 — сетевые ошибки и 5xx не должны разлогинивать
          if (err?.status === 401) clearAuth();
        });
      return;
    }

    // Нет refresh token — пользователь не авторизован
    clearAuth();
  }, [hydrated, pathname]);

  // Callback-страницы должны рендериться немедленно (без ожидания), чтобы их useState-инициализатор
  // успел захватить хэш/токены до запуска React-эффектов.
  const isCallback = pathname.startsWith('/auth/callback') || pathname.startsWith('/auth/telegram/callback');

  // Пока localStorage не гидрирован: не рендерим ничего (одинаково на сервере и клиенте → без рассинхрона).
  // После гидратации всегда рендерим children — редиректы авторизации обрабатывают сами страницы.
  if (!isCallback && !hydrated) return null;

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthInit>{children}</AuthInit>
        <ToastProvider />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
