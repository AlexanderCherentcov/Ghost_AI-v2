import type { Metadata } from 'next';

// См. комментарий в login/layout.tsx — та же причина (register/page.tsx клиентский).
export const metadata: Metadata = {
  title: 'Регистрация',
  description: 'Зарегистрируйтесь в GhostLine — GPT-4o, Claude, Gemini, DeepSeek, Kling, Sora и другие нейросети в одном чате, без VPN.',
  robots: { index: true, follow: false },
  openGraph: {
    title: 'Регистрация — GhostLine',
    description: 'Создайте аккаунт GhostLine — доступ ко всем нейросетям в одном месте.',
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
