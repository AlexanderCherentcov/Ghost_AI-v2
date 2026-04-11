'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { api, setAccessToken } from '@/lib/api';
import { GhostIcon } from '@/components/icons/GhostIcon';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { setAuth, clearAuth } = useAuthStore();

  useEffect(() => {
    // Next.js App Router calls history.replaceState during hydration which
    // strips both query string AND hash before useEffect runs.
    // A sync inline script in layout.tsx saves the hash to sessionStorage
    // before any JS runs, so we can always read it here.
    const saved = sessionStorage.getItem('_oauthHash') ?? '';
    sessionStorage.removeItem('_oauthHash');
    const hash = saved || window.location.hash;
    const params = new URLSearchParams(hash.slice(1));
    const access = params.get('access');
    const refresh = params.get('refresh');
    const redirect = decodeURIComponent(params.get('redirect') ?? '/chat');

    if (!access || !refresh) {
      clearAuth();
      router.replace('/login');
      return;
    }

    setAccessToken(access);

    api.auth.me()
      .then((user) => {
        setAuth(user, access, refresh);
        router.replace(redirect);
      })
      .catch(() => {
        clearAuth();
        router.replace('/login');
      });
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex flex-col items-center justify-center gap-4">
      <GhostIcon size={40} className="text-accent animate-float" animated />
      <p className="text-sm text-[rgba(255,255,255,0.3)]">Входим в тень...</p>
    </div>
  );
}
