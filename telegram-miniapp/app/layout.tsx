
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';

// Шрифт самохостится в сборке (next/font) — без внешнего запроса к Google Fonts,
// который раньше блокировал применение всего globals.css (в т.ч. Tailwind-классов)
// до своей загрузки и делал первый экран мини-аппа "голым" на медленной сети.
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'GhostLine',
  description: 'Ваш AI-дух в Telegram',
};

export const viewport: Viewport = {
  themeColor: '#0A0A12',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={inter.variable}>
      <head>
        {/* Инициализация темы и шрифта — выполняется до отрисовки, чтобы не было мигания */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';var f=localStorage.getItem('fontSize')||'medium';var cl=document.documentElement.classList;cl.remove('light','dark');cl.add(t);cl.remove('font-small','font-medium','font-large');if(f!=='medium')cl.add('font-'+f);}catch(e){}})();` }} />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
