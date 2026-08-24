'use client';

import { useEffect, useRef, useState } from 'react';
import { ParticleAvatar } from '@/components/ParticleAvatar';
import { modelParticleShape } from '@/lib/model-icons';

/**
 * Аватар ассистента на каждом сообщении — живое particle-облако, а не статичная иконка.
 * Так и было в утверждённом мокапе (Chat.dc.html: canvas на КАЖДОМ сообщении, не только
 * в hero/typing-индикаторе) — этот компонент как раз восстанавливает то расхождение.
 *
 * Анимация идёт только пока сообщение видно во вьюпорте (IntersectionObserver) — в длинной
 * истории иначе были бы десятки параллельных requestAnimationFrame-луп навсегда. Тот же
 * приём, что у HeroVideoBackground на лендинге (пауза видео вне вьюпорта).
 */
export function MessageAvatar({ size = 30, modelId }: { size?: number; modelId?: string | null }) {
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

  // Форма — по модели, которая реально ответила на ЭТО сообщение (Message.provider),
  // а не общая "думающая" анимация: modelParticleShape уже сама падает на мозг
  // (FALLBACK_PARTICLE_SHAPE), если у модели нет своего лого-ассета.
  const shape = modelId ? modelParticleShape(modelId) : undefined;

  return (
    <div ref={ref} className="flex-shrink-0" style={{ width: size, height: size }}>
      {visible && <ParticleAvatar size={size} spinSpeed={0.006} shape={shape} />}
    </div>
  );
}
