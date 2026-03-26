'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { InputBar } from '@/components/chat/InputBar';
import { ModeSelector } from '@/components/chat/ModeSelector';
import { getFileCategory } from '@/components/chat/InputBar';

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

    if (file) {
      const category = getFileCategory(file);
      sessionStorage.setItem('initialFileName', file.name);

      if (category === 'image') {
        try {
          const base64 = await resizeImageToBase64(file);
          sessionStorage.setItem('initialImageUrl', base64);
        } catch {}
      } else if (category === 'text') {
        // Read text client-side
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
        // binary: store the file as object URL so the chat page can re-upload it
        const objectUrl = URL.createObjectURL(file);
        sessionStorage.setItem('initialBinaryFileUrl', objectUrl);
        sessionStorage.setItem('initialFileMime', file.type);
      }
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
