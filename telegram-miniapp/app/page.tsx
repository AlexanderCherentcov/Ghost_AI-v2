'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TelegramProvider } from '@/components/TelegramProvider';
import { initAuth } from '@/lib/auth';

export default function TgRootPage() {
  return (
    <TelegramProvider>
      <TgInit />
    </TelegramProvider>
  );
}

function TgInit() {
  const router = useRouter();
  const [status, setStatus] = useState('Инициализация...');

  useEffect(() => {
    async function init() {
      try {
        const initData = window.Telegram?.WebApp?.initData ?? '';

        if (!initData && process.env.NODE_ENV !== 'production') {
          // Dev mode: skip auth
          router.replace('/chat');
          return;
        }

        setStatus('Авторизация...');
        const { isNew, user } = await initAuth(initData);

        if (isNew || !user.onboardingDone) {
          router.replace('/onboarding/name');
        } else {
          router.replace('/chat');
        }
      } catch {
        setStatus('Ошибка подключения');
      }
    }

    init();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0A0A12] text-white">
      <div className="text-4xl mb-4 animate-float">👻</div>
      <p className="text-sm text-[rgba(255,255,255,0.4)]">{status}</p>
    </div>
  );
}
