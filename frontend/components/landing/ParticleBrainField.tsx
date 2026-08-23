'use client';

import { useEffect, useRef } from 'react';
import type { LogoPointCloud } from '@/lib/particle-logos-data';

/**
 * Порт `setCanvasRef` из GhostLine.dc.html: 2600 процедурных точек морфят
 * brain (шумная сфера, радужная заливка) -> bulb (лампочка) -> дальше бесконечный цикл
 * по лого AI-моделей.
 */
const LOOP = ['claude', 'chatgpt', 'gemini', 'deepseek', 'kling', 'sora', 'perplexity'];
const INTRO = 3000;
const STAGE = 15000;
const TRANS = 1800;
const N = 2600;

type Shape = [number, number, number, number, number, number]; // x,y,z,hue,sat,light

interface Pt {
  i: number;
  phase: number;
  r: number;
  shapes: Record<string, Shape>;
}

function smooth(u: number): number {
  return u * u * (3 - 2 * u);
}

function buildPoints(): Pt[] {
  const colorStops = [
    { t: 0, hue: 265, sat: 62 }, { t: 0.28, hue: 205, sat: 58 },
    { t: 0.55, hue: 42, sat: 78 }, { t: 0.76, hue: 0, sat: 6 }, { t: 1, hue: 265, sat: 62 },
  ];
  const sampleColor = (tRaw: number) => {
    const t = ((tRaw % 1) + 1) % 1;
    for (let k = 0; k < colorStops.length - 1; k++) {
      const a = colorStops[k], b = colorStops[k + 1];
      if (t >= a.t && t <= b.t) {
        const f = (t - a.t) / (b.t - a.t);
        return { hue: a.hue + (b.hue - a.hue) * f, sat: a.sat + (b.sat - a.sat) * f };
      }
    }
    return colorStops[0];
  };

  const pts: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const u = Math.random(), v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    let x = Math.sin(phi) * Math.cos(theta);
    let y = Math.cos(phi);
    let z = Math.sin(phi) * Math.sin(theta);
    const wrinkle = 1
      + 0.09 * Math.sin(5 * theta + 2 * phi)
      + 0.06 * Math.sin(9 * phi - 6 * theta)
      + 0.035 * Math.sin(14 * theta + 11 * phi + 2)
      + (Math.random() - 0.5) * 0.03;
    x *= wrinkle; y *= wrinkle; z *= wrinkle;
    const px = x * 1.18;
    let py = y * 0.88;
    const pz = z * 1.0;
    if (py < -0.5) py = -0.5 - (-0.5 - py) * 0.3;
    const field = (Math.sin(3 * theta + phi * 1.5) + Math.sin(phi * 4 - theta * 2) * 0.6 + Math.sin(theta * 1.3) * 0.4);
    const tField = (field + 2) / 4;
    const c = sampleColor(tField);
    const hue = c.hue + (Math.random() - 0.5) * 10;
    const sat = Math.max(0, c.sat + (Math.random() - 0.5) * 8);
    const fold = (wrinkle - 1) * 90;
    const light = sat < 12 ? Math.max(55, Math.min(98, 90 + fold * 0.6)) : Math.max(14, Math.min(88, 58 + fold));

    let blx: number, bly: number, blz: number;
    if (i % 30 === 0) {
      const f = (i % 300) / 300;
      const fa = f * Math.PI * 2 * 6;
      const fr = 0.12 + Math.sin(f * Math.PI * 3) * 0.015;
      blx = Math.cos(fa) * fr; blz = Math.sin(fa) * fr; bly = 0.55 - f * 0.85;
    } else {
      const s = phi / Math.PI;
      let rad;
      if (s < 0.5) rad = 0.32 + 0.68 * Math.sin((s / 0.5) * Math.PI / 2);
      else if (s < 0.72) { const k = (s - 0.5) / 0.22; rad = 1.0 * (1 - k) + 0.34 * k; }
      else rad = 0.32 + 0.03 * Math.sin(((s - 0.72) / 0.28) * Math.PI * 4);
      blx = Math.cos(theta) * rad; blz = Math.sin(theta) * rad; bly = 0.95 - s * 1.9;
    }

    pts.push({
      i, phase: Math.random() * Math.PI * 2, r: 1.1 + Math.random() * 1.7,
      shapes: {
        brain: [px, py, pz, hue, sat, light],
        bulb: [blx, bly, blz, hue, sat, light],
      },
    });
  }
  return pts;
}

let logosPromise: Promise<Record<string, LogoPointCloud>> | null = null;
function loadLogos(): Promise<Record<string, LogoPointCloud>> {
  if (!logosPromise) {
    logosPromise = import('@/lib/particle-logos-data').then((m) => m.LOGOS);
  }
  return logosPromise;
}

export function ParticleBrainField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    let cancelled = false;
    let raf = 0;
    let logosReady = false;
    let logos: Record<string, LogoPointCloud> | null = null;

    // Кап 1.5 вместо 2 — на HiDPI-мониторах (масштаб 150-200% в Windows) canvas
    // на полный экран с DPR=2 означает физический буфер вплоть до 4K, а на нём каждый
    // кадр 2600 arc()+fill() — заметная нагрузка при скролле. На глаз разница в чёткости
    // точек незаметна, а пикселей для отрисовки на треть-половину меньше.
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    const ctx = el.getContext('2d');
    if (!ctx) return;

    // maxScroll кэшируется и пересчитывается только при resize — читать
    // document.documentElement.scrollHeight на каждое scroll-событие (их десятки в
    // секунду) форсирует синхронный layout у браузера и подвешивает скролл.
    let maxScroll = 0;
    // Высота hero (#hero, полноэкранная секция с видео-фоном) — поле частиц/лого не
    // должно быть видно поверх видео, по прямому указанию Александра появляется только
    // начиная со следующей секции, плавным fade-in на границе.
    let heroH = 0;
    const fit = () => {
      const w = window.innerWidth, h = window.innerHeight;
      el.width = w * DPR; el.height = h * DPR;
      maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      heroH = document.getElementById('hero')?.offsetHeight ?? window.innerHeight;
    };
    fit();
    window.addEventListener('resize', fit);

    let scrollP = 0;
    let fadeP = 0;
    const FADE_ZONE = 240; // px скролла после hero, за которые поле частиц полностью проявляется

    const pts = buildPoints();
    // Переиспользуемые буферы — без них каждый кадр аллоцировался массив из N объектов
    // + sort по свойству объекта, что на 60fps даёт заметную нагрузку на GC (подвисания при скролле).
    const rxBuf = new Float32Array(N);
    const ryBuf = new Float32Array(N);
    const rzBuf = new Float32Array(N);
    const hueBuf = new Float32Array(N);
    const satBuf = new Float32Array(N);
    const lightBuf = new Float32Array(N);
    const order: number[] = new Array(N);
    for (let i = 0; i < N; i++) order[i] = i;

    loadLogos().then((l) => {
      if (cancelled) return;
      for (const p of pts) {
        for (const name of Object.keys(l)) {
          const arr = l[name];
          p.shapes[name] = arr[p.i % arr.length] as unknown as Shape;
        }
      }
      // фирменная иконка мозга заменяет процедурную форму brain для стадии "мозг" — как в мокапе
      if (l.brainicon) {
        for (const p of pts) p.shapes.brain = l.brainicon[p.i % l.brainicon.length] as unknown as Shape;
      }
      logos = l;
      logosReady = true;
    });

    let angle = 0;
    const start = performance.now();
    let lastDrawT = 0;
    const FRAME_BUDGET_MS = 33; // ~30fps — для медленного фонового дрейфа хватает, вдвое снижает нагрузку на CPU при скролле

    const draw = (t: number) => {
      if (cancelled) return;
      if (t - lastDrawT < FRAME_BUDGET_MS) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastDrawT = t;
      const w = el.width, h = el.height;
      ctx.clearRect(0, 0, w, h);

      // Пока не проскроллили hero — поле невидимо (там свой фон-видео), проявляется
      // плавно на границе со следующей секцией.
      const fadeTarget = Math.max(0, Math.min(1, (window.scrollY - heroH) / FADE_ZONE));
      fadeP += (fadeTarget - fadeP) * 0.12;
      if (fadeP < 0.004) {
        raf = requestAnimationFrame(draw);
        return;
      }
      ctx.globalAlpha = fadeP;

      const scrollTarget = maxScroll > 0 ? Math.max(0, Math.min(1, window.scrollY / maxScroll)) : 0;
      scrollP += (scrollTarget - scrollP) * 0.06;
      const sp = scrollP || 0;
      const wide = window.innerWidth > 860;
      const heroX = wide ? 0.66 : 0.5;
      const drift = Math.sin(t * 0.00035) * 0.05;
      const minX = wide ? 0.5 : 0.22;
      const cx = w * Math.max(minX, Math.min(0.78, heroX - sp * (wide ? 0.16 : 0.18) + drift));
      const cy = h / 2 * 0.98 + Math.sin(t * 0.00028) * h * 0.025;
      const R = Math.min(w, h) * (wide ? 0.34 : 0.4);

      angle += 0.0038;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);

      const elapsed = t - start;
      let fromName: string, toName: string, mixT: number;
      if (elapsed < INTRO) { fromName = toName = 'brain'; mixT = 0; }
      else if (elapsed < INTRO * 2) {
        const local = elapsed - INTRO;
        if (local < TRANS) { fromName = 'brain'; toName = 'bulb'; mixT = smooth(local / TRANS); }
        else { fromName = toName = 'bulb'; mixT = 0; }
      } else {
        const loopDur = STAGE * LOOP.length;
        const since = elapsed - INTRO * 2;
        const loopT = since % loopDur;
        const idx = Math.floor(loopT / STAGE);
        const local = loopT % STAGE;
        const curName = LOOP[idx];
        const prevName = since < STAGE ? 'bulb' : LOOP[(idx - 1 + LOOP.length) % LOOP.length];
        if (local < TRANS) { fromName = prevName; toName = curName; mixT = smooth(local / TRANS); }
        else { fromName = toName = curName; mixT = 0; }
      }
      const introOnly = (toName === 'brain' || toName === 'bulb') && (fromName === 'brain' || fromName === 'bulb');
      const ready = introOnly || logosReady;

      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const a = p.shapes[fromName] || p.shapes.brain;
        const b = ready ? (p.shapes[toName] || p.shapes.brain) : a;
        const mx = a[0] + (b[0] - a[0]) * mixT;
        const my = a[1] + (b[1] - a[1]) * mixT;
        const mz = a[2] + (b[2] - a[2]) * mixT;
        rxBuf[i] = mx * cosA - mz * sinA;
        rzBuf[i] = mx * sinA + mz * cosA;
        ryBuf[i] = my + Math.sin(t * 0.0007 + p.phase) * 0.015;
        hueBuf[i] = a[3] + (b[3] - a[3]) * mixT;
        satBuf[i] = a[4] + (b[4] - a[4]) * mixT;
        lightBuf[i] = a[5] + (b[5] - a[5]) * mixT;
      }
      order.sort((ia, ib) => rzBuf[ia] - rzBuf[ib]);

      const paint = (pctx: CanvasRenderingContext2D, CX: number, CY: number, RR: number) => {
        for (let k = 0; k < N; k++) {
          const i = order[k];
          const rz = rzBuf[i];
          const d = Math.max(0, Math.min(1, (rz + 1.3) / 2.6));
          const tw = 0.75 + 0.25 * Math.sin(t * 0.0018 + pts[i].phase);
          const alpha = Math.max(0.35, Math.min(1, tw)) * (0.6 + 0.4 * d);
          if (alpha <= 0.01) continue;
          pctx.beginPath();
          pctx.fillStyle = `hsla(${hueBuf[i]},${satBuf[i]}%,${lightBuf[i]}%,${alpha})`;
          const rad = pts[i].r * DPR * (0.6 + 0.6 * d);
          pctx.arc(CX + rxBuf[i] * RR, CY + ryBuf[i] * RR, rad, 0, Math.PI * 2);
          pctx.fill();
        }
      };
      paint(ctx, cx, cy, R);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ width: '100vw', height: '100vh', transform: 'translateZ(0)', willChange: 'transform' }}
    />
  );
}
