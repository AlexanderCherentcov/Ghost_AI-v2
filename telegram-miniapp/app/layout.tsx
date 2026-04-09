
import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';

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
    <html lang="ru">
      <head>
        {/* Theme + font init — runs before paint to prevent flash */}
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
