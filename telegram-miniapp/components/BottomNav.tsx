'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/history', label: 'Чаты',   icon: '🕑' },
  { href: '/chat',    label: 'Chat',   icon: '💬' },
  { href: '/vision',  label: 'Vision', icon: '👁' },
  { href: '/sound',   label: 'Sound',  icon: '🎵' },
  { href: '/balance', label: 'Баланс', icon: '💎' },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex bg-[#0E0E1A] border-t border-[rgba(255,255,255,0.06)]">
      {ITEMS.map(({ href, label, icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-all"
            style={{ color: active ? '#7B5CF0' : 'rgba(255,255,255,0.3)' }}
          >
            <span className="text-lg leading-none">{icon}</span>
            <span className="text-[10px]">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
