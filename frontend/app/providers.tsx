'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { api, setAccessToken } from '@/lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

function AuthInit({ children }: { children: React.ReactNode }) {
  const { refreshToken, setAuth, clearAuth, setLoading } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      if (!refreshToken) {
        setLoading(false);
        setReady(true);
        return;
      }

      try {
        const { accessToken: newAccess, refreshToken: newRefresh } =
          await api.auth.refreshToken(refreshToken);
        setAccessToken(newAccess);

        const user = await api.auth.me();
        setAuth(user, newAccess, newRefresh);
      } catch {
        clearAuth();
      } finally {
        setReady(true);
      }
    }

    init();
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInit>{children}</AuthInit>
    </QueryClientProvider>
  );
}
