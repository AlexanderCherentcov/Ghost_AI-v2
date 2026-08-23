'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { useChatStore } from '@/store/chat.store';
import { useUIStore } from '@/store/ui.store';
import { api, setAccessToken } from '@/lib/api';
import { connectWS } from '@/lib/socket';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading, accessToken } = useAuthStore();
  const { setChats } = useChatStore();
  const { sidebarOpen } = useUIStore();
  // Хранит ID пользователя, для которого чаты уже загружены.
  // Предотвращает повторные запросы при обновлении токена и при этом гарантирует,
  // что список загрузится после перезагрузки страницы (когда accessToken приходит асинхронно).
  const loadedChatsForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
    if (user && !user.onboardingDone && !user.name) {
      router.replace('/onboarding/name');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user?.id || !accessToken) return;
    if (loadedChatsForRef.current === user.id) return; // уже загружено для этого пользователя
    loadedChatsForRef.current = user.id;
    api.chats.list().then(({ chats }) => setChats(chats)).catch(() => {});
  }, [user?.id, accessToken]);

  // ── Telegram Mini App: сигнал готовности + разворачивание на весь экран ──
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;
    tg.ready?.();
    tg.expand?.();
    if (tg.colorScheme === 'light') {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // ── Высота и отступ visual viewport (с учётом клавиатуры) ─────────────────
  // iOS Safari прокручивает visual viewport при открытии клавиатуры (offsetTop > 0).
  // Отслеживаем и height, и offsetTop, чтобы фиксированный контейнер всегда точно
  // покрывал видимую область — поле ввода и навигация остаются над клавиатурой.
  useEffect(() => {
    const update = () => {
      const vv = window.visualViewport;
      const h = vv?.height ?? window.innerHeight;
      const top = vv?.offsetTop ?? 0;
      document.documentElement.style.setProperty('--app-h', `${h}px`);
      document.documentElement.style.setProperty('--app-top', `${top}px`);
    };
    update();
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  // ── Восстановление после блокировки экрана на iPhone ──────────────────────
  useEffect(() => {
    let lastRefreshAt = 0;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefreshAt < 30_000) return; // не чаще чем раз в 30 сек
      lastRefreshAt = now;
      connectWS();
      const { refreshToken, setAuth, clearAuth } = useAuthStore.getState();
      if (!refreshToken) return;
      api.auth.refreshToken(refreshToken)
        .then(async ({ accessToken, refreshToken: newRT }) => {
          setAccessToken(accessToken);
          const me = await api.auth.me();
          setAuth(me, accessToken, newRT);
        })
        .catch((err: any) => {
          if (err?.status === 401) clearAuth();
        });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  if (isLoading && !user) return null;

  return (
    /*
     * position:fixed не даёт iOS прокручивать layout viewport при появлении
     * экранной клавиатуры. В сочетании с --app-h (visualViewport) контейнер
     * всегда точно соответствует реальной видимой области.
     */
    <div
      className="flex overflow-hidden"
      style={{
        position: 'fixed',
        top: 'var(--app-top, 0px)',
        left: 0,
        right: 0,
        height: 'var(--app-h, 100dvh)',
        background: 'var(--bg-void)',
        /* Запрещаем touch-скролл самой оболочки */
        touchAction: 'none',
      }}
    >
      {/* Сайдбар — только десктоп, внутри уже position:fixed */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Колонка контента: содержимое страницы + нижняя навигация */}
      <div
        className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-[margin] duration-300 ease-in-out ${sidebarOpen ? 'lg:ml-[260px]' : 'lg:ml-[60px]'}`}
        style={{ minWidth: 0 }}
      >
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </main>
        {/* BottomNav в обычном flex-потоке (не fixed) — надёжно работает во всех браузерах */}
        <BottomNav />
      </div>
    </div>
  );
}
