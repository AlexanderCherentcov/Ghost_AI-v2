'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/ui/PageLoader';
import { api, setAccessToken } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

export default function TelegramCallbackPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    // Читаем параметры напрямую из window.location — useSearchParams() может вернуть
    // пустой объект во время гидратации статического экспорта, пока роутер Next.js не готов
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

  return <PageLoader label="Входим через Telegram" />;
}
