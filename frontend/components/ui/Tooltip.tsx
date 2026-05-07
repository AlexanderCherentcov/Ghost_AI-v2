'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { ReactNode } from 'react';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={100}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({
  children,
  content,
  disabled,
  side = 'top',
}: {
  children: ReactNode;
  content: string;
  disabled?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  if (!content || disabled) return <>{children}</>;

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-[200px] rounded-lg px-2.5 py-1.5 text-[11px] leading-snug shadow-lg animate-in fade-in-0 zoom-in-95"
          style={{
            background: 'var(--bg-elevated, #1e1e2e)',
            color: 'var(--text-secondary, #a0a0b8)',
            border: '1px solid var(--border, rgba(255,255,255,0.1))',
          }}
        >
          {content}
          <TooltipPrimitive.Arrow
            style={{ fill: 'var(--border, rgba(255,255,255,0.1))' }}
          />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
