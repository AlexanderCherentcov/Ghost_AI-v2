'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { useChatStore } from '@/store/chat.store';
import { api, setAccessToken } from '@/lib/api';

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
