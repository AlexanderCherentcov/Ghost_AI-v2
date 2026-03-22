'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChatIcon, VisionIcon, SoundIcon, ReelIcon, UserIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/chat',    label: 'Chat',    Icon: ChatIcon },
  { href: '/vision',  label: 'Vision',  Icon: VisionIcon },
  { href: '/sound',   label: 'Sound',   Icon: SoundIcon },
  { href: '/reel',    label: 'Reel',    Icon: ReelIcon },
  { href: '/profile', label: 'Profile', Icon: UserIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-[60px] bg-[var(--bg-surface)] border-t border-[var(--border)] flex items-center md:hidden">
      {ITEMS.map(({ href, label, Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-all',
              isActive ? 'text-accent' : 'text-[rgba(255,255,255,0.3)]'
            )}
          >
            <Icon size={20} />
            <span className="text-[10px] uppercase tracking-wider">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
