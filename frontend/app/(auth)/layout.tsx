import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Войти — GhostLine',
  description: 'Войдите в GhostLine через Telegram, Google или Яндекс. Бесплатно — 50 000 токенов сразу после регистрации.',
  robots: { index: true, follow: false },
  openGraph: {
    title: 'Войти — GhostLine',
    description: 'Войдите в GhostLine через Telegram, Google или Яндекс.',
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
