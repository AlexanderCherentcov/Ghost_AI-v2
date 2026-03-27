'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

function IconHistory({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? '2.2' : '1.6'} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function IconChat({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? '2.2' : '1.6'} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 10h8M8 14h5" strokeWidth={active ? '1.8' : '1.3'} />
    </svg>
  );
}

function IconPlans({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? '2.2' : '1.6'} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M2 10h20" />
      <path d="M6 15h3M14 15h4" />
    </svg>
  );
}

function IconProfile({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? '2.2' : '1.6'} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.87 3.58-7 8-7s8 3.13 8 7" />
    </svg>
  );
}

const ITEMS = [
  { href: '/history', label: 'История', Icon: IconHistory },
  { href: '/chat',    label: 'Чат',     Icon: IconChat },
  { href: '/billing', label: 'Тарифы',  Icon: IconPlans },
  { href: '/profile', label: 'Профиль', Icon: IconProfile },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-[60px] bg-[var(--bg-surface)] border-t border-[var(--border)] flex items-center lg:hidden">
      {ITEMS.map(({ href, label, Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-all relative',
              isActive ? 'text-accent' : 'text-[rgba(255,255,255,0.3)]'
            )}
          >
            {isActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full bg-accent" />
            )}
            <span
              className={cn(
                'flex items-center justify-center rounded-xl transition-all',
                isActive ? 'bg-[var(--accent-dim)] px-3 py-1' : 'px-2 py-1'
              )}
            >
              <Icon active={isActive} />
            </span>
            <span className="text-[10px] uppercase tracking-wider">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
