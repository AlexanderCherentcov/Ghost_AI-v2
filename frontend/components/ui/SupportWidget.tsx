'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GhostIcon } from '@/components/icons/GhostIcon';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

export function SupportWidget() {
  const { user } = useAuthStore();
  const [open, setOpen]       = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail]     = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  async function handleSend() {
    if (!message.trim()) return;
    if (!user && !email.trim()) { setError('Укажите email для ответа'); return; }
    setSending(true);
    setError('');
    try {
      await api.support.send({
        message: message.trim(),
        email: user ? undefined : email.trim(),
      });
      setSent(true);
      setMessage('');
    } catch {
      setError('Не удалось отправить. Попробуйте позже.');
    } finally {
      setSending(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setSent(false);
    setError('');
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-accent shadow-lg shadow-accent/30 flex items-center justify-center hover:scale-110 transition-transform"
        aria-label="Поддержка"
      >
        <GhostIcon size={22} className="text-white" />
      </button>

      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={handleClose}
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 z-50 w-80 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <GhostIcon size={18} className="text-accent" />
                <span className="font-medium text-white text-sm">Поддержка</span>
              </div>
              <button
                onClick={handleClose}
                className="text-[rgba(255,255,255,0.3)] hover:text-white transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>

            {sent ? (
              <div className="text-center py-4">
                <p className="text-accent text-2xl mb-2">✓</p>
                <p className="text-white text-sm font-medium mb-1">Сообщение отправлено!</p>
                <p className="text-[rgba(255,255,255,0.4)] text-xs">Мы ответим на ваш email.</p>
                <button
                  onClick={handleClose}
                  className="mt-4 text-sm text-accent hover:opacity-80"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <>
                {!user && (
                  <input
                    type="email"
                    placeholder="Ваш email для ответа"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full mb-3 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-base)] text-sm text-white placeholder-[rgba(255,255,255,0.3)] focus:outline-none focus:border-accent"
                  />
                )}
                {user && (
                  <p className="text-xs text-[rgba(255,255,255,0.3)] mb-3">
                    Ответ придёт на {user.email ?? 'ваш email'}
                  </p>
                )}
                <textarea
                  placeholder="Опишите вашу проблему или вопрос..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-base)] text-sm text-white placeholder-[rgba(255,255,255,0.3)] focus:outline-none focus:border-accent resize-none"
                />
                {error && (
                  <p className="mt-2 text-xs text-red-400">{error}</p>
                )}
                <button
                  onClick={handleSend}
                  disabled={sending || !message.trim()}
                  className="mt-3 w-full btn btn-primary h-10 text-sm disabled:opacity-40"
                >
                  {sending ? 'Отправка...' : 'Отправить'}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
