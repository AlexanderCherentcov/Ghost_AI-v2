'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';

// Панель настроек генерации, выезжающая справа — по прямому запросу Александра
// ("можно чтобы справа появлялась панель"), вместо инлайн-виджета, растягивающего
// composer. Тот же паттерн подложки (fixed inset-0 + scrim), что у LimitPopup,
// только сама панель прижата к правому краю и едет по X, а не всплывает по центру.
export function SettingsPanel({
  open, onClose, title, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  // Esc закрывает панель — стандартное поведение для выезжающих боковых панелей.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[70]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className="fixed right-0 top-0 bottom-0 z-[70] w-[min(380px,100vw)] flex flex-col"
            style={{ background: 'var(--panel-glass-sidebar)', borderLeft: '1px solid var(--panel-glass-border)', WebkitBackdropFilter: 'blur(16px)', backdropFilter: 'blur(16px)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--panel-glass-border)' }}>
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--accent-dim)]"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Закрыть"
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-5">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Секция панели: заголовок + контент — единый вид для всех блоков настроек.
export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-bold tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

// Ряд кнопок-опций (единый выбор) — переиспользуемый вид для длительности/формата/etc.
export function SettingsChoiceRow<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all"
          style={
            value === opt.value
              ? { background: 'var(--accent-dim)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }
              : { background: 'var(--panel-glass)', color: 'var(--text-secondary)', borderColor: 'var(--panel-glass-border)' }
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
