import type { Metadata } from 'next';

// login/page.tsx — клиентский компонент (интерактивная форма), метаданные
// экспортировать оттуда нельзя — выносим в соседний server-компонент layout.
// Раньше title/description были общими на /login и /register (заданы один раз
// в app/(auth)/layout.tsx) — теперь у каждой страницы свой текст.
export const metadata: Metadata = {
  title: 'Войти',
  description: 'Войдите в GhostLine через Telegram, Google или Яндекс — доступ к GPT-4o, Claude, Gemini и другим нейросетям без VPN.',
  robots: { index: true, follow: false },
  openGraph: {
    title: 'Войти — GhostLine',
    description: 'Войдите в GhostLine через Telegram, Google или Яндекс.',
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
