'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { ToastProvider } from '@/components/ui/Toast';
import { api, setAccessToken } from '@/lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

function AuthInit({ children }: { children: React.ReactNode }) {
  // Wait for Zustand persist to hydrate from localStorage (client-only)
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // persist is only available on client
    if (useAuthStore.persist?.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useAuthStore.persist?.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    // Callback pages set their own tokens — don't interfere
    const path = window.location.pathname;
    if (path.startsWith('/auth/callback') || path.startsWith('/auth/telegram/callback')) return;

    const { refreshToken, user, setAuth, clearAuth } = useAuthStore.getState();

    // Already have user from cache — refresh token silently in background
    if (user && refreshToken) {
      api.auth.refreshToken(refreshToken)
        .then(async ({ accessToken, refreshToken: newRT }) => {
          setAccessToken(accessToken);
          const me = await api.auth.me();
          setAuth(me, accessToken, newRT);
        })
        .catch(() => clearAuth());
      return;
    }

    // No cached user — must refresh to get user
    if (refreshToken) {
      api.auth.refreshToken(refreshToken)
        .then(async ({ accessToken, refreshToken: newRT }) => {
          setAccessToken(accessToken);
          const me = await api.auth.me();
          setAuth(me, accessToken, newRT);
        })
        .catch(() => clearAuth());
      return;
    }

    // No refresh token at all
    clearAuth();
  }, [hydrated]);

  // Show nothing only on first load when there's no cached user
  const { user } = useAuthStore();
  if (!hydrated && !user) return null;

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInit>{children}</AuthInit>
      <ToastProvider />
    </QueryClientProvider>
  );
}
