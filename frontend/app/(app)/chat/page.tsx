'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { InputBar } from '@/components/chat/InputBar';
import { ChatQuickActions, type QuickMode } from '@/components/chat/ChatQuickActions';
import { VisionIcon, ThinkIcon, ChatIcon } from '@/components/icons';
import { getFileCategory } from '@/components/chat/InputBar';
import { GhostIcon } from '@/components/icons/GhostIcon';

async function resizeImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 800;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Quick suggestions shown on empty state
const SUGGESTIONS = [
  { icon: '✍️', text: 'Напиши краткое резюме' },
  { icon: '🌍', text: 'Переведи текст на английский' },
  { icon: '💡', text: 'Придумай идеи для проекта' },
  { icon: '🔍', text: 'Объясни простыми словами' },
];

export default function ChatPage() {
  const router = useRouter();
  const { addChat, mode, setMode, preferredModel, setPreferredModel } = useChatStore();
  const { user } = useAuthStore();
  const [quickMode, setQuickMode] = useState<QuickMode>(null);

  const firstName = user?.name?.split(' ')[0] ?? 'Ghost';
  const isPaidPlan = user?.plan !== 'FREE';

  async function handleSend(prompt: string, file?: File) {
    const chatMode = quickMode === 'image-edit' ? 'vision' : mode;
    const chat = await api.chats.create({ mode: chatMode as any });
    addChat(chat);

    if (quickMode === 'image-create') {
      sessionStorage.setItem('initialImagePrompt', prompt);
    } else {
      sessionStorage.setItem('initialPrompt', prompt);
    }
    if (file) {
      const category = getFileCategory(file);
      sessionStorage.setItem('initialFileName', file.name);
      if (category === 'image') {
        try {
          sessionStorage.setItem('initialImageUrl', await resizeImageToBase64(file));
        } catch {}
      } else if (category === 'text') {
        try {
          const text = await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onerror = rej;
            r.onload = (e) => res(e.target!.result as string);
            r.readAsText(file, 'utf-8');
          });
          sessionStorage.setItem('initialFileContent', text.slice(0, 60_000));
          sessionStorage.setItem('initialFileLang', file.name.split('.').pop()?.toLowerCase() ?? 'text');
        } catch {}
      } else {
        sessionStorage.setItem('initialBinaryFileUrl', URL.createObjectURL(file));
        sessionStorage.setItem('initialFileMime', file.type);
      }
    }
    router.push(`/chat/${chat.id}`);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Empty state — Gemini-style */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[640px] text-center"
        >
          {/* Ghost icon */}
          <GhostIcon size={44} className="text-accent animate-float mx-auto mb-6" animated />

          {/* Greeting */}
          <h1 className="text-[clamp(22px,5vw,36px)] font-normal tracking-tight text-white mb-1">
            Здравствуйте, {firstName}!
          </h1>
          <p className="text-lg text-[rgba(255,255,255,0.4)] mb-10">
            С чего начнём?
          </p>

          {/* Suggestion chips */}
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {SUGGESTIONS.map(({ icon, text }) => (
              <button
                key={text}
                onClick={() => handleSend(text)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl text-sm text-[rgba(255,255,255,0.7)] hover:bg-[var(--bg-elevated)] hover:text-white hover:border-[rgba(255,255,255,0.2)] transition-all"
              >
                <span>{icon}</span>
                {text}
              </button>
            ))}
          </div>

          {/* Mode + model pills */}
          <div className="flex items-center justify-center gap-2 mb-2 flex-wrap">
            {/* Think mode toggle */}
            <button
              onClick={() => setMode(mode === 'think' ? 'chat' : 'think')}
              title={!isPaidPlan ? 'Только для платных тарифов' : undefined}
              disabled={!isPaidPlan}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all ${
                !isPaidPlan
                  ? 'border-[var(--border)] text-[rgba(255,255,255,0.2)] cursor-default'
                  : mode === 'think'
                    ? 'border-accent bg-[var(--accent-dim)] text-accent'
                    : 'border-[var(--border)] text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.6)]'
              }`}
            >
              <ThinkIcon size={12} />
              Думать
              {!isPaidPlan && <span className="text-[9px] bg-[rgba(255,200,50,0.15)] text-[rgba(255,200,50,0.8)] px-1 py-0.5 rounded-full ml-0.5">PRO</span>}
            </button>

            {/* Model selector */}
            <div className="flex items-center gap-0.5 rounded-full border border-[var(--border)] p-0.5">
              {([
                { key: 'haiku',   label: '⚡ Быстрая' },
                { key: 'deepseek', label: '🧠 Про' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPreferredModel(preferredModel === key ? undefined : key)}
                  className={`px-3 py-1 rounded-full text-xs transition-all ${
                    preferredModel === key
                      ? 'bg-[var(--bg-elevated)] text-white'
                      : 'text-[rgba(255,255,255,0.35)] hover:text-[rgba(255,255,255,0.6)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Quick actions + input at bottom */}
      <ChatQuickActions onSelect={setQuickMode} activeMode={quickMode} isPaidPlan={isPaidPlan} />
      <InputBar
        onSend={handleSend}
        placeholder={
          quickMode === 'image-create' ? '✨ Опишите картинку...' :
          quickMode === 'image-edit'   ? '🎨 Прикрепите фото и опишите изменения...' :
          mode === 'think'             ? '🧠 Сложная задача для глубокого анализа...' :
          'Спросите что-нибудь у GhostLine...'
        }
      />
    </div>
  );
}
