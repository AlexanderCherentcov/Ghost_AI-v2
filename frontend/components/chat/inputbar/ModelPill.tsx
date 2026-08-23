'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CasperCoin } from '@/components/icons';
import { cn, planAtLeast } from '@/lib/utils';
import { api, type ChatModelOption } from '@/lib/api';
import { modelIcon } from '@/lib/model-icons';

// Иконка модели в белом чипе — большинство SVG-лого брендов (claude/deepseek/perplexity —
// однотонная заливка, sora/kling — используют белый в градиенте) нечитаемы на тёмной
// панели дропдауна без подложки; мокап (Chat.dc.html, am.hasLogo) явно кладёт их на
// белый фон с небольшим скруглением. «Авто» — по прямому указанию Александра тоже мозг
// (GhostLine думает сам), тот же чёрный SVG и та же белая подложка, что у остальных
// моделей без собственного лого — без подложки чёрная заливка была бы не видна на тёмном фоне.
export function ModelIcon({ id, size }: { id: string; size: number }) {
  return (
    <span
      className="rounded-sm bg-white flex items-center justify-center flex-shrink-0 overflow-hidden"
      style={{ width: size, height: size }}
    >
      <img src={modelIcon(id)} alt="" className="w-full h-full object-contain" style={{ padding: 1 }} />
    </span>
  );
}

// Пилюля выбора модели чата — реальный список с бэкенда (GET /plans → models.chat),
// «Авто» первым пунктом. Раньше здесь было два фиктивных пункта «Стандарт/Про»,
// выбор которых ни на что не влиял — preferredModel игнорировался диспетчером.
export function ModelPill({
  model, setModel, userPlan, onUpgradeRequired,
}: {
  model: string;
  setModel: (id: string) => void;
  userPlan?: string;
  onUpgradeRequired?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ChatModelOption[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // llama-3.1-fast — бесплатная модель для «Авто», не показываем её отдельным
    // именованным пунктом в списке выбора (не модель для явного выбора, а внутренний
    // вариант диспетчера).
    api.payments.plans()
      .then((data) => setOptions(data.models.chat.filter((m) => m.id !== 'llama-3.1-fast')))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = options.find((o) => o.id === model) ?? options.find((o) => o.id === 'auto');

  function costLabel(opt: ChatModelOption): React.ReactNode {
    if (opt.id === 'auto') {
      // «Авто» подбирает модель динамически — cost с бэкенда это МИНИМУМ
      // (AUTO_MIN_COST), а не фикс. цена, поэтому «от N», а не голое число.
      return (
        <span className="flex items-center gap-0.5 text-[10px] ml-1 opacity-70" style={{ color: 'var(--accent)' }}>
          от {opt.cost}<CasperCoin size={10} />
        </span>
      );
    }
    if (opt.cost === 0) return null; // бесплатная модель — без бейджа
    // Платные модели чата списывают Caspers на всех тарифах одинаково — без
    // бесплатной дневной квоты и исключений даже для ULTRA.
    return (
      <span className="flex items-center gap-0.5 text-[10px] ml-1" style={{ color: 'var(--accent)' }}>
        {opt.cost}<CasperCoin size={10} />
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-1.5 px-3 py-[7px] rounded-[9px] border text-[13px] font-semibold transition-all hover:border-[var(--accent-border)] flex-shrink-0 min-w-0 w-full sm:w-auto"
        style={{ background: 'var(--panel-glass)', borderColor: 'rgba(148,163,184,.2)', color: 'var(--text-primary)' }}
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <ModelIcon id={current?.id ?? 'auto'} size={14} />
          {/* truncate вместо переноса — длинное имя модели ("GPT-4o mini") без max-width
              переносилось на 2-3 строки и ломало высоту пилюли. Пилюля теперь на мобильном
              стоит на своей отдельной строке тулбара (не делит ряд с кнопкой отправки),
              поэтому ширина здесь щедрее, чем раньше. */}
          <span className="truncate max-w-[110px] sm:max-w-[160px]">{current?.label ?? 'GhostLine'}</span>
          {/* Цена/статус — пилюля теперь на своей строке, места хватает и на мобильном,
              прятать больше незачем. */}
          {current && <span className="flex flex-shrink-0 whitespace-nowrap">{costLabel(current)}</span>}
        </span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className="flex-shrink-0">
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
            className="absolute bottom-full mb-2 left-0 z-50 rounded-xl overflow-hidden shadow-xl"
            style={{
              minWidth: '210px', maxHeight: '360px', overflowY: 'auto',
              background: 'var(--panel-glass-sidebar)', border: '1px solid var(--panel-glass-border)', WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)',
            }}
          >
            {options.map((opt) => {
              const locked = !planAtLeast(userPlan, opt.minPlan) && opt.id !== 'auto';
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (locked) { onUpgradeRequired?.(); setOpen(false); return; }
                    setModel(opt.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-[12px] transition-colors flex items-center gap-2 justify-between hover:bg-[var(--accent-dim)]',
                    model === opt.id ? 'text-accent' : ''
                  )}
                  style={model !== opt.id ? { color: 'var(--text-primary)' } : {}}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <ModelIcon id={opt.id} size={16} />
                    <span className="flex flex-col min-w-0 leading-tight">
                      <span className="truncate">{opt.label}</span>
                      {/* Подпись бренда под именем модели — так пользователь видит, что это
                          реально Anthropic/OpenAI/Google, а не наша обёртка (см. GPTunneL). */}
                      {opt.blurb && (
                        <span className="truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>{opt.blurb}</span>
                      )}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    {locked ? (
                      <span className="text-[10px] text-[rgba(123,92,240,0.7)]">{opt.minPlan}</span>
                    ) : costLabel(opt)}
                    {model === opt.id && (
                      <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M3.5 10.5l5 5L17 6"/>
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
