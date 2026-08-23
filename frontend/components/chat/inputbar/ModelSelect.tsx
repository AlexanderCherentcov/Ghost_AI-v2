'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, planAtLeast } from '@/lib/utils';

export interface ModelSelectOption {
  id: string;
  label: string;
  blurb?: string;
  minPlan: string;
  /** Готовая метка стоимости (число Caspers + иконка), собирается в родителе — там известна длительность/вариант. */
  cost?: React.ReactNode;
}

// Общий выпадающий список выбора модели для видео/картинок — с подписью-blurb
// и лок-бейджем тарифа (аналог ModelPill, но без пункта «Авто» и с другим триггером-боксом).
//
// Список рендерится через портал в document.body, а не как обычный absolute-потомок
// триггера. Причина: VideoWidget/ImageWidget сами анимируются через framer-motion
// (initial/animate с y) — CSS transform на анимируемом предке создаёт свой stacking
// context, и z-50 у списка внутри него не может перебить соседей СНАРУЖИ этого предка
// (в частности, textarea композера, который рисуется поверх и перекрывает список).
// Портал полностью выносит список из этой ловушки, позиционируем вручную по rect'у триггера.
export function ModelSelect({
  value, options, onChange, userPlan, onUpgradeRequired, triggerIcon, direction = 'up',
}: {
  value: string;
  options: ModelSelectOption[];
  onChange: (id: string) => void;
  userPlan?: string;
  onUpgradeRequired?: () => void;
  triggerIcon?: React.ReactNode;
  direction?: 'up' | 'down';
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; bottom: number; maxHeight: number; direction: 'up' | 'down' } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Раньше maxHeight был фиксирован в 360px независимо от того, сколько места реально
  // есть до края экрана — если триггер стоял близко к краю (композер внизу экрана,
  // список видео-моделей длинный), панель вылезала за viewport и часть пунктов (включая
  // последний) была физически недостижима: overflow-y:auto скроллит СОДЕРЖИМОЕ внутри
  // своей же 360px-коробки, а не то, что видно на экране — если сама коробка вылезает
  // за границу viewport, эта её часть не появится ни при каком скролле.
  // Фикс: считаем реально доступное место в обе стороны и открываем панель туда, где
  // его больше — не только когда предпочтительная сторона совсем впритык (было <160px,
  // но у VideoWidget/ImageWidget триггер стоит невысоко над композером, и 250-300px
  // вниз — уже достаточно тесно для списка видео-моделей из 14 пунктов, а места вверх
  // при этом почти всегда в разы больше).
  const updateRect = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 12;
    const spaceAbove = r.top - margin;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const preferred = direction === 'up' ? spaceAbove : spaceBelow;
    const other = direction === 'up' ? spaceBelow : spaceAbove;
    const effectiveDirection = other > preferred ? (direction === 'up' ? 'down' : 'up') : direction;
    const available = effectiveDirection === 'up' ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(120, Math.min(360, available));
    setRect({ left: r.left, top: r.top, bottom: r.bottom, maxHeight, direction: effectiveDirection });
  }, [direction]);

  useLayoutEffect(() => {
    if (open) updateRect();
  }, [open, updateRect]);

  useEffect(() => {
    if (!open) return;
    function onScrollOrResize() { updateRect(); }
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updateRect]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = options.find((o) => o.id === value) ?? options[0];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-medium transition-all hover:border-[rgba(255,255,255,0.2)] min-w-0 max-w-full"
        style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      >
        {triggerIcon && <span className="flex-shrink-0 opacity-70">{triggerIcon}</span>}
        {/* truncate — этот триггер теперь делит строку с бейджем стоимости и кнопкой
            "Настройки" (VideoWidget/ImageWidget); без truncate длинное имя модели
            переносится и ломает высоту строки (та же бага, что раньше была в ModelPill). */}
        <span className="truncate min-w-0">{current?.label ?? '...'}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className="opacity-40 ml-0.5 flex-shrink-0">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </button>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && rect && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: rect.direction === 'up' ? 4 : -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: rect.direction === 'up' ? 4 : -4, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="fixed z-[80] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xl"
              style={{
                left: rect.left, minWidth: '240px', maxWidth: 'calc(100vw - 24px)', maxHeight: rect.maxHeight, overflowY: 'auto',
                ...(rect.direction === 'up' ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
              }}
            >
              {options.map((opt) => {
                const locked = !planAtLeast(userPlan, opt.minPlan);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (locked) { onUpgradeRequired?.(); setOpen(false); return; }
                      onChange(opt.id);
                      setOpen(false);
                    }}
                    className={cn(
                      'w-full text-left px-3.5 py-2.5 text-[12px] transition-colors flex items-start justify-between gap-2 hover:bg-[var(--bg-void)]',
                      value === opt.id ? 'text-accent' : ''
                    )}
                    style={value !== opt.id ? { color: 'var(--text-primary)' } : {}}
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="truncate">{opt.label}</span>
                      {opt.blurb && (
                        <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{opt.blurb}</span>
                      )}
                    </span>
                    <span className="flex-shrink-0 mt-0.5">
                      {locked ? (
                        <span className="text-[10px] text-[rgba(123,92,240,0.7)]">{opt.minPlan}</span>
                      ) : opt.cost}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
