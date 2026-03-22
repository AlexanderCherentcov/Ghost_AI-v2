'use client';

interface GhostIconProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

export function GhostIcon({ size = 24, className = '', animated = false }: GhostIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animated ? 'animate-float' : ''} ${className}`}
    >
      {/* Body */}
      <path
        d="M20 2C10.06 2 2 10.06 2 20V44C2 44 6 40 10 44C14 48 14 44 18 44C22 44 22 48 26 44C30 40 30 44 34 44C38 40 38 44 38 44V20C38 10.06 29.94 2 20 2Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Eyes */}
      <circle cx="14" cy="20" r="3" fill="currentColor" />
      <circle cx="26" cy="20" r="3" fill="currentColor" />
      {/* Eye glow */}
      <circle cx="14" cy="20" r="1.5" fill="white" fillOpacity="0.6" />
      <circle cx="26" cy="20" r="1.5" fill="white" fillOpacity="0.6" />
    </svg>
  );
}
