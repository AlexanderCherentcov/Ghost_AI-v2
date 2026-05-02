'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { GhostIcon } from '@/components/icons/GhostIcon';

// Admin email is configured via env variable
// Set NEXT_PUBLIC_ADMIN_EMAIL=your@email.com in .env.local
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '';

export default function TelegramMiniAppPage() {
  const { user } = useAuthStore();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  // Not mounted yet (SSR) — show nothing
  if (!isMounted) return null;

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6"
        style={{ background: 'var(--bg-void)', color: 'var(--text-primary)' }}>
        <GhostIcon size={56} className="text-accent mb-6 animate-float" animated />
        <h1 className="text-2xl font-semibold mb-3">GhostLine Mini App</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Для доступа необходимо войти в аккаунт GhostLine.
        </p>
      </div>
    );
  }

  // Access check — only admin
  const isAdmin = ADMIN_EMAIL ? user.email === ADMIN_EMAIL : false;
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6"
        style={{ background: 'var(--bg-void)', color: 'var(--text-primary)' }}>
        <GhostIcon size={56} className="text-accent mb-6 animate-float" animated />
        <h1 className="text-2xl font-semibold mb-3">Нет доступа</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Эта страница доступна только администратору.
        </p>
      </div>
    );
  }

  // Admin view — placeholder
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6"
      style={{ background: 'var(--bg-void)', color: 'var(--text-primary)' }}>
      <GhostIcon size={72} className="text-accent mb-8 animate-float" animated />

      <div className="max-w-sm w-full">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6"
          style={{ background: 'rgba(123,92,240,0.15)', color: 'var(--accent)', border: '1px solid rgba(123,92,240,0.3)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          В разработке
        </div>

        <h1 className="text-3xl font-semibold mb-3">Telegram Mini App</h1>
        <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--text-secondary)' }}>
          Мобильное приложение GhostLine для Telegram скоро появится.
          Здесь будет полный функционал платформы прямо внутри мессенджера.
        </p>

        <div className="space-y-3 text-left">
          {[
            { icon: '💬', label: 'AI-чат', desc: 'Диалоги прямо в Telegram' },
            { icon: '🖼', label: 'Генерация изображений', desc: 'DALL-E и Stable Diffusion' },
            { icon: '🎬', label: 'Создание видео', desc: 'Видео по текстовому описанию' },
            { icon: '🎵', label: 'Генерация музыки', desc: 'Треки в любом стиле' },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <span className="text-xl flex-shrink-0">{f.icon}</span>
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{f.label}</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs mt-8" style={{ color: 'var(--text-muted)' }}>
          Доступ: только администратор · ghostlineai.ru
        </p>
      </div>
    </div>
  );
}
