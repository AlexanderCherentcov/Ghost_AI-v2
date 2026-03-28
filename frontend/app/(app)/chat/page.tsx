'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { InputBar } from '@/components/chat/InputBar';
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

const SUGGESTIONS = [
  { icon: '✍️', text: 'Напиши краткое резюме' },
  { icon: '🌍', text: 'Переведи текст на английский' },
  { icon: '💡', text: 'Придумай идеи для проекта' },
  { icon: '🔍', text: 'Объясни простыми словами' },
];

function ModelSelector({ preferredModel, setPreferredModel }: {
  preferredModel: 'haiku' | 'deepseek' | undefined;
  setPreferredModel: (m: 'haiku' | 'deepseek' | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options: { key: 'haiku' | 'deepseek' | undefined; label: string }[] = [
    { key: undefined,  label: 'Авто' },
    { key: 'haiku',    label: 'Стандарт' },
    { key: 'deepseek', label: 'Про' },
  ];

  const current = options.find(o => o.key === preferredModel) ?? options[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.7)] transition-colors px-2 py-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.05)]"
      >
        {current.label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xl min-w-[110px]">
          {options.map(opt => (
            <button
              key={String(opt.key)}
              onClick={() => { setPreferredModel(opt.key); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-xs transition-colors hover:bg-[rgba(255,255,255,0.05)] ${
                preferredModel === opt.key ? 'text-accent' : 'text-[rgba(255,255,255,0.65)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const { addChat, preferredModel, setPreferredModel } = useChatStore();
  const { user } = useAuthStore();

  const firstName = user?.name?.split(' ')[0] ?? 'Ghost';

  async function handleSend(prompt: string, file?: File) {
    const chat = await api.chats.create({ mode: 'chat' });
    addChat(chat);

    sessionStorage.setItem('initialPrompt', prompt);

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
      {/* Model selector — top right */}
      <div className="flex items-center justify-end px-4 py-1.5 flex-shrink-0">
        <ModelSelector preferredModel={preferredModel} setPreferredModel={setPreferredModel} />
      </div>

      {/* Empty state */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[640px] text-center"
        >
          <GhostIcon size={44} className="text-accent animate-float mx-auto mb-6" animated />

          <h1 className="text-[clamp(22px,5vw,36px)] font-normal tracking-tight text-white mb-1">
            Здравствуйте, {firstName}!
          </h1>
          <p className="text-lg text-[rgba(255,255,255,0.4)] mb-10">
            С чего начнём?
          </p>

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
        </motion.div>
      </div>

      <InputBar
        onSend={handleSend}
        placeholder="Спросите что-нибудь у GhostLine..."
      />
    </div>
  );
}
