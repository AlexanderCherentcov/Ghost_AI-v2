'use client';

import { useEffect } from 'react';
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

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
    if (user && !user.onboardingDone && !user.name) {
      router.replace('/onboarding/name');
    }
  }, [user, isLoading]);

  useEffect(() => {
    if (user && accessToken) {
      api.chats.list().then(({ chats }) => setChats(chats)).catch(() => {});
    }
  }, [user, accessToken]);

  // ── Telegram Mini App: notify ready + expand ──────────────────────────────
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) return;
    tg.ready?.();
    tg.expand?.();
    if (tg.colorScheme === 'light') {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // ── Visual viewport height + offset (keyboard-aware) ─────────────────────
  // iOS Safari scrolls the visual viewport when keyboard opens (offsetTop > 0).
  // We track both height AND offsetTop so our fixed container always exactly
  // covers the visual viewport — input/nav stay pinned above the keyboard.
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

  // ── iPhone screen-lock recovery ────────────────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
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
     * position:fixed prevents iOS from scrolling the layout viewport when
     * the soft keyboard appears. Combined with --app-h (visualViewport),
     * the container always fits the real visible area exactly.
     */
    <div
      className="flex overflow-hidden"
      style={{
        position: 'fixed',
        top: 'var(--app-top, 0px)',
        left: 0,
        right: 0,
        height: 'var(--app-h, 100dvh)',
        background: 'var(--bg-primary)',
        /* Prevent any touch-scroll on the shell itself */
        touchAction: 'none',
      }}
    >
      {/* Sidebar — desktop only, position:fixed internally */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Content column: page content + bottom nav */}
      <div
        className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-[margin] duration-300 ease-in-out ${sidebarOpen ? 'lg:ml-[260px]' : 'lg:ml-[60px]'}`}
        style={{ minWidth: 0 }}
      >
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </main>
        {/* BottomNav is in the flex flow (not fixed) — reliable on all browsers */}
        <BottomNav />
      </div>
    </div>
  );
}
