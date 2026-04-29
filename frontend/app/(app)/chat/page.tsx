'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { InputBar, type ChatMode } from '@/components/chat/InputBar';
import { getFileCategory } from '@/components/chat/InputBar';
import { GhostIcon } from '@/components/icons/GhostIcon';

const IMAGE_VERBS = [
  'нарисуй', 'создай', 'сгенерируй', 'сделай', 'покажи',
  'нарисую', 'сгенерирую',
  'нарисовать', 'создать', 'сгенерировать', 'сделать',
  'draw', 'generate', 'create', 'make',
];
const IMAGE_NOUNS = [
  'картинку', 'картину', 'картинок', 'изображение', 'изображения', 'рисунок',
  'рисунки', 'иллюстрацию', 'арт', 'image', 'picture', 'photo', 'illustration',
];
const IMAGE_EXACT = ['изображение в стиле', 'generate image', 'хочу картинку'];
const REF_KEYWORDS = [
  'по этому', 'по нему', 'по промту', 'по этой', 'этот промт', 'выше', 'его', 'из чата',
];

function isImageRequest(text: string): boolean {
  const lower = text.toLowerCase();
  if (IMAGE_EXACT.some((kw) => lower.includes(kw))) return true;
  return IMAGE_VERBS.some((v) => lower.includes(v)) && IMAGE_NOUNS.some((n) => lower.includes(n));
}

function isPromptComposeRequest(text: string): boolean {
  const lower = text.toLowerCase();
  if (REF_KEYWORDS.some((ref) => lower.includes(ref))) return false;
  return lower.includes('промт') || lower.includes('prompt') || lower.includes('промпт');
}

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

export default function ChatPage() {
  const router = useRouter();
  const { addChat, preferredModel, setPreferredModel } = useChatStore();
  const { user } = useAuthStore();
  const [chatMode, setChatMode] = useState<ChatMode>('chat');

  const name = user?.name?.split(' ')[0] ?? 'Ghost';
  const firstName = name.charAt(0).toUpperCase() + name.slice(1);

  // Clear active chat state so sidebar doesn't highlight a stale chat
  useEffect(() => {
    sessionStorage.removeItem('newChat');
    useChatStore.getState().setActiveChat(null);
    useChatStore.getState().setMessages([]);
  }, []);

  async function handleSend(prompt: string, file?: File, _videoOptions?: import('@/components/chat/InputBar').VideoOptions, musicMode?: import('@/components/chat/InputBar').MusicMode, musicDuration?: number, sunoStyle?: string, sunoTitle?: string, sunoInstrumental?: boolean, lyrics?: string, styleAudio?: string) {
    const chat = await api.chats.create({ mode: 'chat' });
    addChat(chat);

    // Video mode — store prompt and navigate
    if (chatMode === 'video') {
      sessionStorage.setItem('initialVideoPrompt', prompt);
      router.push(`/chat/${chat.id}`);
      return;
    }

    // Music mode — store prompt and navigate
    if (chatMode === 'music') {
      sessionStorage.setItem('initialMusicPrompt', prompt);
      if (musicMode) sessionStorage.setItem('initialMusicMode', musicMode);
      if (musicDuration) sessionStorage.setItem('initialMusicDuration', String(musicDuration));
      if (lyrics) sessionStorage.setItem('initialLyrics', lyrics);
      if (styleAudio) sessionStorage.setItem('initialStyleAudio', styleAudio);
      if (sunoStyle) sessionStorage.setItem('initialSunoStyle', sunoStyle);
      if (sunoTitle) sessionStorage.setItem('initialSunoTitle', sunoTitle);
      if (sunoInstrumental !== undefined) sessionStorage.setItem('initialSunoInstrumental', String(sunoInstrumental));
      router.push(`/chat/${chat.id}`);
      return;
    }

    // Images mode — always generate image
    if (chatMode === 'images' && !file) {
      sessionStorage.setItem('initialImagePrompt', prompt || 'beautiful landscape');
      router.push(`/chat/${chat.id}`);
      return;
    }

    // Chat mode — direct image generation request (no history yet in new chat)
    if (!file && !isPromptComposeRequest(prompt) && isImageRequest(prompt)) {
      sessionStorage.setItem('initialImagePrompt', prompt);
      router.push(`/chat/${chat.id}`);
      return;
    }

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

  const placeholder = chatMode === 'images'
    ? 'Опишите изображение...'
    : chatMode === 'video'
      ? 'Опишите видео...'
      : chatMode === 'music'
        ? 'Опишите стиль или настроение музыки...'
        : 'Спросите что-нибудь у GhostLine...';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[640px] text-center"
        >
          <GhostIcon size={44} className="text-accent animate-float mx-auto mb-6" animated />

          <h1 className="text-[clamp(22px,5vw,36px)] font-normal tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
            Здравствуйте, {firstName}!
          </h1>
          <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
            С чего начнём?
          </p>
        </motion.div>
      </div>

      <InputBar
        onSend={handleSend}
        placeholder={placeholder}
        preferredModel={preferredModel}
        setPreferredModel={setPreferredModel}
        chatMode={chatMode}
        setChatMode={setChatMode}
      />
    </div>
  );
}
