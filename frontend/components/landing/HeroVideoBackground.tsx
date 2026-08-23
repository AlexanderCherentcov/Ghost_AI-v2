'use client';

import { useEffect, useRef, useState } from 'react';

// Полноэкранный фон hero. На десктопе — видео (только при "быстром" соединении,
// иначе лишний трафик и просадка производительности — ту же проблему в этой сессии
// уже решали для canvas с частицами). На мобильных — статичное изображение вместо
// видео вообще (по прямому решению Александра: жёстко по типу устройства, не по
// скорости соединения — так же делает Webflow, у них это надёжнее navigator.connection,
// которого нет в Safari/Firefox). Если файла нет/не загрузился — тихо ничего не
// рендерим, hero остаётся как был (частицы + виньетка из ParticleBrainField), без
// сломанного/пустого блока.
//
// ЗАГЛУШКА: реальных /hero-video.mp4 и /hero-poster.jpg пока нет в public —
// Александр подберёт и пришлёт. До этого компонент рендерит null (404 → onError).
const VIDEO_SRC = '/hero-video.mp4';
const POSTER_SRC = '/hero-poster.jpg';
// Граница "мобильный/десктоп" — та же, что у остального адаптива на странице (Tailwind md:).
const MOBILE_BREAKPOINT = 768;

function isSlowConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Network Information API — есть только в Chromium (Safari/Firefox её не поддерживают),
  // поэтому это доп. подстраховка на десктопе, а не единственная защита от тяжёлого видео.
  const conn = (navigator as any).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return ['slow-2g', '2g', '3g'].includes(conn.effectiveType);
}

type Mode = 'loading' | 'video' | 'image' | 'off';

// Затемнение поверх видео/изображения — тот же принцип, что у глобальной виньетки
// ParticleBrainField, но сильнее: у реального контента обычно больше контраста/цвета,
// чем у приглушённых частиц, тексту нужно больше защиты.
function Overlay() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(circle at 50% 34%, rgba(5,3,17,.5) 0%, rgba(5,3,17,.8) 55%, rgba(5,3,17,.97) 100%),' +
          'linear-gradient(90deg, rgba(5,3,17,.94) 0%, rgba(5,3,17,.8) 32%, rgba(5,3,17,.5) 58%, rgba(5,3,17,.5) 100%)',
      }}
    />
  );
}

export function HeroVideoBackground() {
  const [mode, setMode] = useState<Mode>('loading');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    if (isMobile) {
      setMode('image');
      return;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || isSlowConnection()) {
      setMode('off');
      return;
    }
    setMode('video');
  }, []);

  // Пауза, когда hero уходит из viewport (например, при скролле вниз по странице) —
  // подсмотрено у Webflow (у них это сделано через тот же IntersectionObserver).
  // Экономит CPU/батарею на длинной странице, где видео всё равно никто не видит.
  useEffect(() => {
    const el = videoRef.current;
    if (mode !== 'video' || !el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode]);

  if (mode === 'off' || mode === 'loading') return null;

  if (mode === 'image') {
    return (
      <>
        <img
          src={POSTER_SRC}
          alt=""
          onError={() => setMode('off')}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <Overlay />
      </>
    );
  }

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        poster={POSTER_SRC}
        onError={() => setMode('off')}
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src={VIDEO_SRC} type="video/mp4" />
      </video>
      <Overlay />
    </>
  );
}
