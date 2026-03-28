'use client';

import { useEffect } from 'react';
import { GhostIcon } from '@/components/icons/GhostIcon';
import { api, setAccessToken } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  // Onboarding pages are outside (app) group — refresh token manually
  // so accessToken is available when user reloads the page mid-onboarding
  useEffect(() => {
    const { refreshToken, setAuth } = useAuthStore.getState();
    if (!refreshToken) return;
    api.auth.refreshToken(refreshToken)
      .then(async ({ accessToken, refreshToken: newRT }) => {
        setAccessToken(accessToken);
        const me = await api.auth.me();
        setAuth(me, accessToken, newRT);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-center pt-8 pb-4">
        <GhostIcon size={24} className="text-accent" />
        <span className="ml-2 text-sm font-medium text-white">GhostLine</span>
      </div>
      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        {children}
      </div>
    </div>
  );
}
