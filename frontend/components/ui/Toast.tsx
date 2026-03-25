'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { create } from 'zustand';

type ToastType = 'error' | 'success' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: ToastItem[];
  show: (message: string, type?: ToastType) => void;
  dismiss: (id: number) => void;
}

let _id = 0;

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  show: (message, type = 'info') => {
    const id = ++_id;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

const COLORS: Record<ToastType, string> = {
  error:   'border-red-500/30 bg-red-500/10 text-red-300',
  success: 'border-green-500/30 bg-green-500/10 text-green-300',
  info:    'border-[var(--accent-border)] bg-[var(--accent-dim)] text-white',
};

const ICONS: Record<ToastType, string> = {
  error: '✕',
  success: '✓',
  info: '👻',
};

export function ToastProvider() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm max-w-[320px] shadow-xl ${COLORS[t.type]}`}
          >
            <span className="text-base leading-none mt-0.5">{ICONS[t.type]}</span>
            <p className="flex-1 text-sm leading-snug">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-current opacity-40 hover:opacity-80 text-lg leading-none focus:outline-none ml-1"
            >
              ×
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
