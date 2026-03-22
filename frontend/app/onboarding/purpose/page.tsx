'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

const PURPOSES = [
  'Работа и продуктивность',
  'Написание текстов',
  'Программирование',
  'Обучение и исследования',
  'Творчество и искусство',
  'Генерация изображений',
  'Музыка и аудио',
  'Личные проекты',
  'Просто поговорить',
];

function ProgressDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? 'w-6 bg-accent' : i < current ? 'w-6 bg-accent/40' : 'w-6 bg-[rgba(255,255,255,0.1)]'}`} />
      ))}
    </div>
  );
}

export default function OnboardingPurposePage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  function toggle(p: string) {
    setSelected((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  async function handleNext() {
    setLoading(true);
    try {
      const user = await api.auth.updateMe({ purposes: selected });
      setUser(user);
    } catch {}
    router.push('/onboarding/style');
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full max-w-md">
      <ProgressDots current={2} />

      <h1 className="text-3xl font-medium text-white mb-2">Для чего используете?</h1>
      <p className="text-sm text-[rgba(255,255,255,0.3)] mb-8">Выберите всё, что подходит.</p>

      <div className="flex flex-wrap gap-2 mb-8">
        {PURPOSES.map((p) => {
          const active = selected.includes(p);
          return (
            <button
              key={p}
              onClick={() => toggle(p)}
              className={cn(
                'px-4 py-2 rounded-2xl text-sm border transition-all',
                active
                  ? 'border-accent bg-[var(--accent-dim)] text-accent'
                  : 'border-[var(--border)] text-[rgba(255,255,255,0.4)] hover:border-[var(--border-hover)] hover:text-white'
              )}
            >
              {p}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button onClick={() => router.back()} className="btn btn-ghost h-12 flex-1">← Назад</button>
        <button
          onClick={handleNext}
          disabled={loading}
          className="btn btn-primary h-12 flex-1 disabled:opacity-40"
        >
          {loading ? 'Сохранение...' : 'Далее →'}
        </button>
      </div>
    </motion.div>
  );
}
