'use client';

import type { CSSProperties } from 'react';

export { GhostIcon } from './GhostIcon';

// ─── Shared base ──────────────────────────────────────────────────────────────

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
/** Speech bubble with three typing dots */
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

// ─── Vision / Eye ─────────────────────────────────────────────────────────────
/** Eye with pupil highlight — used for image generation */
export function VisionIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M2 10c2-4.5 4.5-6.5 8-6.5S16 5.5 18 10c-2 4.5-4.5 6.5-8 6.5S4 14.5 2 10z" />
      <circle cx="10" cy="10" r="2.5" />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── Sound / Speaker ──────────────────────────────────────────────────────────
/** Speaker cone with two sound waves */
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
/** Filled play button inside a circle — for video history */
export function ReelIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <circle cx="10" cy="10" r="8" />
      <path d="M8 7.5l5.5 2.5L8 12.5V7.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── Think / Lightbulb ───────────────────────────────────────────────────────
/** Lightbulb with filament glow lines — for pro/think mode */
export function ThinkIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M10 2a5 5 0 014 8l.5 2.5H5.5L6 10a5 5 0 014-8z" />
      <line x1="8" y1="14.5" x2="12" y2="14.5" />
      <line x1="8.5" y1="16.5" x2="11.5" y2="16.5" />
    </svg>
  );
}

// ─── Token / Gem ─────────────────────────────────────────────────────────────
/** Hexagonal gem — for token / Casper usage stats */
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

// ─── Send / Paper plane ───────────────────────────────────────────────────────
/** Paper airplane — primary send action */
export function SendIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M17.5 2.5L2.5 9.5l6 2.5 2.5 6 6.5-15.5z" strokeLinejoin="round" />
      <line x1="8.5" y1="12" x2="17.5" y2="2.5" />
    </svg>
  );
}

// ─── Settings / Gear ─────────────────────────────────────────────────────────
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

// ─── User / Person ───────────────────────────────────────────────────────────
export function UserIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <circle cx="10" cy="7.5" r="3.5" />
      <path d="M3 18a7 7 0 0114 0" />
    </svg>
  );
}

// ─── Trash ───────────────────────────────────────────────────────────────────
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

// ─── Edit / Pencil ────────────────────────────────────────────────────────────
export function EditIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M14 3.5l2.5 2.5L7.5 14.5l-4 1 1-4L14 3.5z" />
      <line x1="12" y1="5.5" x2="14.5" y2="8" />
    </svg>
  );
}

// ─── Copy ────────────────────────────────────────────────────────────────────
export function CopyIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <rect x="7.5" y="7" width="9" height="10.5" rx="1.5" />
      <path d="M14.5 7V5A1.5 1.5 0 0013 3.5H5A1.5 1.5 0 003.5 5v8A1.5 1.5 0 005 14.5h2.5" />
    </svg>
  );
}

// ─── Sparkle / Star ──────────────────────────────────────────────────────────
/** 4-pointed sparkle star */
export function SparkleIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M10 2L11.8 8.2 18 10l-6.2 1.8L10 18l-1.8-6.2L2 10l6.2-1.8L10 2z" />
    </svg>
  );
}

// ─── Attach / Paperclip ──────────────────────────────────────────────────────
export function AttachIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M17.5 9.5L9 18A5 5 0 012 11L10.5 2.5A3 3 0 0115 6.5L6.5 15a1 1 0 01-1.5-1.5L13.5 5" />
    </svg>
  );
}

// ─── Menu ────────────────────────────────────────────────────────────────────
export function MenuIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <line x1="3" y1="6" x2="17" y2="6" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="14" x2="17" y2="14" />
    </svg>
  );
}

// ─── Chevron down ────────────────────────────────────────────────────────────
export function ChevronDownIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M5 8.5l5 5 5-5" />
    </svg>
  );
}

// ─── X / Close ───────────────────────────────────────────────────────────────
export function XIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <line x1="4.5" y1="4.5" x2="15.5" y2="15.5" />
      <line x1="15.5" y1="4.5" x2="4.5" y2="15.5" />
    </svg>
  );
}

// ─── Check ───────────────────────────────────────────────────────────────────
export function CheckIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M3.5 10.5l5 5L17 6" />
    </svg>
  );
}

// ─── Image / Photo ───────────────────────────────────────────────────────────
/** Photo frame with mountain landscape and sun */
export function ImageIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <circle cx="7.5" cy="8" r="1.5" fill="currentColor" stroke="none" />
      <path d="M2.5 13.5l4-4 3.5 4 3-3 4.5 4.5" />
    </svg>
  );
}

// ─── Music note ──────────────────────────────────────────────────────────────
/** Two beamed eighth notes */
export function MusicIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M8.5 17V7l9-2v10" />
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="16" cy="15" r="2.5" />
    </svg>
  );
}

// ─── Video camera ────────────────────────────────────────────────────────────
export function VideoIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <rect x="2" y="6.5" width="11" height="8" rx="1.5" />
      <path d="M13 9l5.5-2.5v7.5L13 11.5V9z" />
    </svg>
  );
}

// ─── Arrow down ──────────────────────────────────────────────────────────────
export function ArrowDownIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <line x1="10" y1="4" x2="10" y2="16" />
      <path d="M5.5 12L10 16.5 14.5 12" />
    </svg>
  );
}

// ─── History / Clock ─────────────────────────────────────────────────────────
/** Clock face with back-pointing arrow */
export function HistoryIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <path d="M3.5 10A6.5 6.5 0 103.5 9" />
      <path d="M2 6l1.5 3H7" />
      <path d="M10 7v3.5l2.5 1.5" />
    </svg>
  );
}

// ─── Download ────────────────────────────────────────────────────────────────
export function DownloadIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...base(size, className, style)}>
      <line x1="10" y1="3.5" x2="10" y2="13.5" />
      <path d="M5.5 10L10 14.5 14.5 10" />
      <line x1="3.5" y1="17" x2="16.5" y2="17" />
    </svg>
  );
}

// ─── Casper Coin ─────────────────────────────────────────────────────────────
/**
 * Gold coin with a mini ghost inside.
 * Used for Casper currency display throughout the UI.
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
      {/* Coin base */}
      <circle cx="10" cy="10" r="9.5" fill="#F5C518" />
      <circle cx="10" cy="10" r="9.5" fill="none" stroke="#B8960C" strokeWidth="1" />
      {/* Inner rim */}
      <circle cx="10" cy="10" r="7.8" fill="none" stroke="#F0D060" strokeWidth="0.5" opacity="0.6" />
      {/* Highlight */}
      <ellipse cx="7.5" cy="7" rx="2.5" ry="1.8" fill="#FFE866" opacity="0.35" />
      {/* Ghost body */}
      <path
        d="M7.5 10.8 C7.5 7.8 8.6 5.8 10 5.8 C11.4 5.8 12.5 7.8 12.5 10.8 L12.5 14.8 Q11.2 13.6 10 14.8 Q8.8 13.6 7.5 14.8 Z"
        fill="white"
        opacity="0.93"
      />
      {/* Ghost eyes */}
      <circle cx="9" cy="9.8" r="0.9" fill="#8B6508" />
      <circle cx="11" cy="9.8" r="0.9" fill="#8B6508" />
    </svg>
  );
}
