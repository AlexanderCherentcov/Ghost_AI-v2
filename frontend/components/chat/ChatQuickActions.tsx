'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VisionIcon, SoundIcon, ReelIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

export type QuickMode = 'image-create' | 'image-edit' | null;

interface Props {
  onSelect: (mode: QuickMode) => void;
  activeMode: QuickMode;
}

export function ChatQuickActions({ onSelect, activeMode }: Props) {
  const [imageMenuOpen, setImageMenuOpen] = useState(false);

  function handleImageAction(mode: QuickMode) {
    onSelect(mode);
    setImageMenuOpen(false);
  }

  return (
    <div className="flex items-center gap-2 px-4 pb-2 max-w-[720px] mx-auto w-full relative">

      {/* Создать картинку */}
      <div className="relative">
        <button
          onClick={() => setImageMenuOpen((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all',
            activeMode?.startsWith('image')
              ? 'border-[#5C8CF0] bg-[rgba(92,140,240,0.12)] text-[#5C8CF0]'
              : 'border-[var(--border)] text-[rgba(255,255,255,0.4)] hover:border-[rgba(255,255,255,0.25)] hover:text-[rgba(255,255,255,0.7)]'
          )}
        >
          <VisionIcon size={13} />
          Изображения
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={cn('transition-transform', imageMenuOpen && 'rotate-180')}>
            <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <AnimatePresence>
          {imageMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full mb-2 left-0 z-50 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-1 w-48 shadow-xl"
            >
              <button
                onClick={() => handleImageAction('image-create')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[rgba(255,255,255,0.8)] hover:bg-[rgba(255,255,255,0.06)] transition-colors text-left"
              >
                <span className="text-base">✨</span>
                <div>
                  <div className="text-xs font-medium">Создать картинку</div>
                  <div className="text-[11px] text-[rgba(255,255,255,0.3)]">По описанию · 10 токенов</div>
                </div>
              </button>
              <button
                onClick={() => handleImageAction('image-edit')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[rgba(255,255,255,0.8)] hover:bg-[rgba(255,255,255,0.06)] transition-colors text-left"
              >
                <span className="text-base">🎨</span>
                <div>
                  <div className="text-xs font-medium">Изменить фото</div>
                  <div className="text-[11px] text-[rgba(255,255,255,0.3)]">Загрузите фото + стиль</div>
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Музыка — в разработке */}
      <button
        title="Скоро!"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-[var(--border)] text-[rgba(255,255,255,0.25)] cursor-not-allowed relative group"
      >
        <SoundIcon size={13} />
        Музыка
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[var(--bg-elevated)] border border-[var(--border)] text-[10px] text-[rgba(255,255,255,0.5)] px-2 py-0.5 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          В разработке
        </span>
      </button>

      {/* Видео — в разработке */}
      <button
        title="Скоро!"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-[var(--border)] text-[rgba(255,255,255,0.25)] cursor-not-allowed relative group"
      >
        <ReelIcon size={13} />
        Видео
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[var(--bg-elevated)] border border-[var(--border)] text-[10px] text-[rgba(255,255,255,0.5)] px-2 py-0.5 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          В разработке
        </span>
      </button>

      {/* Clear active mode */}
      <AnimatePresence>
        {activeMode && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => onSelect(null)}
            className="ml-auto text-[rgba(255,255,255,0.3)] hover:text-white transition-colors text-xs flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Обычный чат
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
