'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { VideoOptions, VideoModel } from './InputBar';

interface VideoSettingsMenuProps {
  options: VideoOptions;
  onChange: (opts: VideoOptions) => void;
}

export function VideoSettingsMenu({ options, onChange }: VideoSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasCustomSettings =
    options.videoModel === 'pro' ||
    options.resolution === '1080p' ||
    (options.negativePrompt ?? '').trim().length > 0;

  const models: { key: VideoModel; label: string; sub: string }[] = [
    { key: 'standard', label: 'GhostLine Standard', sub: 'Быстро · Veo3 Fast' },
    { key: 'pro',      label: 'GhostLine Pro',      sub: 'Высокое качество · Veo3' },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-1 px-2 h-7 rounded-md transition-all relative',
          open
            ? 'bg-[var(--accent-dim)] text-accent'
            : 'hover:bg-[var(--bg-elevated)] opacity-40 hover:opacity-80'
        )}
        style={!open ? { color: 'var(--text-primary)' } : {}}
        title="Настройки видео"
        aria-label="Настройки видео"
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M1.5 4h12M1.5 7.5h12M1.5 11h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          <circle cx="5" cy="4" r="1.6" fill="var(--bg-input)" stroke="currentColor" strokeWidth="1.2"/>
          <circle cx="10" cy="7.5" r="1.6" fill="var(--bg-input)" stroke="currentColor" strokeWidth="1.2"/>
          <circle cx="6" cy="11" r="1.6" fill="var(--bg-input)" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
        <span className="text-[11px] font-medium">Настройки</span>
        {hasCustomSettings && (
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: '#7B5CF0' }} />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-2 z-50 rounded-2xl overflow-hidden"
            style={{
              width: 300,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>Настройки видео</span>
              <button type="button" onClick={() => setOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-void)] transition-colors opacity-40 hover:opacity-80"
                style={{ color: 'var(--text-primary)' }} aria-label="Закрыть">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* ── Model ── */}
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <span className="text-[10px] font-semibold uppercase tracking-widest block mb-2.5" style={{ color: 'var(--text-muted)' }}>
                Модель
              </span>
              <div className="flex flex-col gap-1.5">
                {models.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => onChange({ ...options, videoModel: m.key })}
                    className={cn(
                      'flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all border',
                      options.videoModel === m.key
                        ? 'bg-[var(--accent-dim)] border-[var(--accent-border)]'
                        : 'border-[var(--border)] hover:bg-[var(--bg-void)] opacity-60 hover:opacity-100'
                    )}
                  >
                    <div>
                      <div className="text-[12px] font-medium" style={{ color: options.videoModel === m.key ? 'var(--accent)' : 'var(--text-primary)' }}>
                        {m.label}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{m.sub}</div>
                    </div>
                    {options.videoModel === m.key && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7l4 4 6-6" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Resolution ── */}
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <span className="text-[10px] font-semibold uppercase tracking-widest block mb-2" style={{ color: 'var(--text-muted)' }}>
                Разрешение
              </span>
              <div className="flex gap-2">
                {(['720p', '1080p'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onChange({ ...options, resolution: r })}
                    className={cn(
                      'flex-1 py-2 rounded-xl text-[12px] font-medium transition-all border',
                      options.resolution === r
                        ? 'bg-[var(--accent-dim)] text-accent border-[var(--accent-border)]'
                        : 'border-[var(--border)] hover:bg-[var(--bg-void)] opacity-50 hover:opacity-80'
                    )}
                    style={options.resolution !== r ? { color: 'var(--text-primary)' } : {}}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Negative prompt ── */}
            <div className="px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest block mb-2" style={{ color: 'var(--text-muted)' }}>
                Исключить из видео
              </span>
              <textarea
                value={options.negativePrompt ?? ''}
                onChange={(e) => onChange({ ...options, negativePrompt: e.target.value })}
                placeholder="размытость, плохое качество, водяной знак..."
                rows={2}
                className="w-full rounded-xl px-3 py-2 text-[12px] outline-none resize-none transition-colors placeholder:opacity-30"
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-border)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
