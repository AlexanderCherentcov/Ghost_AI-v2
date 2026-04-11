import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { Providers } from './providers';

// ─── Canonical domain ──────────────────────────────────────────────────────────
const BASE_URL = 'https://ghostlineai.ru';
const TITLE    = 'GhostLine — Ваш AI-дух';
const TAGLINE  = 'Думает. Создаёт. Исчезает в тишине.';
const DESC     =
  'GhostLine — многорежимный AI-ассистент нового поколения. ' +
  'Умные диалоги, генерация изображений, музыки и видео. ' +
  'Использует самые передовые разработки в области искусственного интеллекта. ' +
  'Начните бесплатно — 50 000 токенов в подарок.';

// ─── Metadata ──────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: TITLE,
    template: '%s · GhostLine',
  },

  description: DESC,

  keywords: [
    'AI ассистент', 'нейросеть', 'искусственный интеллект онлайн',
    'GhostLine', 'чат с нейросетью', 'AI чат бесплатно',
    'генерация изображений нейросеть', 'генерация музыки AI',
    'умный ассистент', 'AI для бизнеса', 'AI для работы',
    'генерация текста нейросеть', 'нейросеть онлайн бесплатно',
    'мультимодальный AI', 'AI платформа',
  ],

  authors: [{ name: 'GhostLine Team', url: BASE_URL }],
  creator: 'GhostLine',
  publisher: 'GhostLine',
  category: 'technology',

  // ── Canonical ─────────────────────────────────────────────────────────────
  alternates: {
    canonical: BASE_URL,
    languages: { 'ru-RU': BASE_URL },
  },

  // ── Icons (App Router auto-detects app/icon.svg + app/apple-icon.svg) ─────
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.svg',
    apple: [
      { url: '/apple-icon.svg', sizes: '180x180', type: 'image/svg+xml' },
    ],
  },

  // ── Open Graph ────────────────────────────────────────────────────────────
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: BASE_URL,
    siteName: 'GhostLine',
    title: TITLE,
    description: TAGLINE,
    images: [
      {
        url: `${BASE_URL}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: 'GhostLine — AI-ассистент нового поколения',
        type: 'image/png',
      },
    ],
  },

  // ── Twitter / X Card ──────────────────────────────────────────────────────
  twitter: {
    card: 'summary_large_image',
    site: '@ghostlineai',
    creator: '@ghostlineai',
    title: TITLE,
    description: TAGLINE,
    images: [`${BASE_URL}/opengraph-image`],
  },

  // ── Robots ────────────────────────────────────────────────────────────────
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // ── Verification (add keys from Search Console when available) ─────────────
  // verification: { google: 'YOUR_KEY' },
};

// ─── Viewport ─────────────────────────────────────────────────────────────────
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#7B5CF0' },
    { media: '(prefers-color-scheme: light)', color: '#7B5CF0' },
  ],
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1, // prevent iOS zoom on input focus
};

// ─── JSON-LD Structured Data ──────────────────────────────────────────────────
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${BASE_URL}/#organization`,
      name: 'GhostLine',
      url: BASE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_URL}/icon.svg`,
        width: 512,
        height: 512,
      },
      sameAs: ['https://t.me/ghostlineai'],
    },
    {
      '@type': 'WebSite',
      '@id': `${BASE_URL}/#website`,
      url: BASE_URL,
      name: 'GhostLine',
      description: DESC,
      publisher: { '@id': `${BASE_URL}/#organization` },
      inLanguage: 'ru-RU',
    },
    {
      '@type': 'WebApplication',
      '@id': `${BASE_URL}/#app`,
      name: 'GhostLine',
      url: BASE_URL,
      description: DESC,
      applicationCategory: 'ProductivityApplication',
      operatingSystem: 'Web',
      inLanguage: 'ru-RU',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'RUB',
        description: '10 сообщений/день бесплатно',
      },
      featureList: [
        'AI-диалоги',
        'Генерация изображений',
        'Генерация музыки',
        'Генерация видео',
        'Режим глубокого мышления',
      ],
    },
  ],
};

// ─── Root Layout ──────────────────────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <head>
        {/* Theme + font init — runs before paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';var f=localStorage.getItem('fontSize')||'medium';var cl=document.documentElement.classList;cl.remove('light','dark');cl.add(t);cl.remove('font-small','font-medium','font-large');if(f!=='medium')cl.add('font-'+f);}catch(e){}})();` }} />
        {/* Preserve OAuth callback hash before Next.js App Router hydration strips it via history.replaceState */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(window.location.pathname.startsWith('/auth/callback')&&window.location.hash){sessionStorage.setItem('_oauthHash',window.location.hash);}}catch(e){}})();` }} />
        {/* JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Preconnect to Google Fonts (already in CSS) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
