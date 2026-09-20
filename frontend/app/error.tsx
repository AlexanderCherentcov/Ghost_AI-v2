'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[App error]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex flex-col items-center justify-center px-6 text-center gap-5">
      <h1 className="font-display text-3xl font-semibold text-white">Что-то пошло не так</h1>
      <p className="text-sm max-w-sm" style={{ color: 'var(--text-secondary)' }}>
        Страница не загрузилась. Попробуйте обновить — обычно этого достаточно. Если ошибка повторяется, напишите нам в Telegram.
      </p>
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <button onClick={reset} className="btn btn-primary h-11 px-6">Обновить</button>
        <Link href="/" className="btn btn-ghost h-11 px-6">На главную</Link>
      </div>
      <a href="https://t.me/ghostlineai" target="_blank" rel="noopener noreferrer" className="text-xs text-[#c4b5fd] hover:opacity-80">
        Написать в поддержку
      </a>
    </div>
  );
}
