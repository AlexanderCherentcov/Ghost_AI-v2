'use client';

export const runtime = 'edge';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TelegramProvider, useTg } from '@/components/TelegramProvider';
import { useMainButton } from '@/hooks/useMainButton';
import { useBackButton } from '@/hooks/useBackButton';
import { apiRequest } from '@/lib/auth';

const PURPOSES = [
  'Работа', 'Тексты', 'Код', 'Обучение',
  'Творчество', 'Картинки', 'Музыка', 'Видео', 'Просто поговорить',
];

function PurposeForm() {
  const router = useRouter();
  const tg = useTg();
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useBackButton(() => router.back());

  async function handleNext() {
    setLoading(true);
    await apiRequest('/me', { method: 'PATCH', body: JSON.stringify({ purposes: selected, onboardingDone: true }) });
    router.push('/chat');
  }

  function toggle(p: string) {
    tg?.HapticFeedback.selectionChanged();
    setSelected((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  useMainButton({ text: 'Начать', onClick: handleNext, isVisible: selected.length > 0, isLoading: loading });

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A12] px-5 pt-10">
      <div className="flex gap-2 mb-8">
        {[0,1,2].map((i) => (
          <div key={i} className="h-1.5 rounded-full" style={{ width: 24, background: i === 1 ? '#7B5CF0' : i < 1 ? 'rgba(123,92,240,0.4)' : 'rgba(255,255,255,0.1)' }} />
        ))}
      </div>

      <h1 className="text-2xl font-medium text-white mb-2">Для чего используете?</h1>
      <p className="text-sm text-[rgba(255,255,255,0.3)] mb-6">Выберите несколько.</p>

      <div className="flex flex-wrap gap-2 pb-24">
        {PURPOSES.map((p) => {
          const active = selected.includes(p);
          return (
            <button
              key={p}
              onClick={() => toggle(p)}
              className="px-4 py-2 rounded-2xl text-sm border transition-all"
              style={{
                borderColor: active ? '#7B5CF0' : 'rgba(255,255,255,0.1)',
                background: active ? 'rgba(123,92,240,0.12)' : 'transparent',
                color: active ? '#7B5CF0' : 'rgba(255,255,255,0.5)',
              }}
            >
              {p}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TgOnboardingPurposePage() {
  return <TelegramProvider><PurposeForm /></TelegramProvider>;
}
