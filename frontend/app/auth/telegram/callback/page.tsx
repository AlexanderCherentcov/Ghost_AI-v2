'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GhostIcon } from '@/components/icons/GhostIcon';
import { api, setAccessToken } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

export default function TelegramCallbackPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    // Read params directly from window.location — useSearchParams() can return
    // empty object during static-export hydration before Next.js router is ready
    const params = new URLSearchParams(window.location.search);
    const data: Record<string, string> = {};
    params.forEach((value, key) => { data[key] = value; });

    if (!data.id || !data.hash) {
      router.replace('/login?error=tg_no_data');
      return;
    }

    api.auth.telegramVerify(data)
      .then((res) => {
        setAccessToken(res.accessToken);
        setAuth(res.user, res.accessToken, res.refreshToken);
        router.replace(res.isNew || !res.user.onboardingDone ? '/onboarding/name' : '/chat');
      })
      .catch(() => {
        router.replace('/login?error=tg_failed');
      });
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex flex-col items-center justify-center gap-4">
      <GhostIcon size={40} className="text-accent animate-float" animated />
      <p className="text-sm text-[rgba(255,255,255,0.4)]">Входим через Telegram...</p>
    </div>
  );
}
