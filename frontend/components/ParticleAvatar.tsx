'use client';

import { useEffect, useRef } from 'react';
import { FALLBACK_PARTICLE_SHAPE } from '@/lib/model-icons';
import type { LogoPointCloud } from '@/lib/particle-logos-data';

/**
 * Частичное (particle) облако точек, которое морфится между лого-формами — фирменная
 * анимация редизайна (см. Chat.dc.html/GhostLine.dc.html). Данные форм грузятся один раз
 * лениво (общий модуль ~900KB), дальше держатся в памяти процесса.
 */
let logosPromise: Promise<Record<string, LogoPointCloud>> | null = null;
function loadLogos(): Promise<Record<string, LogoPointCloud>> {
  if (!logosPromise) {
    logosPromise = import('@/lib/particle-logos-data').then((m) => m.LOGOS);
  }
  return logosPromise;
}

function smooth(u: number): number {
  return u * u * (3 - 2 * u);
}

interface Morph {
  from: string;
  to: string;
  mixT: number;
}

/** Циклический морф по списку форм — используется как индикатор «думаю» и для авто-режима. */
export function cycleMorph(seq: string[], stageMs: number, transMs: number, now: number): Morph {
  const loopDur = stageMs * seq.length;
  const t = now % loopDur;
  const idx = Math.floor(t / stageMs);
  const local = t % stageMs;
  const cur = seq[idx];
  const prev = seq[(idx - 1 + seq.length) % seq.length];
  if (local < transMs) return { from: prev, to: cur, mixT: smooth(local / transMs) };
  return { from: cur, to: cur, mixT: 0 };
}

export interface ParticleAvatarProps {
  /** Ключ формы из particle-logos-data (см. lib/model-icons.ts:modelParticleShape). */
  shape?: string;
  /** Если задано — вместо статичной формы циклически перебирает список (индикатор загрузки/«Авто»). */
  cycleShapes?: string[];
  size: number;
  className?: string;
  /** 0..1 — громкость микрофона в реальном времени (VoiceWidget). Раздувает/ускоряет форму под голос. */
  reactiveLevel?: number;
  /** Скорость вращения, рад/кадр. По умолчанию — медленный фирменный дрейф. */
  spinSpeed?: number;
  /** Длительность показа одной формы в cycleShapes, мс. Мокап: 900 — «думаю», 4000 — простой hero. */
  stageMs?: number;
  /** Длительность перехода между формами, мс. Мокап: 500 — «думаю», 1200 — простой hero. */
  transMs?: number;
}

export function ParticleAvatar({
  shape = FALLBACK_PARTICLE_SHAPE,
  cycleShapes,
  size,
  className,
  reactiveLevel = 0,
  spinSpeed = 0.012,
  stageMs = 900,
  transMs = 500,
}: ParticleAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reactiveRef = useRef(reactiveLevel);
  reactiveRef.current = reactiveLevel;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    let cancelled = false;
    let raf = 0;
    let logos: Record<string, LogoPointCloud> | null = null;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    el.width = size * DPR;
    el.height = size * DPR;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    let angle = Math.random() * Math.PI * 2;
    const start = performance.now();

    loadLogos().then((l) => {
      if (!cancelled) logos = l;
    });

    const draw = (t: number) => {
      if (cancelled) return;
      const w = el.width, h = el.height;
      ctx.clearRect(0, 0, w, h);

      if (logos) {
        const level = reactiveRef.current;
        angle += spinSpeed * (1 + level * 2.2);

        const morph: Morph = cycleShapes && cycleShapes.length > 0
          ? cycleMorph(cycleShapes, stageMs, transMs, t - start)
          : { from: shape, to: shape, mixT: 0 };

        const a = logos[morph.from] || logos[FALLBACK_PARTICLE_SHAPE];
        const b = logos[morph.to] || a;
        if (a && b) {
          const cosA = Math.cos(angle), sinA = Math.sin(angle);
          const cx = w / 2, cy = h / 2;
          const R = Math.min(w, h) * (0.42 + level * 0.08);
          const len = Math.min(a.length, b.length);
          const count = Math.min(len, Math.max(200, Math.floor((w * h) / 60)));
          const stepI = Math.max(1, Math.floor(len / count));
          for (let i = 0; i < len; i += stepI) {
            const pa = a[i], pb = b[i];
            const mt = morph.mixT;
            const x = pa[0] + (pb[0] - pa[0]) * mt;
            const y = pa[1] + (pb[1] - pa[1]) * mt;
            const z = pa[2] + (pb[2] - pa[2]) * mt;
            const rx = x * cosA - z * sinA;
            const rz = x * sinA + z * cosA;
            const spread = 1 + level * 0.35;
            const sx = cx + rx * R * spread;
            const sy = cy + y * R * spread;
            const d = Math.max(0, Math.min(1, (rz + 1) / 2));
            const hue = pa[3] + (pb[3] - pa[3]) * mt;
            const sat = pa[4] + (pb[4] - pa[4]) * mt;
            const light = pa[5] + (pb[5] - pa[5]) * mt;
            const satBoost = Math.min(100, sat * 1.35 + 15);
            ctx.beginPath();
            ctx.fillStyle = `hsla(${hue},${satBoost}%,${light}%,${0.6 + 0.4 * d})`;
            ctx.arc(sx, sy, (0.9 + 1.0 * d + level * 0.6) * DPR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, cycleShapes?.join(','), size, stageMs, transMs]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size, display: 'block' }}
    />
  );
}
