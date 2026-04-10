'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { UserIcon } from '@/components/icons';
import { formatDate, cn } from '@/lib/utils';
import Link from 'next/link';

type Theme = 'dark' | 'light';
type FontSize = 'small' | 'medium' | 'large';

function applyTheme(theme: Theme) {
  const cl = document.documentElement.classList;
  cl.remove('dark', 'light');
  cl.add(theme);
  localStorage.setItem('theme', theme);
}

function applyFontSize(size: FontSize) {
  const cl = document.documentElement.classList;
  cl.remove('font-small', 'font-medium', 'font-large');
  if (size !== 'medium') cl.add(`font-${size}`);
  localStorage.setItem('fontSize', size);
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, setUser, clearAuth } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');
  const [fontSize, setFontSize] = useState<FontSize>('medium');

  useEffect(() => {
    setTheme((localStorage.getItem('theme') as Theme) || 'dark');
    setFontSize((localStorage.getItem('fontSize') as FontSize) || 'medium');
  }, []);

  async function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const updated = await api.auth.updateMe({ name });
    setUser(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleLogout() {
    clearAuth();
    router.push('/login');
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 sm:px-6 py-5 border-b border-[var(--border)]">
        <h1 className="text-xl font-medium" style={{ color: 'var(--text-primary)' }}>Профиль</h1>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* Avatar + name */}
        <div className="card">
          <div className="flex items-center gap-4 mb-5">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                <UserIcon size={24} className="text-accent" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user?.name ?? 'Ghost User'}</p>
              <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{user?.email ?? 'Telegram аккаунт'}</p>
              <span className="inline-block mt-1 text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                {user?.plan ?? 'FREE'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
                Имя
              </label>
              <input
                className="input-ghost"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || name === user?.name}
              className="btn btn-primary h-10 px-6 text-sm disabled:opacity-40"
            >
              {saving ? 'Сохранение...' : saved ? '✓ Сохранено' : 'Сохранить'}
            </button>
          </div>
        </div>

        {/* Plan info */}
        <div className="card">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Тариф</p>
              <p className="text-lg font-medium text-accent">{user?.plan ?? 'FREE'}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'var(--bg-elevated)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Истекает</p>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {user?.planExpiresAt ? formatDate(user.planExpiresAt) : 'Не истекает'}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <Link href="/billing" className="btn btn-accent-outline h-9 px-4 text-sm w-full sm:w-auto">
              Управление тарифом
            </Link>
          </div>
        </div>

        {/* Appearance — visible on all screens */}
        <div className="card">
          <h2 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Внешний вид</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Тема и размер шрифта</p>

          <div className="space-y-4">
            {/* Theme */}
            <div>
              <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Тема</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'dark' as Theme,  label: '🌙 Тёмная' },
                  { key: 'light' as Theme, label: '☀️ Светлая' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setTheme(key); applyTheme(key); }}
                    className={cn(
                      'py-2.5 rounded-xl text-sm border transition-all',
                      theme === key
                        ? 'border-accent bg-[var(--accent-dim)] text-accent'
                        : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                    )}
                    style={theme !== key ? { color: 'var(--text-secondary)' } : {}}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div>
              <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Размер шрифта</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'small' as FontSize,  label: 'A', desc: 'Мелкий' },
                  { key: 'medium' as FontSize, label: 'A', desc: 'Средний' },
                  { key: 'large' as FontSize,  label: 'A', desc: 'Крупный' },
                ] as const).map(({ key, label, desc }, i) => (
                  <button
                    key={key}
                    onClick={() => { setFontSize(key); applyFontSize(key); }}
                    className={cn(
                      'py-2.5 flex flex-col items-center rounded-xl border transition-all',
                      fontSize === key
                        ? 'border-accent bg-[var(--accent-dim)] text-accent'
                        : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                    )}
                    style={fontSize !== key ? { color: 'var(--text-secondary)' } : {}}
                  >
                    <span style={{ fontSize: 12 + i * 3 }}>{label}</span>
                    <span className="text-[10px] mt-0.5 opacity-60">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Settings link (desktop shortcut, always visible) */}
        <div className="card">
          <h2 className="font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Дополнительно</h2>
          <Link
            href="/settings"
            className="flex items-center justify-between py-2.5 px-3 rounded-xl border border-[var(--border)] hover:border-[var(--border-hover)] transition-colors"
          >
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Все настройки</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-muted)' }}>
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>

        {/* Logout — always visible */}
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
          <h2 className="font-medium text-red-400 mb-4">Выход</h2>
          <button
            onClick={handleLogout}
            className="btn btn-ghost h-10 px-5 text-sm text-red-400 w-full sm:w-auto"
            style={{ borderColor: 'rgba(239,68,68,0.3)' }}
          >
            Выйти из аккаунта
          </button>
        </div>

      </div>
    </div>
  );
}
