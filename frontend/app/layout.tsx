import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'GhostLine', template: '%s · GhostLine' },
  description: 'Ваш AI-дух. Думает. Создаёт. Исчезает в тишине.',
  keywords: ['AI', 'chat', 'GPT', 'Claude', 'GhostLine', 'нейросеть'],
  authors: [{ name: 'GhostLine Team' }],
  openGraph: {
    title: 'GhostLine — AI для всего',
    description: 'Думает. Создаёт. Исчезает в тишине.',
    siteName: 'GhostLine',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#06060B',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className="antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
