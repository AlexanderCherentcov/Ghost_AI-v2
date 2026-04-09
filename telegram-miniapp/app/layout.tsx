export const runtime = 'edge';

import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
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
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
