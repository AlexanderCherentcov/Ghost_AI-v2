'use client';

import { useEffect, useRef, useState } from 'react';
import { ParticleAvatar } from '@/components/ParticleAvatar';

/**
 * Аватар ассистента на каждом сообщении — живое particle-облако, а не статичная иконка.
 * Так и было в утверждённом мокапе (Chat.dc.html: canvas на КАЖДОМ сообщении, не только
 * в hero/typing-индикаторе) — этот компонент как раз восстанавливает то расхождение.
 *
 * Анимация идёт только пока сообщение видно во вьюпорте (IntersectionObserver) — в длинной
 * истории иначе были бы десятки параллельных requestAnimationFrame-луп навсегда. Тот же
 * приём, что у HeroVideoBackground на лендинге (пауза видео вне вьюпорта).
 */
export function MessageAvatar({ size = 30 }: { size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '200px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex-shrink-0" style={{ width: size, height: size }}>
      {visible && <ParticleAvatar size={size} spinSpeed={0.006} />}
    </div>
  );
}
