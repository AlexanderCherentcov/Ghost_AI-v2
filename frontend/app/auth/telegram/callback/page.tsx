'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GhostIcon } from '@/components/icons/GhostIcon';
import { api, setAccessToken } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

function TelegramCallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    async function handle() {
      // Collect all query params Telegram sends
      const data: Record<string, string> = {};
      params.forEach((value, key) => {
        data[key] = value;
      });

      if (!data.id || !data.hash) {
        router.replace('/login?error=tg_no_data');
        return;
      }

      try {
        const res = await api.auth.telegramVerify(data);
        setAccessToken(res.accessToken);
        setAuth(res.user, res.accessToken, res.refreshToken);
        router.replace(res.isNew || !res.user.onboardingDone ? '/onboarding/name' : '/chat');
      } catch {
        router.replace('/login?error=tg_failed');
      }
    }

    handle();
  }, []);

  return null;
}

export default function TelegramCallbackPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex flex-col items-center justify-center gap-4">
      <GhostIcon size={40} className="text-accent animate-float" animated />
      <p className="text-sm text-[rgba(255,255,255,0.4)]">Входим через Telegram...</p>
      <Suspense>
        <TelegramCallbackHandler />
      </Suspense>
    </div>
  );
}
