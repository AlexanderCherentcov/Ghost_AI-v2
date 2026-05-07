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
  // Wait for Zustand persist to hydrate from localStorage (client-only)
  const [hydrated, setHydrated] = useState(false);
  // usePathname is SSR-safe — same value on server and client, no hydration mismatch
  const pathname = usePathname();

  useEffect(() => {
    // skipHydration=true in the store — trigger it manually here on the client.
    // This guarantees localStorage is read only in the browser, never on the server.
    const unsub = useAuthStore.persist?.onFinishHydration(() => setHydrated(true));
    useAuthStore.persist?.rehydrate();
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    // Callback pages set their own tokens — don't interfere
    if (pathname.startsWith('/auth/callback') || pathname.startsWith('/auth/telegram/callback')) return;

    const { refreshToken, user, setAuth, clearAuth } = useAuthStore.getState();

    // Already authenticated with an in-memory access token (e.g. fresh OAuth login) — skip refresh
    if (user && getAccessToken()) return;

    // Have a refresh token — use it to get a fresh access token
    if (refreshToken) {
      api.auth.refreshToken(refreshToken)
        .then(async ({ accessToken, refreshToken: newRT }) => {
          setAccessToken(accessToken);
          const me = await api.auth.me();
          setAuth(me, accessToken, newRT);
        })
        .catch((err) => {
          // Only clear auth on explicit 401 — network errors or 5xx should not log the user out
          if (err?.status === 401) clearAuth();
        });
      return;
    }

    // No refresh token — not logged in
    clearAuth();
  }, [hydrated, pathname]);

  // Callback pages must render immediately (no waiting) so their useState initializer
  // can capture the hash/tokens before React effects run.
  const isCallback = pathname.startsWith('/auth/callback') || pathname.startsWith('/auth/telegram/callback');

  // Before localStorage is hydrated: render nothing (same on server & client → no mismatch).
  // Once hydrated, always render children — auth redirects are handled by page components.
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
