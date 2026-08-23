'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Tooltip } from '@/components/ui/Tooltip';

/**
 * Общая оболочка для /login и /register — вынесена, чтобы не дублировать фон,
 * карточку и OAuth-кнопки между двумя почти идентичными страницами.
 */
export function AuthShell({ children, tagline }: { children: ReactNode; tagline?: string | null }) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 relative"
      style={{
        background:
          'radial-gradient(circle at 16% 10%, rgba(123,92,240,.28), transparent 42%),' +
          'radial-gradient(circle at 86% 84%, rgba(45,212,191,.16), transparent 42%),' +
          'var(--bg-void)',
      }}
    >
      <Link
        href="/"
        className="flex items-center gap-2.5 absolute top-7 left-8 max-[480px]:static max-[480px]:w-full max-[480px]:justify-center max-[480px]:mb-[22px]"
      >
        <img
          src="/ghostline-logo-icon.png"
          alt="GhostLine"
          className="w-8 h-8 rounded-[8px] object-cover"
          style={{ filter: 'drop-shadow(0 0 10px rgba(123,92,240,.55))' }}
        />
        <span className="font-display font-bold text-[17px] text-white">GhostLine</span>
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-[400px]"
      >
        <div
          className="rounded-[22px] p-[40px_34px] max-[480px]:p-[30px_22px]"
          style={{
            background: 'var(--panel-glass)',
            border: '1px solid var(--panel-glass-border)',
            WebkitBackdropFilter: 'blur(14px)',
            backdropFilter: 'blur(14px)',
            boxShadow: '0 20px 60px rgba(0,0,0,.3)',
          }}
        >
          {children}
        </div>
        {tagline && (
          <p className="text-center text-[12.5px] text-[rgba(255,255,255,0.35)] mt-[22px]">{tagline}</p>
        )}
      </motion.div>
    </div>
  );
}

export function ConsentCheckbox({ consented, onChange }: { consented: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group mb-1">
      <div className="mt-0.5 flex-shrink-0">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className="w-4 h-4 rounded-[4px] border flex items-center justify-center transition-all"
          style={{
            borderColor: consented ? 'var(--accent)' : 'var(--border-hover)',
            background: consented ? 'var(--accent)' : 'transparent',
          }}
        >
          {consented && (
            <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
              <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <span className="text-[12px] text-[rgba(255,255,255,0.4)] leading-relaxed group-hover:text-[rgba(255,255,255,0.55)] transition-colors select-none">
        Я принимаю{' '}
        <Link href="/terms" className="text-[#c4b5fd] hover:opacity-80" onClick={(e) => e.stopPropagation()}>условия использования</Link>
        {' '}и даю согласие на обработку персональных данных в соответствии с{' '}
        <Link href="/privacy" className="text-[#c4b5fd] hover:opacity-80" onClick={(e) => e.stopPropagation()}>политикой конфиденциальности</Link>
      </span>
    </label>
  );
}

export function OAuthButton({
  href, external, enabled, icon, label,
}: {
  href: string;
  external?: boolean;
  enabled: boolean;
  icon: ReactNode;
  label: string;
}) {
  const className =
    'w-full flex items-center justify-center gap-2.5 py-[13px] rounded-[11px] border text-sm font-semibold transition-all';
  if (!enabled) {
    return (
      <Tooltip content="Подтвердите пользовательское соглашение" side="top">
        <button
          disabled
          className={className}
          style={{ borderColor: 'rgba(148,163,184,.2)', color: 'var(--text-muted)', cursor: 'not-allowed' }}
        >
          {icon}{label}
        </button>
      </Tooltip>
    );
  }
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={className}
      style={{ borderColor: 'rgba(148,163,184,.2)', background: 'rgba(255,255,255,.03)', color: 'var(--text-primary)' }}
    >
      {icon}{label}
    </a>
  );
}
