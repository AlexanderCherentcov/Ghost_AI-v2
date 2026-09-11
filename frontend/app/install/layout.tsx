import type { Metadata } from 'next';

// install/page.tsx — клиентский компонент, см. комментарий в gallery/layout.tsx.
export const metadata: Metadata = {
  title: 'Установить приложение',
  description: 'Установите GhostLine как приложение на iPhone, Android или компьютер — быстрый доступ без браузера.',
  robots: { index: true, follow: true },
};

export default function InstallLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
