'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

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

const STYLES = [
  { id: 'ghost',    label: 'Призрачный' },
  { id: 'expert',   label: 'Экспертный' },
  { id: 'friendly', label: 'Дружелюбный' },
  { id: 'strict',   label: 'Строгий' },
  { id: 'creative', label: 'Творческий' },
];

function SupportInlineForm({ userEmail }: { userEmail: string | null }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.support.send({ message: message.trim() });
      setSent(true);
      setMessage('');
    } catch {
      setError('Не удалось отправить. Попробуйте позже.');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center py-2">
        <p className="text-accent font-medium mb-1">✓ Сообщение отправлено</p>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Ответим на {userEmail ?? 'ваш email'}.</p>
        <button onClick={() => setSent(false)} className="mt-3 text-sm text-accent hover:opacity-80">
          Написать ещё
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {userEmail && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ответ придёт на {userEmail}</p>
      )}
      <textarea
        placeholder="Опишите вашу проблему или вопрос..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-sm focus:outline-none focus:border-accent resize-none transition-colors"
        style={{ color: 'var(--text-primary)' }}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={handleSend}
        disabled={sending || !message.trim()}
        className="btn btn-primary h-10 px-5 text-sm disabled:opacity-40 w-full sm:w-auto"
      >
        {sending ? 'Отправка...' : 'Отправить в поддержку'}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, setUser, clearAuth } = useAuthStore();
  const [style, setStyle] = useState(user?.responseStyle ?? 'ghost');
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');
  const [fontSize, setFontSize] = useState<FontSize>('medium');

  useEffect(() => {
    setTheme((localStorage.getItem('theme') as Theme) || 'dark');
    setFontSize((localStorage.getItem('fontSize') as FontSize) || 'medium');
  }, []);

  async function handleSaveStyle() {
    setSaving(true);
    const updated = await api.auth.updateMe({ responseStyle: style });
    setUser(updated);
    setSaving(false);
  }

  function handleLogout() {
    clearAuth();
    router.push('/login');
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 sm:px-6 py-5 border-b border-[var(--border)]">
        <h1 className="text-xl font-medium" style={{ color: 'var(--text-primary)' }}>Настройки</h1>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Response style */}
        <div className="card">
          <h2 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Стиль ответов</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Как GhostLine отвечает на вопросы</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {STYLES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setStyle(id)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-sm border transition-all',
                  style === id
                    ? 'border-accent bg-[var(--accent-dim)] text-accent'
                    : 'border-[var(--border)] hover:border-[var(--border-hover)]'
                )}
                style={style !== id ? { color: 'var(--text-secondary)' } : {}}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleSaveStyle}
            disabled={saving || style === user?.responseStyle}
            className="btn btn-primary h-10 px-5 text-sm disabled:opacity-40"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>

        {/* Appearance */}
        <div className="card">
          <h2 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Внешний вид</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Тема и размер шрифта</p>

          <div className="space-y-4">
            {/* Theme */}
            <div>
              <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Тема</p>
              <div className="flex gap-2">
                {([
                  { key: 'dark' as Theme,  label: '🌙 Тёмная' },
                  { key: 'light' as Theme, label: '☀️ Светлая' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setTheme(key); applyTheme(key); }}
                    className={cn(
                      'flex-1 py-2.5 rounded-xl text-sm border transition-all focus-visible:ring-2 focus-visible:ring-accent',
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
              <div className="flex gap-2">
                {([
                  { key: 'small' as FontSize,  label: 'A', desc: 'Мелкий' },
                  { key: 'medium' as FontSize, label: 'A', desc: 'Средний' },
                  { key: 'large' as FontSize,  label: 'A', desc: 'Крупный' },
                ] as const).map(({ key, label, desc }, i) => (
                  <button
                    key={key}
                    onClick={() => { setFontSize(key); applyFontSize(key); }}
                    className={cn(
                      'flex-1 py-2 flex flex-col items-center rounded-xl border transition-all focus-visible:ring-2 focus-visible:ring-accent',
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

        {/* Account */}
        <div className="card">
          <h2 className="font-medium mb-4" style={{ color: 'var(--text-primary)' }}>Аккаунт</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Email</span>
              <span className="text-sm truncate ml-3 max-w-[60%] text-right" style={{ color: 'var(--text-primary)' }}>{user?.email ?? 'Не указан'}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Тариф</span>
              <span className="text-sm text-accent">{user?.plan ?? 'FREE'}</span>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="card">
          <h2 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Поддержка</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Напишите нам — ответим на ваш email</p>
          <SupportInlineForm userEmail={user?.email ?? null} />
        </div>

        {/* Danger zone */}
        <div className="card border-red-500/20">
          <h2 className="font-medium text-red-400 mb-4">Выход</h2>
          <button
            onClick={handleLogout}
            className="btn btn-ghost h-10 px-5 text-sm border-red-500/30 text-red-400 hover:bg-red-500/10 w-full sm:w-auto"
          >
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  );
}
