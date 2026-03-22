'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

function ProgressDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? 'w-6 bg-accent' : i < current ? 'w-6 bg-accent/40' : 'w-6 bg-[rgba(255,255,255,0.1)]'}`} />
      ))}
    </div>
  );
}

export default function OnboardingBirthdatePage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [dd, setDd] = useState('');
  const [mm, setMm] = useState('');
  const [yyyy, setYyyy] = useState('');
  const [loading, setLoading] = useState(false);

  const isValid = dd.length === 2 && mm.length === 2 && yyyy.length === 4;

  async function handleNext() {
    if (!isValid || loading) return;
    setLoading(true);
    try {
      const birthDate = `${yyyy}-${mm}-${dd}`;
      const user = await api.auth.updateMe({ birthDate });
      setUser(user);
    } catch {}
    router.push('/onboarding/purpose');
  }

  return (
    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full max-w-md">
      <ProgressDots current={1} />

      <h1 className="text-3xl font-medium text-white mb-2">Ваша дата рождения?</h1>
      <p className="text-sm text-[rgba(255,255,255,0.3)] mb-8">Мы используем её для персонализации.</p>

      <div className="flex items-center gap-3 mb-2">
        <input
          className="input-ghost text-center w-20"
          placeholder="ДД"
          maxLength={2}
          value={dd}
          onChange={(e) => setDd(e.target.value.replace(/\D/g, ''))}
        />
        <span className="text-[rgba(255,255,255,0.3)] text-lg">/</span>
        <input
          className="input-ghost text-center w-20"
          placeholder="ММ"
          maxLength={2}
          value={mm}
          onChange={(e) => setMm(e.target.value.replace(/\D/g, ''))}
        />
        <span className="text-[rgba(255,255,255,0.3)] text-lg">/</span>
        <input
          className="input-ghost text-center w-28"
          placeholder="ГГГГ"
          maxLength={4}
          value={yyyy}
          onChange={(e) => setYyyy(e.target.value.replace(/\D/g, ''))}
        />
      </div>
      <p className="text-xs text-[rgba(255,255,255,0.2)] mb-8">Не передаётся третьим лицам</p>

      <div className="flex gap-3">
        <button onClick={() => router.back()} className="btn btn-ghost h-12 flex-1">
          ← Назад
        </button>
        <button
          onClick={handleNext}
          disabled={!isValid || loading}
          className="btn btn-primary h-12 flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Сохранение...' : 'Далее →'}
        </button>
      </div>
      <button onClick={() => router.push('/onboarding/purpose')} className="w-full mt-3 text-sm text-[rgba(255,255,255,0.25)] hover:text-white text-center transition-colors">
        Пропустить
      </button>
    </motion.div>
  );
}
