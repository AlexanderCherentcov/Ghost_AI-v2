'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { TelegramWebApp } from '@/hooks/useTelegram';
import { setInitData } from '@/lib/auth';

const TgContext = createContext<TelegramWebApp | null>(null);

export function useTg(): TelegramWebApp | null {
  return useContext(TgContext);
}

function ComingSoon() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0A0A12] text-white p-8 text-center">
      <div className="text-5xl mb-6">👻</div>
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-5" style={{background:'rgba(123,92,240,0.15)',color:'#7B5CF0',border:'1px solid rgba(123,92,240,0.3)'}}>
        <span style={{width:6,height:6,borderRadius:'50%',background:'#7B5CF0',display:'inline-block',animation:'pulse 2s infinite'}}/>
        В разработке
      </div>
      <h1 className="text-2xl font-semibold mb-3">GhostLine Mini App</h1>
      <p className="text-sm leading-relaxed max-w-xs" style={{color:'rgba(255,255,255,0.4)'}}>
        Мобильное приложение GhostLine для Telegram скоро появится. Следите за обновлениями.
      </p>
    </div>
  );
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
      // Cache initData so apiRequest can silently re-auth when JWT expires
      if (app.initData) setInitData(app.initData);
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!tg && process.env.NODE_ENV === 'production') {
    return <NotInTelegram />;
  }

  // WIP guard — only admin can access
  const ADMIN_TG_ID = 1800342635;
  const userId = tg?.initDataUnsafe?.user?.id;
  const isAdmin = userId === ADMIN_TG_ID;
  if (tg && !isAdmin) {
    return <ComingSoon />;
  }

  return <TgContext.Provider value={tg}>{children}</TgContext.Provider>;
}
