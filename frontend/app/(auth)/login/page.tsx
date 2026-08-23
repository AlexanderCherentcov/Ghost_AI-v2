'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GhostIcon } from '@/components/icons/GhostIcon';
import { api, setAccessToken } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { AuthShell, ConsentCheckbox, OAuthButton } from '@/components/auth/AuthShell';
import { freeTierTagline } from '@/lib/pricing';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function YandexIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#FC3F1D" />
      <text x="12" y="17" textAnchor="middle" fill="white" fontFamily="Arial, sans-serif" fontWeight="bold" fontSize="13">Я</text>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path d="M5.2 11.8L18 6.5l-2.3 11-4-3.3-2.2 2.1.4-3.5 5.8-5.2-7.3 4.5-3.2-1z" fill="white" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [tgLoading, setTgLoading] = useState(false);
  const [tgError, setTgError] = useState(false);
  // Отмечен заранее: вернувшиеся пользователи уже согласились; новые всё равно увидят чекбокс
  const [consented, setConsented] = useState(true);
  // Бонус/лимит FREE-тарифа — с бэкенда, не захардкожены
  const [tagline, setTagline] = useState<string | null>(null);

  useEffect(() => {
    api.payments.plans()
      .then((data) => setTagline(freeTierTagline(data.free.welcome_caspers)))
      .catch(() => {});
  }, []);

  // ── Telegram Mini App: автоавторизация через initData ──────────────────────
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.initData) return; // Не внутри Telegram — показываем обычный вход

    tg.ready?.();
    tg.expand?.();

    setTgLoading(true);

    api.auth.telegramWebApp(tg.initData)
      .then((res) => {
        setAccessToken(res.accessToken);
        setAuth(res.user, res.accessToken, res.refreshToken);
        router.replace(res.isNew || !res.user.onboardingDone ? '/onboarding/name' : '/chat');
      })
      .catch(() => {
        setTgLoading(false);
        setTgError(true);
      });
  }, []);

  // ── Состояние загрузки Telegram WebApp ──────────────────────────────────────
  if (tgLoading) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center justify-center gap-4 py-10">
          <GhostIcon size={48} className="text-accent animate-float" animated />
          <p className="text-sm text-[rgba(255,255,255,0.4)]">Входим через Telegram...</p>
        </div>
      </AuthShell>
    );
  }

  if (tgError) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
          <GhostIcon size={48} className="text-accent" />
          <p className="text-white font-medium">Не удалось войти через Telegram</p>
          <p className="text-sm text-[rgba(255,255,255,0.4)]">Закройте и откройте приложение заново</p>
          <button
            onClick={() => { setTgError(false); setTgLoading(false); window.location.reload(); }}
            className="mt-2 px-6 py-2.5 rounded-xl bg-accent text-white text-sm font-medium"
          >
            Попробовать снова
          </button>
        </div>
      </AuthShell>
    );
  }

  // ── Обычный вход через веб ───────────────────────────────────────────────
  return (
    <AuthShell tagline={tagline}>
      <h1 className="font-display text-[26px] font-bold text-white mb-1.5">Добро пожаловать назад</h1>
      <p className="text-sm text-[rgba(255,255,255,0.5)] mb-7">Войдите, чтобы продолжить диалог</p>

      <ConsentCheckbox consented={consented} onChange={setConsented} />

      <div className="space-y-3 mt-5">
        <OAuthButton href={`${API_URL}/api/auth/yandex`} enabled={consented} icon={<YandexIcon />} label="Войти через Яндекс" />
        <OAuthButton href={`${API_URL}/api/auth/google`} enabled={consented} icon={<GoogleIcon />} label="Войти через Google" />
        <OAuthButton href="https://t.me/GhostSuperAI_bot?start=auth" external enabled={consented} icon={<TelegramIcon />} label="Войти через Telegram" />
      </div>

      <p className="text-center text-[13.5px] text-[rgba(255,255,255,0.45)] mt-6">
        Нет аккаунта?{' '}
        <Link href="/register" className="text-[#c4b5fd] hover:opacity-80 font-medium">
          Создать
        </Link>
      </p>
    </AuthShell>
  );
}
