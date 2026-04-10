'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { VideoOptions, CameraPreset } from './InputBar';

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        className="w-4 h-4 rounded-full flex items-center justify-center transition-colors opacity-30 hover:opacity-70"
        style={{ color: 'var(--text-primary)' }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        tabIndex={-1}
        aria-label="Подсказка"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M6.5 5.5c0-.55.45-1 1-1s1 .45 1 1-.45 1-1 1H6.5v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <circle cx="6.5" cy="9" r="0.6" fill="currentColor"/>
        </svg>
      </button>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[200] pointer-events-none"
            style={{ width: 200 }}
          >
            <div
              className="px-3 py-2 rounded-xl text-[11px] leading-relaxed"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)',
                color: 'var(--text-secondary)',
              }}
            >
              {text}
            </div>
            {/* Arrow */}
            <div
              className="mx-auto"
              style={{
                width: 0, height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '5px solid var(--bg-elevated)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Camera presets ───────────────────────────────────────────────────────────

const CAMERA_PRESETS: {
  key: CameraPreset;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    key: 'static',
    label: 'Статично',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="4.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M11 7l3-2v6l-3-2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        <circle cx="6" cy="8" r="1.5" fill="currentColor"/>
      </svg>
    ),
  },
  {
    key: 'zoom_in',
    label: 'Приближение',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    key: 'zoom_out',
    label: 'Отдаление',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M5 7h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    key: 'pan_left',
    label: 'Влево',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M10 8H3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M6 5l-3 3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13 4v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.35"/>
      </svg>
    ),
  },
  {
    key: 'pan_right',
    label: 'Вправо',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M6 8h7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 4v8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.35"/>
      </svg>
    ),
  },
  {
    key: 'tilt_up',
    label: 'Вверх',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 12V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M5 8l3-3 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 13.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.35"/>
      </svg>
    ),
  },
  {
    key: 'tilt_down',
    label: 'Вниз',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 4v7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M5 8l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 2.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.35"/>
      </svg>
    ),
  },
  {
    key: 'orbit',
    label: 'Облёт',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <ellipse cx="8" cy="8" rx="6" ry="3" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M8 5v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0.35"/>
        <path d="M11.5 6.2l1 1.8-1.8.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

// ─── Main component ───────────────────────────────────────────────────────────

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
    options.cameraPreset !== 'static' ||
    (options.negativePrompt ?? '').trim().length > 0 ||
    Math.abs((options.cfgScale ?? 0.5) - 0.5) > 0.05;

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
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
        {/* Sliders / tune icon */}
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M1.5 4h12M1.5 7.5h12M1.5 11h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          <circle cx="5" cy="4" r="1.6" fill="var(--bg-input)" stroke="currentColor" strokeWidth="1.2"/>
          <circle cx="10" cy="7.5" r="1.6" fill="var(--bg-input)" stroke="currentColor" strokeWidth="1.2"/>
          <circle cx="6" cy="11" r="1.6" fill="var(--bg-input)" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
        <span className="text-[11px] font-medium">Настройки</span>
        {/* Active indicator dot */}
        {hasCustomSettings && (
          <span
            className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
            style={{ background: '#7B5CF0' }}
          />
        )}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full right-0 mb-2 z-50 rounded-2xl overflow-hidden"
            style={{
              width: 280,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>Настройки видео</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[var(--bg-void)] transition-colors opacity-40 hover:opacity-80"
                style={{ color: 'var(--text-primary)' }}
                aria-label="Закрыть"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* ── Camera presets ── */}
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-1.5 mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Движение камеры
                </span>
                <Tip text="Как камера будет двигаться во время съёмки. «Статично» — без движения, объект в фокусе." />
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {CAMERA_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => onChange({ ...options, cameraPreset: preset.key })}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl text-[10px] leading-none transition-all border',
                      options.cameraPreset === preset.key
                        ? 'bg-[var(--accent-dim)] text-accent border-[var(--accent-border)]'
                        : 'border-transparent hover:bg-[var(--bg-void)] opacity-50 hover:opacity-80'
                    )}
                    style={options.cameraPreset !== preset.key ? { color: 'var(--text-primary)' } : {}}
                  >
                    {preset.icon}
                    <span className="text-center leading-tight">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Negative prompt ── */}
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Исключить из видео
                </span>
                <Tip text="Опишите то, чего не должно быть в видео. Например: размытость, дым, текст, люди на фоне." />
              </div>
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

            {/* ── cfg_scale ── */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                    Точность
                  </span>
                  <Tip text="Насколько строго итоговое видео следует вашему описанию. Ближе к «Свободно» — больше творчества, ближе к «Точно» — строже по тексту." />
                </div>
                <span className="text-[11px] tabular-nums" style={{ color: 'rgba(123,92,240,0.9)' }}>
                  {Math.round((options.cfgScale ?? 0.5) * 100)}%
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round((options.cfgScale ?? 0.5) * 100)}
                onChange={(e) => onChange({ ...options, cfgScale: parseInt(e.target.value) / 100 })}
                className="w-full cursor-pointer"
                style={{
                  accentColor: '#7B5CF0',
                  height: '4px',
                }}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Свободно</span>
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Точно</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
