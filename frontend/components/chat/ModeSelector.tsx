'use client';

import { motion } from 'framer-motion';
import { ChatIcon, VisionIcon, SoundIcon, ReelIcon, ThinkIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

type Mode = 'chat' | 'vision' | 'sound' | 'reel' | 'think';

const MODES: { id: Mode; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'chat',   label: 'Chat',   Icon: ChatIcon },
  { id: 'vision', label: 'Vision', Icon: VisionIcon },
  { id: 'sound',  label: 'Sound',  Icon: SoundIcon },
  { id: 'reel',   label: 'Reel',   Icon: ReelIcon },
  { id: 'think',  label: 'Think',  Icon: ThinkIcon },
];

interface ModeSelectorProps {
  value: Mode;
  onChange: (mode: Mode) => void;
}

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-1">
      {MODES.map(({ id, label, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={cn(
              'relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
              active
                ? 'text-white'
                : 'text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.7)]'
            )}
          >
            {active && (
              <motion.div
                layoutId="mode-bg"
                className="absolute inset-0 bg-[var(--bg-elevated)] rounded-lg"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <Icon size={14} className={active ? 'text-accent' : ''} />
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
