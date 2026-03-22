'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

const STEPS = 4;

function ProgressDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: STEPS }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === current ? 'w-6 bg-accent' : i < current ? 'w-6 bg-accent/40' : 'w-6 bg-[rgba(255,255,255,0.1)]'
          }`}
        />
      ))}
    </div>
  );
}

export default function OnboardingNamePage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleNext() {
    if (!name.trim() || loading) return;
    setLoading(true);
    const user = await api.auth.updateMe({ name: name.trim() });
    setUser(user);
    router.push('/onboarding/birthdate');
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="w-full max-w-md"
    >
      <ProgressDots current={0} />

      <h1 className="text-3xl font-medium text-white mb-2">Как вас зовут?</h1>
      <p className="text-sm text-[rgba(255,255,255,0.3)] mb-8">GhostLine запомнит. Навсегда.</p>

      <input
        className="input-ghost mb-6"
        placeholder="Ваше имя или псевдоним"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleNext()}
        autoFocus
      />

      <button
        onClick={handleNext}
        disabled={!name.trim() || loading}
        className="w-full btn btn-primary h-12 text-base disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Сохранение...' : 'Далее →'}
      </button>
    </motion.div>
  );
}
