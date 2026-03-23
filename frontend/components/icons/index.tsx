'use client';

import type { CSSProperties } from 'react';

export { GhostIcon } from './GhostIcon';

interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

const svgBase = (size: number, className: string, style?: CSSProperties) => ({
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

export function ChatIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <path d="M2 4a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H7.5l-3.5 3v-3H4a2 2 0 01-2-2V4z" />
      <path d="M6 8.5c4.5-1 7.5 1 7.5 1" strokeWidth="1" />
    </svg>
  );
}

export function VisionIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
      <circle cx="10" cy="10" r="3" />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SoundIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <path d="M11 5a5 5 0 010 10" />
      <path d="M14 2a9 9 0 010 16" />
      <path d="M6 8H3a1 1 0 00-1 1v2a1 1 0 001 1h3l4 3V5L6 8z" />
    </svg>
  );
}

export function ReelIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <circle cx="10" cy="10" r="8" />
      <polygon points="8,7 14,10 8,13" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ThinkIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <path d="M10 2c-1.5 0-3 .8-3.8 2-.8 1.2-.8 2.8 0 4 .5.8.5 1.7.2 2.5" strokeLinecap="round" />
      <path d="M10 2c1.5 0 3 .8 3.8 2 .8 1.2.8 2.8 0 4-.5.8-.5 1.7-.2 2.5" strokeLinecap="round" />
      <circle cx="10" cy="14" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="10" cy="17.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TokenIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <polygon points="10,2 18,6 18,14 10,18 2,14 2,6" />
      <polygon points="10,5 15,7.5 15,12.5 10,15 5,12.5 5,7.5" fill="currentColor" fillOpacity="0.2" stroke="none" />
    </svg>
  );
}

export function PlusIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <line x1="10" y1="4" x2="10" y2="16" />
      <line x1="4" y1="10" x2="16" y2="10" />
    </svg>
  );
}

export function SendIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <line x1="4" y1="16" x2="16" y2="4" />
      <polyline points="8,4 16,4 16,12" />
    </svg>
  );
}

export function SettingsIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
    </svg>
  );
}

export function UserIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <circle cx="10" cy="7" r="4" />
      <path d="M2 19c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

export function TrashIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <polyline points="3,6 5,6 17,6" />
      <path d="M8 6V4h4v2" />
      <path d="M5 6l1 12h8l1-12" />
    </svg>
  );
}

export function EditIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <path d="M11 4H4a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-7" />
      <path d="M16.5 2.5a2.12 2.12 0 013 3L10 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function CopyIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <rect x="7" y="7" width="11" height="11" rx="2" />
      <path d="M13 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2" />
    </svg>
  );
}

export function SparkleIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <path d="M10 2l1.5 5.5L17 9l-5.5 1.5L10 16l-1.5-5.5L3 9l5.5-1.5L10 2z" strokeLinejoin="round" />
    </svg>
  );
}

export function AttachIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <path d="M16.5 11.5L9 19a5 5 0 01-7-7l7.5-7.5A3.5 3.5 0 1114 9.5L7 17a2 2 0 01-2.8-2.8l6.5-6.5" />
    </svg>
  );
}

export function MenuIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <line x1="3" y1="6" x2="17" y2="6" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="14" x2="17" y2="14" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <polyline points="5,8 10,13 15,8" />
    </svg>
  );
}

export function XIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <line x1="4" y1="4" x2="16" y2="16" />
      <line x1="16" y1="4" x2="4" y2="16" />
    </svg>
  );
}

export function CheckIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <polyline points="4,10 8,14 16,6" />
    </svg>
  );
}

export function ImageIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <rect x="2" y="4" width="16" height="12" rx="2" />
      <circle cx="7" cy="9" r="1.5" />
      <path d="M2 14l4-4 4 4 3-3 3 3" />
    </svg>
  );
}

export function MusicIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <path d="M8 18V6l10-2v12" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="16" cy="16" r="2" />
    </svg>
  );
}

export function VideoIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <polygon points="23,7 16,12 23,17" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

export function ArrowDownIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <line x1="10" y1="4" x2="10" y2="16" />
      <polyline points="6,12 10,16 14,12" />
    </svg>
  );
}

export function HistoryIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

export function DownloadIcon({ size = 20, className = '', style }: IconProps) {
  return (
    <svg {...svgBase(size, className, style)}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
