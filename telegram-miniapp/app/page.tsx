'use client';

export const runtime = 'edge';

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
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Инициализация...');
  const [error, setError] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        // Phase 1: 0 → 30% — prepare
        setProgress(10);
        await tick(120);
        setProgress(30);

        const initData = window.Telegram?.WebApp?.initData ?? '';

        if (!initData && process.env.NODE_ENV !== 'production') {
          setProgress(100);
          router.replace('/chat');
          return;
        }

        // Phase 2: 30 → 70% — auth request
        setStatus('Авторизация...');
        setProgress(50);
        const { isNew, user } = await initAuth(initData);
        setProgress(80);

        // Phase 3: 80 → 100% — redirect
        setStatus('Добро пожаловать!');
        await tick(200);
        setProgress(100);
        await tick(150);

        if (isNew || (!user.onboardingDone && !user.name)) {
          router.replace('/onboarding/name');
        } else {
          router.replace('/chat');
        }
      } catch {
        setStatus('Ошибка подключения');
        setError(true);
        setProgress(0);
      }
    }

    init();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#06060B] text-white px-8">
      <div className="text-5xl mb-6" style={{ animation: 'float 3s ease-in-out infinite' }}>👻</div>
      <p className="text-lg font-medium mb-1 tracking-tight">GhostLine</p>
      <p className="text-sm mb-8" style={{ color: error ? '#f87171' : 'rgba(255,255,255,0.35)' }}>
        {status}
      </p>

      {/* Progress bar */}
      <div className="w-48 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${progress}%`,
            background: error ? '#f87171' : '#7B5CF0',
          }}
        />
      </div>

      {!error && (
        <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
          {progress}%
        </p>
      )}

      <style>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }`}</style>
    </div>
  );
}

function tick(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
