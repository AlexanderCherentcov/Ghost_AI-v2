'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { InputBar } from '@/components/chat/InputBar';
import { ModeSelector } from '@/components/chat/ModeSelector';

export default function ChatPage() {
  const router = useRouter();
  const { addChat, mode, setMode } = useChatStore();

  async function handleSend(prompt: string) {
    // Create new chat and redirect to it
    const chat = await api.chats.create({ mode });
    addChat(chat);
    // Store prompt in sessionStorage to auto-send
    sessionStorage.setItem('initialPrompt', prompt);
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
