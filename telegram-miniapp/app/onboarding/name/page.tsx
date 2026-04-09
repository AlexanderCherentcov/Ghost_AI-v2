'use client';

export const runtime = 'edge';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TelegramProvider } from '@/components/TelegramProvider';
import { useMainButton } from '@/hooks/useMainButton';
import { apiRequest } from '@/lib/auth';

function ProgressDots({ current }: { current: number }) {
  return (
    <div className="flex gap-2 mb-8">
      {[0,1,2].map((i) => (
        <div
          key={i}
          className="h-1.5 rounded-full transition-all"
          style={{
            width: 24,
            background: i === current ? '#7B5CF0' : i < current ? 'rgba(123,92,240,0.4)' : 'rgba(255,255,255,0.1)',
          }}
        />
      ))}
    </div>
  );
}

function NameForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleNext() {
    if (!name.trim() || loading) return;
    setLoading(true);
    await apiRequest('/me', { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) });
    router.push('/onboarding/purpose');
  }

  useMainButton({ text: 'Далее', onClick: handleNext, isVisible: name.trim().length > 0, isLoading: loading });

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A12] px-5 pt-10">
      <div className="text-center mb-8">
        <div className="text-5xl mb-4">👻</div>
        <span className="text-sm font-medium text-white">GhostLine</span>
      </div>

      <ProgressDots current={0} />

      <h1 className="text-2xl font-medium text-white mb-2">Как вас зовут?</h1>
      <p className="text-sm text-[rgba(255,255,255,0.3)] mb-6">GhostLine запомнит.</p>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ваше имя"
        autoFocus
        className="w-full h-12 px-4 text-sm"
        onKeyDown={(e) => e.key === 'Enter' && handleNext()}
      />
    </div>
  );
}

export default function TgOnboardingNamePage() {
  return <TelegramProvider><NameForm /></TelegramProvider>;
}
