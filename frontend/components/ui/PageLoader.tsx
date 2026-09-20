'use client';

import { useEffect, useState } from 'react';
import { ParticleAvatar } from '@/components/ParticleAvatar';
import { PARTICLE_CYCLE, PARTICLE_CYCLE_SHAPES } from '@/lib/model-icons';
import { cn } from '@/lib/utils';

const STAGE_MS = 1100;
const TRANS_MS = 600;
const AVATAR_SIZE = 96;

interface PageLoaderProps {
  /** true — на весь экран (вход, онбординг); false — внутри области контента рядом с сайдбаром. */
  fullscreen?: boolean;
  label?: string;
}

/**
 * Единый экран загрузки между страницами: фирменная particle-анимация морфится между
 * лого моделей, а подпись под надписью «Загрузка» меняется синхронно с формой.
 * Оба таймера стартуют при монтировании и делят один STAGE_MS, поэтому не расходятся,
 * даже если облако точек догружается лениво (~900 КБ) уже после появления надписи.
 */
export function PageLoader({ fullscreen = true, label = 'Загрузка' }: PageLoaderProps) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    // Без движения не листаем названия — ParticleAvatar в этом режиме тоже стоит на одной форме.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % PARTICLE_CYCLE.length), STAGE_MS);
    return () => clearInterval(id);
  }, []);

  const current = PARTICLE_CYCLE[idx];

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-5 text-center',
        fullscreen ? 'min-h-screen bg-[var(--bg-void)]' : 'h-full min-h-[50vh]',
      )}
    >
      <div className="relative" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
        {/* Свечение видно сразу, пока облако точек ещё подгружается. */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full blur-2xl opacity-60 animate-pulse"
          style={{ background: 'radial-gradient(circle, rgba(123,92,240,.45), transparent 70%)' }}
        />
        <ParticleAvatar
          size={AVATAR_SIZE}
          cycleShapes={PARTICLE_CYCLE_SHAPES}
          stageMs={STAGE_MS}
          transMs={TRANS_MS}
          spinSpeed={0.008}
          className="relative"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-[rgba(255,255,255,0.8)]">
          {label}
          <span aria-hidden className="inline-flex ml-0.5">
            {[0, 1, 2].map((n) => (
              <span key={n} className="animate-pulse" style={{ animationDelay: `${n * 200}ms` }}>.</span>
            ))}
          </span>
        </p>
        {/* CSS-keyframe fadeIn вместо framer-motion: не зависит от JS-кадров, поэтому
            название не залипает невидимым, если вкладка/устройство троттлит анимации. */}
        <div className="h-5 mt-1">
          <span
            key={current.label}
            className="block text-xs font-semibold tracking-wide"
            style={{ color: '#a78bfa', animation: 'fadeIn 0.35s ease-out both' }}
          >
            {current.label}
          </span>
        </div>
      </div>
    </div>
  );
}
