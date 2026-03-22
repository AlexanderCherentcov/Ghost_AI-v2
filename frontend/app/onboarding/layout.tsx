'use client';

import { GhostIcon } from '@/components/icons/GhostIcon';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-center pt-8 pb-4">
        <GhostIcon size={24} className="text-accent" />
        <span className="ml-2 text-sm font-medium text-white">GhostLine</span>
      </div>
      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        {children}
      </div>
    </div>
  );
}
