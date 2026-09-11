import type { Metadata } from 'next';

// gallery/page.tsx — клиентский компонент, metadata сюда не экспортировать —
// раньше страница наследовала title/description лендинга целиком (дубль в выдаче).
export const metadata: Metadata = {
  title: 'Галерея работ',
  description: 'Изображения, видео и музыка, созданные нейросетями GhostLine — реальные примеры генераций пользователей.',
  robots: { index: true, follow: true },
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
