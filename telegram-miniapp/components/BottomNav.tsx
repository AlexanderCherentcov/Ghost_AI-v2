'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function IconHistory({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? '2' : '1.6'} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function IconChat({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? '2' : '1.6'} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      {active && <path d="M8 10h8M8 14h5" strokeWidth="1.5" />}
      {!active && <path d="M8 10h8M8 14h5" strokeWidth="1.2" />}
    </svg>
  );
}

function IconPlans({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? '2' : '1.6'} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="3" />
      <path d="M2 10h20" />
      <path d="M6 15h3" />
      <path d="M14 15h4" />
      {active && <path d="M6 7.5h4" strokeWidth="1.5" />}
    </svg>
  );
}

function IconAccount({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? '2' : '1.6'} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-3.87 3.58-7 8-7s8 3.13 8 7" />
    </svg>
  );
}

function IconMusic({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? '2' : '1.6'} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

const ITEMS = [
  { href: '/history', label: 'История', Icon: IconHistory },
  { href: '/chat',    label: 'Чат',     Icon: IconChat },
  { href: '/music',   label: 'Музыка',  Icon: IconMusic },
  { href: '/balance', label: 'Тарифы',  Icon: IconPlans },
  { href: '/account', label: 'Аккаунт', Icon: IconAccount },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex"
      style={{
        background: 'rgba(10,10,18,0.96)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '0.5px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        minHeight: 'var(--bottom-nav-h)',
      }}
    >
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 transition-all relative min-h-[44px]"
            style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
            aria-label={label}
          >
            {active && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full"
                style={{ background: 'var(--accent)' }}
              />
            )}
            <span
              className="flex items-center justify-center rounded-xl transition-all"
              style={{
                padding: active ? '5px 10px' : '5px 8px',
                background: active ? 'var(--accent-dim)' : 'transparent',
              }}
            >
              <Icon active={active} />
            </span>
            <span className="text-[10px] font-medium tracking-wide" style={{ opacity: active ? 1 : 0.65 }}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
