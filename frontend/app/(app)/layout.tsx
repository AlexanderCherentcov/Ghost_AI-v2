import type { Metadata } from 'next';
import { AppLayoutClient } from './AppLayoutClient';

// Весь раздел (app) требует авторизации (/chat, /billing, /profile, /history,
// /settings) — уже закрыт от сканирования в robots.txt, но это только запрет
// на обход, не на индексацию: если где-то есть внешняя ссылка, поисковик мог
// показать URL с title/robots лендинга (наследовались от app/layout.tsx,
// index:true). Явный noindex здесь — defense-in-depth поверх robots.txt.
// Сама страница — клиентский компонент (AppLayoutClient, ниже) не может
// экспортировать metadata, поэтому она вынесена в этот серверный layout.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppLayoutClient>{children}</AppLayoutClient>;
}
