'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { api, type Chat } from '@/lib/api';
import { PlusIcon, TrashIcon, ChatIcon } from '@/components/icons';
import { cn, truncate } from '@/lib/utils';

function groupChats(chats: Chat[]) {
  const now = Date.now();
  const day = 86400000;
  const groups: { label: string; chats: Chat[] }[] = [
    { label: 'Сегодня',    chats: [] },
    { label: 'Вчера',      chats: [] },
    { label: 'На неделе',  chats: [] },
    { label: 'Ранее',      chats: [] },
  ];
  for (const chat of chats) {
    const diff = now - new Date(chat.updatedAt).getTime();
    if (diff < day)           groups[0].chats.push(chat);
    else if (diff < 2 * day)  groups[1].chats.push(chat);
    else if (diff < 7 * day)  groups[2].chats.push(chat);
    else                      groups[3].chats.push(chat);
  }
  return groups.filter(g => g.chats.length > 0);
}

export default function HistoryPage() {
  const router = useRouter();
  const { chats, removeChat } = useChatStore();
  const groups = groupChats(chats);

  async function handleNewChat() {
    const chat = await api.chats.create();
    useChatStore.getState().addChat(chat);
    router.push(`/chat/${chat.id}`);
  }

  async function handleDelete(e: React.MouseEvent, chatId: string) {
    e.preventDefault();
    e.stopPropagation();
    await api.chats.delete(chatId).catch(() => {});
    removeChat(chatId);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-white">История чатов</h1>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={handleNewChat}
          className="flex items-center gap-2 px-3 py-1.5 bg-accent rounded-lg text-white text-sm font-medium focus:outline-none"
        >
          <PlusIcon size={16} />
          Новый чат
        </motion.button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-[rgba(255,255,255,0.3)] gap-3">
            <ChatIcon size={40} />
            <p className="text-sm">Нет чатов. Начни новый!</p>
          </div>
        )}

        {groups.map(({ label, chats }) => (
          <div key={label}>
            <p className="text-[10px] uppercase tracking-widest text-[rgba(255,255,255,0.3)] px-2 mb-1">
              {label}
            </p>
            <div className="space-y-0.5">
              {chats.map((chat) => (
                <motion.div
                  key={chat.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => router.push(`/chat/${chat.id}`)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer group transition-colors',
                    'hover:bg-[var(--bg-elevated)] active:bg-[var(--bg-elevated)]'
                  )}
                >
                  <ChatIcon size={15} className="text-[rgba(255,255,255,0.3)] flex-shrink-0" />
                  <span className="flex-1 text-sm text-[rgba(255,255,255,0.8)] truncate">
                    {truncate(chat.title, 40)}
                  </span>
                  <button
                    onClick={(e) => handleDelete(e, chat.id)}
                    className="opacity-0 group-hover:opacity-100 active:opacity-100 text-[rgba(255,255,255,0.3)] hover:text-red-400 transition-all focus:outline-none p-1"
                  >
                    <TrashIcon size={14} />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
