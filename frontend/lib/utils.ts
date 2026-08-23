import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PLAN_ORDER = ['FREE', 'START', 'BASIC', 'PRO', 'PRO_PLUS', 'VIP', 'ULTRA'];

/** Сравнение тарифов по порядку (FREE < START < BASIC < PRO < PRO_PLUS < VIP < ULTRA) — единая логика гейтинга для UI. */
export function planAtLeast(userPlan: string | undefined, required: string): boolean {
  if (!userPlan) return false;
  return PLAN_ORDER.indexOf(userPlan) >= PLAN_ORDER.indexOf(required);
}

/** Полное число с разделителями тысяч, как принято в ru-RU (Caspers, рубли и т.п.) */
export function formatNumber(n: number): string {
  return n.toLocaleString('ru-RU');
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function relativeTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return formatDate(date);
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}

export function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}
