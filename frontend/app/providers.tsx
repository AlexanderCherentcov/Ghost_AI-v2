'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { ToastProvider } from '@/components/ui/Toast';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { api, setAccessToken, getAccessToken } from '@/lib/api';
import { MaintenancePage } from '@/components/MaintenancePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const MAINTENANCE_POLL_MS = 30_000;

// Проверяем ДО авторизации и до рендера остального приложения — во время
// тех.работ бэкенд может быть в процессе рестарта/миграции, и обычные вызовы
// (refresh, /me) всё равно будут падать. /api/maintenance — единственный
// эндпоинт, который должен пережить это состояние (не трогает БД/Prisma).
function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ active: boolean; until: string | null; bypass: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Разовая ссылка вида /?bypass=СЕКРЕТ — секрет уходит на бэкенд ОДИН раз,
    // тот ставит httpOnly cookie на сутки (см. routes/maintenance.ts) и
    // дальше обход держится по cookie, без секрета в адресной строке.
    const bypassParam = new URLSearchParams(window.location.search).get('bypass');
    if (bypassParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete('bypass');
      window.history.replaceState({}, '', url.toString());
    }

    const check = () => {
      const url = bypassParam
        ? `${API_URL}/api/maintenance?bypass=${encodeURIComponent(bypassParam)}`
        : `${API_URL}/api/maintenance`;
      fetch(url, { credentials: 'include' })
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setState({ active: !!data.active, until: data.until ?? null, bypass: !!data.bypass });
        })
        .catch(() => { if (!cancelled) setState((s) => s ?? { active: false, until: null, bypass: false }); });
    };
    check();
    const timer = setInterval(check, MAINTENANCE_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // Пока не пришёл первый ответ — ничего не решаем, просто рендерим приложение
  // как обычно (не блокируем стартовую загрузку ожиданием этого запроса).
  if (state?.active && !state.bypass) return <MaintenancePage until={state.until} />;
  return <>{children}</>;
}

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
  // Регистрация только в проде — на Turbopack dev-сервере service worker может
  // отдавать закешированные ответы поверх HMR, добавляя лишний слой отладки без пользы.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MaintenanceGate>
          <AuthInit>{children}</AuthInit>
        </MaintenanceGate>
        <ToastProvider />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
