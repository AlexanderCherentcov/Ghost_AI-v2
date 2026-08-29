'use client';

import type { CSSProperties } from 'react';

export { GhostIcon } from './GhostIcon';
export { AppleIcon, AndroidIcon, WindowsIcon } from './PlatformIcons';

// ─── Общая база ──────────────────────────────────────────────────────────────

interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

const base = (size: number, className: string, style?: CSSProperties) => ({
  width: size,
  height: size,
  viewBox: '0 0 20 20',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  style,
});

// ─── Chat ─────────────────────────────────────────────────────────────────────
/** Речевой пузырь с тремя точками набора текста */
export function ChatIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M3.5 5A1.5 1.5 0 015 3.5h10A1.5 1.5 0 0116.5 5v6A1.5 1.5 0 0115 12.5H8.8L5.5 15v-2.5H5A1.5 1.5 0 013.5 11V5z" />
      <circle cx="7.5" cy="8" r=".8" fill="currentColor" stroke="none" />
      <circle cx="10" cy="8" r=".8" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── Vision / Глаз ────────────────────────────────────────────────────────────
/** Глаз с бликом на зрачке — для генерации изображений */
export function VisionIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M2 10c2-4.5 4.5-6.5 8-6.5S16 5.5 18 10c-2 4.5-4.5 6.5-8 6.5S4 14.5 2 10z" />
      <circle cx="10" cy="10" r="2.5" />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── Sound / Динамик ──────────────────────────────────────────────────────────
/** Динамик с двумя звуковыми волнами */
export function SoundIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M3.5 7.5h2.8L10.5 5v10L6.3 12.5H3.5a.5.5 0 01-.5-.5V8a.5.5 0 01.5-.5z" strokeLinejoin="round" />
      <path d="M13 7.5a3.5 3.5 0 010 5" />
      <path d="M15.5 5.5a6.5 6.5 0 010 9" />
    </svg>
  );
}

// ─── Reel / Play ─────────────────────────────────────────────────────────────
/** Залитая кнопка play в круге — для истории видео */
export function ReelIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <circle cx="10" cy="10" r="8" />
      <path d="M8 7.5l5.5 2.5L8 12.5V7.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── Think / Лампочка ────────────────────────────────────────────────────────
/** Лампочка со свечением нити накала — для режима pro/think */
export function ThinkIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M10 2a5 5 0 014 8l.5 2.5H5.5L6 10a5 5 0 014-8z" />
      <line x1="8" y1="14.5" x2="12" y2="14.5" />
      <line x1="8.5" y1="16.5" x2="11.5" y2="16.5" />
    </svg>
  );
}

// ─── Token / Кристалл ────────────────────────────────────────────────────────
/** Шестигранный кристалл — для статистики использования токенов / Caspers */
export function TokenIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M10 2L17 6v8L10 18 3 14V6L10 2z" />
      <path d="M3 6l7 4.5L17 6" />
      <line x1="10" y1="10.5" x2="10" y2="18" />
    </svg>
  );
}

// ─── Plus ─────────────────────────────────────────────────────────────────────
export function PlusIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <line x1="10" y1="4" x2="10" y2="16" />
      <line x1="4" y1="10" x2="16" y2="10" />
    </svg>
  );
}

// ─── Moon / Тёмная тема ─────────────────────────────────────────────────────
export function MoonIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// ─── Sun / Светлая тема ─────────────────────────────────────────────────────
export function SunIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

// ─── Send / Бумажный самолётик ─────────────────────────────────────────────────
/** Бумажный самолётик — основное действие отправки */
export function SendIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M17.5 2.5L2.5 9.5l6 2.5 2.5 6 6.5-15.5z" strokeLinejoin="round" />
      <line x1="8.5" y1="12" x2="17.5" y2="2.5" />
    </svg>
  );
}

// ─── Settings / Шестерёнка ───────────────────────────────────────────────────
export function SettingsIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// ─── User / Человек ──────────────────────────────────────────────────────────
export function UserIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <circle cx="10" cy="7.5" r="3.5" />
      <path d="M3 18a7 7 0 0114 0" />
    </svg>
  );
}

// ─── Trash / Корзина ─────────────────────────────────────────────────────────
export function TrashIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <line x1="3.5" y1="6" x2="16.5" y2="6" />
      <path d="M8.5 6V4.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5V6" />
      <path d="M5.5 6l1 11h7l1-11H5.5z" />
      <line x1="8.5" y1="9.5" x2="8.5" y2="13.5" />
      <line x1="11.5" y1="9.5" x2="11.5" y2="13.5" />
    </svg>
  );
}

// ─── Edit / Карандаш ─────────────────────────────────────────────────────────
export function EditIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M14 3.5l2.5 2.5L7.5 14.5l-4 1 1-4L14 3.5z" />
      <line x1="12" y1="5.5" x2="14.5" y2="8" />
    </svg>
  );
}

// ─── Copy / Копировать ───────────────────────────────────────────────────────
export function CopyIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <rect x="7.5" y="7" width="9" height="10.5" rx="1.5" />
      <path d="M14.5 7V5A1.5 1.5 0 0013 3.5H5A1.5 1.5 0 003.5 5v8A1.5 1.5 0 005 14.5h2.5" />
    </svg>
  );
}

// ─── Sparkle / Звезда ────────────────────────────────────────────────────────
/** 4-лучевая искрящаяся звезда */
export function SparkleIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M10 2L11.8 8.2 18 10l-6.2 1.8L10 18l-1.8-6.2L2 10l6.2-1.8L10 2z" />
    </svg>
  );
}

// ─── Attach / Скрепка ────────────────────────────────────────────────────────
export function AttachIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M17.5 9.5L9 18A5 5 0 012 11L10.5 2.5A3 3 0 0115 6.5L6.5 15a1 1 0 01-1.5-1.5L13.5 5" />
    </svg>
  );
}

// ─── Menu / Меню ─────────────────────────────────────────────────────────────
export function MenuIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <line x1="3" y1="6" x2="17" y2="6" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="14" x2="17" y2="14" />
    </svg>
  );
}

// ─── Chevron вниз ────────────────────────────────────────────────────────────
export function ChevronDownIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M5 8.5l5 5 5-5" />
    </svg>
  );
}

// ─── X / Закрыть ─────────────────────────────────────────────────────────────
export function XIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <line x1="4.5" y1="4.5" x2="15.5" y2="15.5" />
      <line x1="15.5" y1="4.5" x2="4.5" y2="15.5" />
    </svg>
  );
}

// ─── Check / Галочка ─────────────────────────────────────────────────────────
export function CheckIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M3.5 10.5l5 5L17 6" />
    </svg>
  );
}

// ─── Image / Фото ────────────────────────────────────────────────────────────
/** Рамка фото с горным пейзажем и солнцем */
export function ImageIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <circle cx="7.5" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <path d="M2.5 13.5l4-4 3.5 4 3-3 4.5 4.5" />
    </svg>
  );
}

// ─── Music note / Нота ───────────────────────────────────────────────────────
/** Две восьмые ноты со связкой */
export function MusicIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M8.5 17V7l9-2v10" />
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="16" cy="15" r="2.5" />
    </svg>
  );
}

// ─── Video camera / Видеокамера ──────────────────────────────────────────────
export function VideoIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <rect x="2" y="6.5" width="11" height="8" rx="1.5" />
      <path d="M13 9l5.5-2.5v7.5L13 11.5V9z" />
    </svg>
  );
}

export function MicIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <rect x="7" y="2" width="6" height="10" rx="3" />
      <path d="M4 9a6 6 0 0 0 12 0" />
      <path d="M10 15v3" />
      <path d="M7 18h6" />
    </svg>
  );
}

// ─── Arrow down / Стрелка вниз ────────────────────────────────────────────────
export function ArrowDownIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <line x1="10" y1="4" x2="10" y2="16" />
      <path d="M5.5 12L10 16.5 14.5 12" />
    </svg>
  );
}

export function ArrowLeftIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <line x1="16" y1="10" x2="4" y2="10" />
      <path d="M8 5.5L3.5 10 8 14.5" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <line x1="4" y1="10" x2="16" y2="10" />
      <path d="M12 5.5L16.5 10 12 14.5" />
    </svg>
  );
}

// ─── History / Часы ──────────────────────────────────────────────────────────
/** Циферблат со стрелкой, указывающей назад */
export function HistoryIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M3.5 10A6.5 6.5 0 103.5 9" />
      <path d="M2 6l1.5 3H7" />
      <path d="M10 7v3.5l2.5 1.5" />
    </svg>
  );
}

// ─── Download / Скачать ──────────────────────────────────────────────────────
export function DownloadIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <line x1="10" y1="3.5" x2="10" y2="13.5" />
      <path d="M5.5 10L10 14.5 14.5 10" />
      <line x1="3.5" y1="17" x2="16.5" y2="17" />
    </svg>
  );
}

// ─── Bolt / Молния ───────────────────────────────────────────────────────────
/** Залитая молния — для быстрых действий (кэш, быстрый промт, недоступная функция) */
export function BoltIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M11 2L4.5 11.5H9L8 18l7.5-10H11l1-6z" fill="currentColor" stroke="none" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Mute / Динамик выключен ──────────────────────────────────────────────────
/** Динамик с перечёркивающими линиями вместо звуковых волн — пара к SoundIcon */
export function MuteIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M3.5 7.5h2.8L10.5 5v10L6.3 12.5H3.5a.5.5 0 01-.5-.5V8a.5.5 0 01.5-.5z" strokeLinejoin="round" />
      <line x1="13" y1="7.5" x2="17.5" y2="12.5" />
      <line x1="17.5" y1="7.5" x2="13" y2="12.5" />
    </svg>
  );
}

// ─── Warning / Предупреждение ─────────────────────────────────────────────────
/** Треугольник с восклицательным знаком */
export function WarningIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M10 3L18 17H2L10 3z" strokeLinejoin="round" />
      <line x1="10" y1="8" x2="10" y2="12" />
      <circle cx="10" cy="14.5" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── Document / Документ ─────────────────────────────────────────────────────
/** Лист с загнутым уголком и строками текста — обобщённая иконка документа (pdf/doc/md и т.п.) */
export function DocumentIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M6 2.5h6l3.5 3.5V17a.5.5 0 01-.5.5h-9A.5.5 0 015 17V3a.5.5 0 01.5-.5z" strokeLinejoin="round" />
      <path d="M12 2.5V6a.5.5 0 00.5.5H16" />
      <line x1="7.5" y1="10" x2="12.5" y2="10" />
      <line x1="7.5" y1="13" x2="12.5" y2="13" />
    </svg>
  );
}

// ─── Table / Таблица ──────────────────────────────────────────────────────────
/** Сетка таблицы — обобщённая иконка для xls/csv и т.п. */
export function TableIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <line x1="2.5" y1="8" x2="17.5" y2="8" />
      <line x1="2.5" y1="12.5" x2="17.5" y2="12.5" />
      <line x1="8.5" y1="3.5" x2="8.5" y2="16.5" />
    </svg>
  );
}

// ─── Code / Код ───────────────────────────────────────────────────────────────
/** Угловые скобки `</>` — обобщённая иконка для файлов кода (js/py/json/html/sql и т.п.) */
export function CodeIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M7 6L2.5 10 7 14" />
      <path d="M13 6l4.5 4-4.5 4" />
    </svg>
  );
}

// ─── Casper Coin ─────────────────────────────────────────────────────────────
/**
 * Золотая монета с мини-призраком внутри.
 * Используется для отображения валюты Casper по всему интерфейсу.
 */
export function CasperCoin({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      {/* Основа монеты */}
      <circle cx="10" cy="10" r="9.5" fill="#F5C518" />
      <circle cx="10" cy="10" r="9.5" fill="none" stroke="#B8960C" strokeWidth="1" />
      {/* Внутренний ободок */}
      <circle cx="10" cy="10" r="7.8" fill="none" stroke="#F0D060" strokeWidth="0.5" opacity="0.6" />
      {/* Блик */}
      <ellipse cx="7.5" cy="7" rx="2.5" ry="1.8" fill="#FFE866" opacity="0.35" />
      {/* Тело призрака */}
      <path
        d="M7.5 10.8 C7.5 7.8 8.6 5.8 10 5.8 C11.4 5.8 12.5 7.8 12.5 10.8 L12.5 14.8 Q11.2 13.6 10 14.8 Q8.8 13.6 7.5 14.8 Z"
        fill="white"
        opacity="0.93"
      />
      {/* Глаза призрака */}
      <circle cx="9" cy="9.8" r="0.9" fill="#8B6508" />
      <circle cx="11" cy="9.8" r="0.9" fill="#8B6508" />
    </svg>
  );
}
