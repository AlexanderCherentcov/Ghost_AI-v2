'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

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
        <p className="text-sm text-[rgba(255,255,255,0.4)]">Ответим на {userEmail ?? 'ваш email'}.</p>
        <button onClick={() => setSent(false)} className="mt-3 text-sm text-accent hover:opacity-80">
          Написать ещё
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {userEmail && (
        <p className="text-xs text-[rgba(255,255,255,0.3)]">Ответ придёт на {userEmail}</p>
      )}
      <textarea
        placeholder="Опишите вашу проблему или вопрос..."
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-base)] text-sm text-white placeholder-[rgba(255,255,255,0.3)] focus:outline-none focus:border-accent resize-none"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={handleSend}
        disabled={sending || !message.trim()}
        className="btn btn-primary h-10 px-5 text-sm disabled:opacity-40"
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
      <div className="px-6 py-5 border-b border-[var(--border)]">
        <h1 className="text-xl font-medium text-white">Настройки</h1>
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-6 space-y-6">
        {/* Response style */}
        <div className="card">
          <h2 className="font-medium text-white mb-1">Стиль ответов</h2>
          <p className="text-sm text-[rgba(255,255,255,0.3)] mb-4">Как GhostLine отвечает на вопросы</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {STYLES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setStyle(id)}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm border transition-all',
                  style === id
                    ? 'border-accent bg-[var(--accent-dim)] text-accent'
                    : 'border-[var(--border)] text-[rgba(255,255,255,0.4)] hover:border-[var(--border-hover)]'
                )}
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

        {/* Account */}
        <div className="card">
          <h2 className="font-medium text-white mb-4">Аккаунт</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
              <span className="text-sm text-[rgba(255,255,255,0.5)]">Email</span>
              <span className="text-sm text-white">{user?.email ?? 'Не указан'}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[var(--border)]">
              <span className="text-sm text-[rgba(255,255,255,0.5)]">Plan</span>
              <span className="text-sm text-accent">{user?.plan ?? 'FREE'}</span>
            </div>
          </div>
        </div>

        {/* Support */}
        <div className="card">
          <h2 className="font-medium text-white mb-1">Поддержка</h2>
          <p className="text-sm text-[rgba(255,255,255,0.3)] mb-4">Напишите нам — ответим на ваш email</p>
          <SupportInlineForm userEmail={user?.email ?? null} />
        </div>

        {/* Danger zone */}
        <div className="card border-red-500/20">
          <h2 className="font-medium text-red-400 mb-4">Выход</h2>
          <button
            onClick={handleLogout}
            className="btn btn-ghost h-10 px-5 text-sm border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  );
}
