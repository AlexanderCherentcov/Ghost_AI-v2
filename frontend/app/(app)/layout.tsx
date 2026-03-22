'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { useChatStore } from '@/store/chat.store';
import { api } from '@/lib/api';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuthStore();
  const { setChats } = useChatStore();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
    if (user && !user.onboardingDone) {
      router.replace('/onboarding/name');
    }
  }, [user, isLoading]);

  useEffect(() => {
    if (user) {
      api.chats.list().then(({ chats }) => setChats(chats)).catch(() => {});
    }
  }, [user]);

  if (isLoading || !user) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      {/* Sidebar — desktop */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Main content — offset for sidebar on desktop */}
      <main className="flex-1 lg:ml-[260px] flex flex-col overflow-hidden pb-[60px] lg:pb-0">
        {children}
      </main>

      {/* Bottom nav — mobile */}
      <BottomNav />
    </div>
  );
}
