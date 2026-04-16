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
    // Apply Telegram's color scheme if provided
    if (tg.colorScheme === 'light') {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // ── Visual viewport height (keyboard-aware) ───────────────────────────────
  // window.visualViewport tracks the *real* visible area on every browser,
  // including when the soft keyboard opens. We write it to --app-h so the
  // flex container always matches exactly what the user can see.
  useEffect(() => {
    const update = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-h', `${h}px`);
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
  // When phone is locked + unlocked, the WS may have dropped and the access
  // token may have expired. Reconnect WS and silently re-refresh token.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      // Reconnect WebSocket if closed
      connectWS();

      // Silently refresh the access token so subsequent API calls don't fail
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

  // Show nothing only while actively loading — cached user renders immediately
  if (isLoading && !user) return null;

  return (
    <div className="flex overflow-hidden" style={{ height: 'var(--app-h, 100dvh)', background: 'var(--bg-primary)' }}>
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main
        className={`flex-1 flex flex-col overflow-hidden mobile-nav-pb transition-[margin] duration-300 ease-in-out ${sidebarOpen ? 'lg:ml-[260px]' : 'lg:ml-[60px]'}`}
        style={{ minWidth: 0 }}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
