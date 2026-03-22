'use client';

import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useChatStore } from '@/store/chat.store';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { InputBar } from '@/components/chat/InputBar';
import { ThinkIcon } from '@/components/icons';

export default function ThinkPage() {
  const router = useRouter();
  const { addChat, setMode } = useChatStore();

  async function handleSend(prompt: string) {
    const chat = await api.chats.create({ mode: 'think', title: prompt.slice(0, 35) });
    addChat(chat);
    setMode('think');
    sessionStorage.setItem('initialPrompt', prompt);
    router.push(`/chat/${chat.id}`);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--border)]">
        <div className="w-9 h-9 rounded-xl bg-[rgba(240,200,92,0.12)] flex items-center justify-center">
          <ThinkIcon size={18} className="text-[#F0C85C]" />
        </div>
        <div>
          <h1 className="font-medium text-white">Ghost Think</h1>
          <p className="text-xs text-[rgba(255,255,255,0.3)]">Думающая модель для сложных задач</p>
        </div>
      </div>

      <ChatWindow onSuggestion={handleSend} />

      <InputBar
        onSend={handleSend}
        placeholder="Задайте сложный вопрос — GhostLine подумает..."
      />
    </div>
  );
}
