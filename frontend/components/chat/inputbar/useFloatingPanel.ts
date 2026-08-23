'use client';

import { useState, useRef, useCallback, useLayoutEffect, useEffect } from 'react';

export interface FloatingPanelRect {
  left: number;
  top: number;
  bottom: number;
  maxHeight: number;
  direction: 'up' | 'down';
}

// Общая механика выпадающих списков выбора модели (ModelPill/ModelSelect) — портал
// в document.body + позиционирование по rect триггера с учётом реально доступного
// места на экране. Раньше maxHeight был фиксирован (360px) независимо от того,
// сколько места есть до края экрана — на длинных списках (14 видео-моделей,
// 9+ чат-моделей) панель вылезала за viewport, и часть пунктов (порой вместе с
// рамкой) была физически недостижима никаким скроллом (overflow-y:auto скроллит
// содержимое СВОЕЙ коробки, а не то, что видно на экране — если сама коробка
// вылезает за границу viewport, эта её часть не появится ни при каком скролле).
// Теперь считаем место в обе стороны от триггера и открываем туда, где его больше
// (не только когда предпочтительная сторона совсем впритык — триггеры внизу
// композера часто имеют "прилично, но недостаточно" места вниз и в разы больше вверх).
export function useFloatingPanel(open: boolean, preferredDirection: 'up' | 'down') {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<FloatingPanelRect | null>(null);

  const updateRect = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 12;
    const spaceAbove = r.top - margin;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const preferred = preferredDirection === 'up' ? spaceAbove : spaceBelow;
    const other = preferredDirection === 'up' ? spaceBelow : spaceAbove;
    const direction = other > preferred ? (preferredDirection === 'up' ? 'down' : 'up') : preferredDirection;
    const available = direction === 'up' ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(120, Math.min(360, available));
    setRect({ left: r.left, top: r.top, bottom: r.bottom, maxHeight, direction });
  }, [preferredDirection]);

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

  return { triggerRef, panelRef, rect };
}
