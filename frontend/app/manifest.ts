import type { MetadataRoute } from 'next';

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
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon.svg',
        sizes: '180x180',
        type: 'image/svg+xml',
      },
    ],
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
