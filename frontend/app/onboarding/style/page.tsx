'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

const STYLES = [
  {
    id: 'ghost',
    name: 'Призрачный',
    desc: 'Лаконично, загадочно, с долей поэтики. Без лишних слов.',
    preview: 'Чёрная дыра — точка, где пространство сворачивается в молчание. Гравитация побеждает свет.',
  },
  {
    id: 'expert',
    name: 'Экспертный',
    desc: 'Детально, структурировано, с техническими подробностями.',
    preview: 'Чёрная дыра — область пространства-времени с настолько сильной гравитацией, что даже фотоны не могут покинуть её горизонт событий.',
  },
  {
    id: 'friendly',
    name: 'Дружелюбный',
    desc: 'Просто, понятно, как объяснял бы умный друг.',
    preview: 'Представь: огромная звезда умерла и сжалась в точку. Теперь её притяжение такое сильное, что свет не может сбежать. Вот и вся чёрная дыра!',
  },
  {
    id: 'strict',
    name: 'Строгий',
    desc: 'Без воды, только факты и выводы.',
    preview: 'Чёрная дыра: область с гравитацией выше 2-й космической скорости для фотонов. Характеристики: горизонт событий, сингулярность.',
  },
  {
    id: 'creative',
    name: 'Творческий',
    desc: 'С метафорами, образами и нестандартными углами.',
    preview: 'Чёрная дыра — это вселенский вздох, где время замирает и всё известное теряет смысл. Последний танец материи перед её превращением в загадку.',
  },
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

export default function OnboardingStylePage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [selected, setSelected] = useState('ghost');
  const [loading, setLoading] = useState(false);

  async function handleFinish() {
    setLoading(true);
    const user = await api.auth.updateMe({ responseStyle: selected, onboardingDone: true });
    setUser(user);
    router.push('/chat');
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full max-w-lg">
      <ProgressDots current={3} />

      <h1 className="text-3xl font-medium text-white mb-2">Как GhostLine должен отвечать?</h1>
      <p className="text-sm text-[rgba(255,255,255,0.3)] mb-8">Выберите стиль. Его можно изменить в настройках.</p>

      <div className="space-y-3 mb-8">
        {STYLES.map((s) => {
          const active = selected === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={cn(
                'w-full text-left p-4 rounded-xl border transition-all',
                active
                  ? 'border-accent bg-[var(--accent-dim)] shadow-[0_0_20px_var(--accent-glow)]'
                  : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--border-hover)]'
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn('font-medium text-sm', active ? 'text-accent' : 'text-white')}>
                  {s.name}
                </span>
                {active && <span className="text-xs text-accent">✓</span>}
              </div>
              <p className="text-xs text-[rgba(255,255,255,0.3)] mb-2">{s.desc}</p>
              <p className="text-xs text-[rgba(255,255,255,0.5)] italic border-l-2 border-[var(--border)] pl-3">
                «{s.preview}»
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button onClick={() => router.back()} className="btn btn-ghost h-12 flex-1">← Назад</button>
        <button
          onClick={handleFinish}
          disabled={loading}
          className="btn btn-primary h-12 flex-[2] disabled:opacity-40"
        >
          {loading ? 'Сохранение...' : 'Начать работу'}
        </button>
      </div>
    </motion.div>
  );
}
