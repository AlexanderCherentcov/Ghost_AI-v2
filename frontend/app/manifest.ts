import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GhostLine',
    short_name: 'GhostLine',
    description: 'Ваш AI-дух. Думает. Создаёт. Исчезает в тишине.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#06060B',
    theme_color: '#7B5CF0',
    lang: 'ru',
    categories: ['productivity', 'utilities'],
    // Chrome/Edge не предложат автоматическую установку без ОБОИХ размеров 192x192
    // и 512x512 в манифесте (web.dev/articles/install-criteria) — раньше был только
    // 670x670, формально закрывающий оба порога по факту, но не по заявленному sizes.
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/ghostline-logo-icon.png',
        sizes: '670x670',
        type: 'image/png',
        // 'any', не 'maskable' — у лого контент близко к краям, ОС обрежет в круг
        // при maskable и потеряет капюшон/контур, безопасной зоны в самой картинке нет.
        purpose: 'any',
      },
      {
        src: '/ghostline-logo-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    // Явно запрещаем подсказывать связанное нативное приложение вместо PWA — у нас его нет.
    prefer_related_applications: false,
    shortcuts: [
      {
        name: 'Новый чат',
        short_name: 'Чат',
        description: 'Открыть новый диалог с AI',
        url: '/chat',
      },
    ],
  };
}
