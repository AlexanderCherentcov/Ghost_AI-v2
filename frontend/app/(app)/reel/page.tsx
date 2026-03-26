'use client';

import { ReelIcon, VideoIcon } from '@/components/icons';

export default function ReelPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--border)]">
        <div className="w-9 h-9 rounded-xl bg-[rgba(240,92,140,0.12)] flex items-center justify-center">
          <ReelIcon size={18} className="text-[#F05C8C]" />
        </div>
        <div>
          <h1 className="font-medium text-white">Ghost Reel</h1>
          <p className="text-xs text-[rgba(255,255,255,0.3)]">Генерация видео</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <VideoIcon size={48} className="text-[rgba(255,255,255,0.08)]" />
        <p className="text-lg font-medium text-white">В разработке</p>
        <p className="text-sm text-[rgba(255,255,255,0.3)] max-w-xs">
          Генерация видео скоро будет доступна. Следите за обновлениями!
        </p>
      </div>
    </div>
  );
}
