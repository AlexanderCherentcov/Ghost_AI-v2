'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { TelegramWebApp } from '@/hooks/useTelegram';

const TgContext = createContext<TelegramWebApp | null>(null);

export function useTg(): TelegramWebApp | null {
  return useContext(TgContext);
}

function NotInTelegram() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0A0A12] text-white p-6 text-center">
      <div className="text-4xl mb-4">👻</div>
      <h1 className="text-xl font-medium mb-2">Откройте в Telegram</h1>
      <p className="text-sm text-[rgba(255,255,255,0.4)]">
        GhostLine Mini App работает только внутри Telegram.
      </p>
    </div>
  );
}

export function TelegramProvider({ children }: { children: React.ReactNode }) {
  const [tg, setTg] = useState<TelegramWebApp | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const app = window.Telegram?.WebApp ?? null;
    if (app) {
      app.ready();
      app.expand();
      app.disableVerticalSwipes();
      app.setHeaderColor('#0A0A12');
      app.setBackgroundColor('#0A0A12');
      setTg(app);
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!tg && process.env.NODE_ENV === 'production') {
    return <NotInTelegram />;
  }

  return <TgContext.Provider value={tg}>{children}</TgContext.Provider>;
}
