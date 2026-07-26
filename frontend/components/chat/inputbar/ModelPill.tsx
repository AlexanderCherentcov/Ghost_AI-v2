'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CasperCoin } from '@/components/icons';
import { cn } from '@/lib/utils';

const MODEL_OPTIONS: { key: 'haiku' | 'deepseek'; label: string }[] = [
  { key: 'haiku',    label: 'Стандарт' },
  { key: 'deepseek', label: 'Про' },
];

// Пилюля выбора модели (режим чата) — Стандарт/Про с индикатором стоимости.
export function ModelPill({
  preferredModel, setPreferredModel, userPlan, onUpgradeRequired, userProFreeRemaining,
}: {
  preferredModel?: 'haiku' | 'deepseek' | undefined;
  setPreferredModel: (m: 'haiku' | 'deepseek' | undefined) => void;
  userPlan?: string;
  onUpgradeRequired?: () => void;
  userProFreeRemaining?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // по умолчанию 'haiku', если не задано
  const currentKey = preferredModel ?? 'haiku';
  const current = MODEL_OPTIONS.find((o) => o.key === currentKey) ?? MODEL_OPTIONS[0];

  function proLabel(): React.ReactNode {
    if (!userPlan) return null; // ещё загружается
    if (userPlan === 'ULTRA') return <span className="text-[10px] opacity-50 ml-1">∞</span>;
    if (userProFreeRemaining !== undefined && userProFreeRemaining > 0) {
      return (
        <span className="text-[10px] ml-1" style={{ color: '#4ade80' }}>
          {userProFreeRemaining} бесп.
        </span>
      );
    }
    if (userPlan === 'FREE') return null;
    return (
      <span className="flex items-center gap-0.5 text-[10px] ml-1" style={{ color: 'var(--accent)' }}>
        1<CasperCoin size={10} />
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[12px] transition-colors rounded-md px-1.5 py-0.5"
        style={{ color: 'var(--text-secondary)' }}
      >
        {current.label}
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-full mb-2 left-0 z-50 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xl"
            style={{ minWidth: '150px' }}
          >
            {MODEL_OPTIONS.map((opt) => {
              const locked = opt.key === 'deepseek' && userPlan === 'FREE';
              const isPro = opt.key === 'deepseek';
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    if (locked) { onUpgradeRequired?.(); setOpen(false); return; }
                    setPreferredModel(opt.key);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-[12px] transition-colors flex items-center justify-between hover:bg-[var(--bg-void)]',
                    currentKey === opt.key ? 'text-accent' : ''
                  )}
                  style={currentKey !== opt.key ? { color: 'var(--text-primary)' } : {}}
                >
                  <span>{opt.label}</span>
                  {locked ? (
                    <span className="text-[10px] text-[rgba(123,92,240,0.7)] ml-2">PRO</span>
                  ) : isPro ? proLabel() : null}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
