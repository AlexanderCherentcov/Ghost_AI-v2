'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// Кастомный select (стилизованный дропдаун вместо нативного <select>).
export function CustomSelect<T extends string>({
  value, onChange, options, direction = 'up',
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  direction?: 'up' | 'down';
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

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-medium transition-all hover:border-[rgba(255,255,255,0.2)]"
        style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      >
        {current.icon && <span className="flex-shrink-0 opacity-70">{current.icon}</span>}
        <span>{current.label}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className="opacity-40 ml-0.5">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: direction === 'up' ? 4 : -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: direction === 'up' ? 4 : -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute left-0 z-50 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xl',
              direction === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            )}
            style={{ minWidth: '130px' }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  'w-full text-left px-3 py-2 text-[12px] flex items-center gap-2 transition-colors hover:bg-[var(--bg-void)]',
                  value === opt.value ? 'text-accent' : ''
                )}
                style={value !== opt.value ? { color: 'var(--text-primary)' } : {}}
              >
                {opt.icon && <span className="flex-shrink-0 opacity-70">{opt.icon}</span>}
                <span className="flex-1">{opt.label}</span>
                {value === opt.value && (
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M3.5 10.5l5 5L17 6"/>
                  </svg>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
