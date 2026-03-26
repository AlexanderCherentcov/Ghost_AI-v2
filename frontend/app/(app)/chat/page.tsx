'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { InputBar } from '@/components/chat/InputBar';
import { ModeSelector } from '@/components/chat/ModeSelector';

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
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ChatPage() {
  const router = useRouter();
  const { addChat, mode, setMode } = useChatStore();

  async function handleSend(prompt: string, file?: File) {
    // Create new chat and redirect to it
    const chat = await api.chats.create({ mode });
    addChat(chat);
    // Store prompt in sessionStorage to auto-send
    sessionStorage.setItem('initialPrompt', prompt);
    // If image attached, resize and store as base64 for the chat page to pick up
    if (file && file.type.startsWith('image/')) {
      try {
        const base64 = await resizeImageToBase64(file);
        sessionStorage.setItem('initialImageUrl', base64);
      } catch {}
    }
    router.push(`/chat/${chat.id}`);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Mode selector */}
      <div className="flex justify-center pt-4 px-4">
        <ModeSelector
          value={mode as 'chat' | 'vision' | 'sound' | 'reel' | 'think'}
          onChange={(m) => {
            if (m !== 'chat' && m !== 'think') {
              router.push(`/${m}`);
            } else {
              setMode(m);
            }
          }}
        />
      </div>

      {/* Chat window — empty state */}
      <ChatWindow onSuggestion={handleSend} />

      {/* Input */}
      <InputBar
        onSend={handleSend}
        placeholder="Спросите что-нибудь у GhostLine..."
      />
    </div>
  );
}
