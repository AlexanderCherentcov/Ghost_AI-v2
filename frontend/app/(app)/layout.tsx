'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { useChatStore } from '@/store/chat.store';
import { api, setAccessToken } from '@/lib/api';
import { connectWS } from '@/lib/socket';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();
  const { setChats } = useChatStore();

  // Silently refresh access token in background — only logout on 401, not network errors
  useEffect(() => {
    const { refreshToken, user, setAuth, clearAuth } = useAuthStore.getState();
    if (!refreshToken) {
      if (!user) clearAuth();
      return;
    }
    api.auth.refreshToken(refreshToken)
      .then(async ({ accessToken, refreshToken: newRT }) => {
        setAccessToken(accessToken);
        const me = await api.auth.me();
        setAuth(me, accessToken, newRT);
      })
      .catch((err) => {
        // Only logout if server explicitly rejected the token (401)
        // Network errors / CORS / 5xx should NOT log the user out
        if (err?.status === 401) clearAuth();
      });
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
    if (user && !user.onboardingDone) {
      router.replace('/onboarding/name');
    }
  }, [user, isLoading]);

  useEffect(() => {
    if (user) {
      api.chats.list().then(({ chats }) => setChats(chats)).catch(() => {});
    }
  }, [user]);

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
        .catch((err) => {
          if (err?.status === 401) clearAuth();
        });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Show nothing only while actively loading — cached user renders immediately
  if (isLoading && !user) return null;

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--bg-primary)]">
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      <main className="flex-1 lg:ml-[260px] flex flex-col overflow-hidden pb-[60px] lg:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
