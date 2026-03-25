'use client';

import { motion } from 'framer-motion';
import { GhostIcon } from '@/components/icons/GhostIcon';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ghostlineai.ru';
// Bot ID extracted from token prefix (public, safe to expose)
const TG_BOT_ID = process.env.NEXT_PUBLIC_TG_BOT_ID ?? '8761513040';
const TG_AUTH_URL = `https://oauth.telegram.org/auth?bot_id=${TG_BOT_ID}&origin=${encodeURIComponent(SITE_URL)}&return_to=${encodeURIComponent(`${API_URL}/api/auth/telegram/callback`)}`;

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
  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[380px]"
      >
        <div className="card" style={{ borderRadius: '20px', padding: '32px' }}>
          {/* Ghost */}
          <div className="text-center mb-6">
            <GhostIcon
              size={48}
              className="text-accent animate-float mx-auto mb-4"
              animated
            />
            <h1 className="text-xl font-medium text-white mb-1">Войдите в тень.</h1>
            <p className="text-sm text-[rgba(255,255,255,0.3)] italic">
              GhostLine помнит всех, кто приходил.
            </p>
          </div>

          {/* Auth buttons */}
          <div className="space-y-3">
            <a
              href={`${API_URL}/api/auth/yandex`}
              className="w-full flex items-center justify-center gap-3 h-12 rounded-xl border border-[var(--border-hover)] bg-transparent text-sm text-[rgba(255,255,255,0.7)] hover:bg-[var(--bg-elevated)] hover:text-white transition-all"
            >
              <YandexIcon />
              Войти через Яндекс
            </a>

            <a
              href={`${API_URL}/api/auth/google`}
              className="w-full flex items-center justify-center gap-3 h-12 rounded-xl border border-[var(--border-hover)] bg-transparent text-sm text-[rgba(255,255,255,0.7)] hover:bg-[var(--bg-elevated)] hover:text-white transition-all"
            >
              <GoogleIcon />
              Войти через Google
            </a>

            <a
              href={TG_AUTH_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-3 h-12 rounded-xl border border-[var(--border-hover)] bg-transparent text-sm text-[rgba(255,255,255,0.7)] hover:bg-[var(--bg-elevated)] hover:text-white transition-all"
            >
              <TelegramIcon />
              Войти через Telegram
            </a>
          </div>

          <div className="mt-6 pt-5 border-t border-[var(--border)] text-center">
            <p className="text-[11px] text-[rgba(255,255,255,0.2)] leading-relaxed">
              Входя, вы соглашаетесь с{' '}
              <a href="/terms" className="text-accent hover:opacity-80">условиями</a>{' '}
              и{' '}
              <a href="/privacy" className="text-accent hover:opacity-80">политикой конфиденциальности</a>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-[rgba(255,255,255,0.15)] mt-6">
          50 000 токенов бесплатно после регистрации
        </p>
      </motion.div>
    </div>
  );
}
