import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from './providers';

// next/font/google самохостит шрифты в сборке (файлы выкладываются рядом со
// статикой сайта) — раньше подключались через @import в globals.css к
// fonts.googleapis.com: лишний внешний DNS/TLS/HTTP-роундтрип на критическом
// пути рендера у каждого пользователя (~450мс цепочка, 224КБ трафика).
// cyrillic — сайт русскоязычный, кириллица нужна в основном шрифте интерфейса
// (Inter) и в моноширинном (JetBrains Mono, код/технический текст могут быть
// на русском в комментариях). У Space Grotesk на Google Fonts нет кириллицы —
// она и не нужна: используется только в var(--font-display) для h1-h3, где
// сама CSS font-family уже даёт fallback на Inter для кириллических символов.
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

// ─── Канонический домен ─────────────────────────────────────────────────────
const BASE_URL = 'https://ghostlineai.ru';
const TITLE    = 'GhostLine — все нейросети в одном чате, без VPN';
const TAGLINE  = 'Думает. Создаёт. Работает из России.';

// Метаданные (title/description/JSON-LD) генерируются здесь статически, в
// отрыве от React-рендера и без доступа к backend/src/config/plans.ts (другой
// npm-проект) — сеть на этапе сборки дёргать рискованно (сборка фронтенда и
// бэкенда идут отдельными шагами в CI). Поэтому единственное число, что
// видят пользователи в этом файле, объявлено здесь один раз — при смене
// дневного лимита бесплатного чата в plans.ts (FREE_LIMITS.chat_daily)
// поправить и эту константу. 2026-08-25: приветственный бонус Caspers отменён
// (см. FREE_WELCOME_CASPERS в plans.ts) — эта копия больше не про бонус.
const FREE_CHAT_DAILY_LIMIT = 10;

const DESC =
  'GhostLine объединяет GPT-4o, Claude, Gemini, DeepSeek, Perplexity, Kling, Veo, Sora ' +
  'и Suno в одном аккаунте — без VPN, без сложной регистрации и отдельных подписок на ' +
  'каждый сервис. Диалоги, генерация изображений, видео и музыки в одном чате. ' +
  `Бесплатный чат — до ${FREE_CHAT_DAILY_LIMIT} сообщений в день, без карты.`;

// ─── Метаданные ──────────────────────────────────────────────────────────────
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
    'нейросети без VPN', 'все нейросети в одном месте', 'ChatGPT без VPN',
    'Claude без VPN', 'GPT-4o на русском', 'Kling видео нейросеть',
    'Sora видео', 'Suno музыка нейросеть', 'генерация видео из текста',
    'генерация изображений нейросеть', 'генерация музыки AI',
    'умный ассистент', 'AI для бизнеса', 'AI для работы',
    'генерация текста нейросеть', 'нейросеть онлайн бесплатно',
    'мультимодальный AI', 'AI платформа', 'нейросети для России',
  ],

  authors: [{ name: 'GhostLine Team', url: BASE_URL }],
  creator: 'GhostLine',
  publisher: 'GhostLine',
  category: 'technology',

  // ── Канонический URL ─────────────────────────────────────────────────────
  alternates: {
    canonical: BASE_URL,
    languages: { 'ru-RU': BASE_URL },
  },

  // ── Иконки (App Router сам находит app/icon.png + app/apple-icon.png) ────
  // Реальный логотип GhostLine (капюшон, светящиеся глаза) — тот же файл, что уже
  // используется в сайдбаре/лендинге/AuthShell, раньше фавикон был старым placeholder'ом.
  icons: {
    icon: [
      { url: '/ghostline-logo-icon.png', type: 'image/png' },
    ],
    shortcut: '/ghostline-logo-icon.png',
    apple: [
      { url: '/ghostline-logo-icon.png', sizes: '180x180', type: 'image/png' },
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

  // ── Роботы ────────────────────────────────────────────────────────────────
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

  // ── Верификация (добавить ключи из Search Console, когда появятся) ────────
  // verification: { google: 'YOUR_KEY' },
};

// ─── Viewport ────────────────────────────────────────────────────────────────
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#7B5CF0' },
    { media: '(prefers-color-scheme: light)', color: '#7B5CF0' },
  ],
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // Зум на iOS при фокусе уже решён через fontSize:16px на текстовых полях —
  // блокировать maximumScale не нужно, это ломает pinch-to-zoom слабовидящим (WCAG 1.4.4).
  viewportFit: 'cover', // включает safe-area-inset-* для чёлки/индикатора home на iOS
};

// ─── JSON-LD структурированные данные ─────────────────────────────────────────
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
        url: `${BASE_URL}/ghostline-logo-icon.png`,
        width: 670,
        height: 670,
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
        description: `Бесплатный чат — до ${FREE_CHAT_DAILY_LIMIT} сообщений в день`,
      },
      featureList: [
        'AI-диалоги с выбором модели',
        'Генерация изображений',
        'Генерация видео',
        'Генерация музыки',
        'Голосовой чат',
      ],
    },
  ],
};

// ─── Корневой layout ─────────────────────────────────────────────────────────
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={`dark ${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Инициализация темы и шрифта — выполняется до отрисовки, чтобы не было мигания */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme')||'dark';var f=localStorage.getItem('fontSize')||'medium';var cl=document.documentElement.classList;cl.remove('light','dark');cl.add(t);cl.remove('font-small','font-medium','font-large');if(f!=='medium')cl.add('font-'+f);}catch(e){}})();` }} />
        {/* Сохраняем хэш OAuth-колбэка — в глобальную переменную window И в sessionStorage.
            window.__oauthHash переживает переключения browsing-context при COOP, которые стирают sessionStorage. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{if(window.location.pathname.startsWith('/auth/callback')&&window.location.hash){var h=window.location.hash;window.__oauthHash=h;try{sessionStorage.setItem('_oauthHash',h);}catch(e){}}}catch(e){}})();` }} />
        {/* JSON-LD разметка */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Preconnect к Google Fonts убран — шрифты теперь самохостятся через
            next/font/google (см. импорты выше), в runtime нет ни одного запроса
            к fonts.googleapis.com/fonts.gstatic.com. */}
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
