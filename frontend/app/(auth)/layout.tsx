import type { Metadata } from 'next';

// См. app/layout.tsx — то же самое ограничение (SEO-метаданные без доступа к
// backend/src/config/plans.ts), поэтому число здесь тоже нужно поправить вручную
// при изменении приветственного бонуса.
const FREE_WELCOME_CASPERS = 100;

export const metadata: Metadata = {
  title: 'Войти — GhostLine',
  description: `Войдите в GhostLine через Telegram, Google или Яндекс. Бесплатно — ${FREE_WELCOME_CASPERS} Caspers сразу после регистрации.`,
  robots: { index: true, follow: false },
  openGraph: {
    title: 'Войти — GhostLine',
    description: 'Войдите в GhostLine через Telegram, Google или Яндекс.',
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
