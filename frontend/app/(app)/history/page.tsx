'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { GhostIcon } from '@/components/icons/GhostIcon';
import { PlusIcon, EditIcon, TrashIcon, TokenIcon } from '@/components/icons';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { api, type Chat } from '@/lib/api';
import { formatTokens, truncate, cn } from '@/lib/utils';

function groupChats(chats: Chat[]) {
  const now = Date.now();
  const day = 86400000;
  const today: Chat[] = [], yesterday: Chat[] = [], week: Chat[] = [], older: Chat[] = [];
  for (const chat of chats) {
    const diff = now - new Date(chat.updatedAt).getTime();
    if (diff < day) today.push(chat);
    else if (diff < 2 * day) yesterday.push(chat);
    else if (diff < 7 * day) week.push(chat);
    else older.push(chat);
  }
  return { today, yesterday, week, older };
}

export default function HistoryPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { chats, updateChat, removeChat } = useChatStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const balance = (user?.balanceChat ?? 0) + (user?.balanceImages ?? 0) + (user?.balanceDocs ?? 0) + (user?.balanceCode ?? 0)
    + (user?.addonChat ?? 0) + (user?.addonImages ?? 0) + (user?.addonDocs ?? 0) + (user?.addonCode ?? 0);
  const tokenPercent = Math.min((balance / 8000) * 100, 100);
  const grouped = groupChats(chats);

  function handleNewChat() {
    router.push('/chat');
  }

  async function handleDelete(chatId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await api.chats.delete(chatId);
    removeChat(chatId);
  }

  async function handleRename(chatId: string) {
    if (!editTitle.trim()) return;
    await api.chats.update(chatId, { title: editTitle });
    updateChat(chatId, { title: editTitle });
    setEditingId(null);
  }

  function Section({ label, items }: { label: string; items: Chat[] }) {
    if (!items.length) return null;
    return (
      <div className="mb-4">
        <p className="text-[11px] uppercase tracking-wider text-[rgba(255,255,255,0.25)] px-4 mb-2">
          {label}
        </p>
        {items.map((chat) => (
          <div key={chat.id} className="px-3 py-0.5">
            {editingId === chat.id ? (
              <div className="flex items-center gap-2 bg-[var(--bg-elevated)] rounded-xl px-4 py-3 border border-accent/40">
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => handleRename(chat.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(chat.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 bg-transparent text-sm text-white"
                />
              </div>
            ) : (
              <Link
                href={`/chat/${chat.id}`}
                className="flex items-center bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl px-4 py-3 active:bg-[var(--bg-elevated)] transition-colors"
              >
                <span className="text-sm text-[rgba(255,255,255,0.75)] truncate flex-1 pr-2">
                  {truncate(chat.title, 38)}
                </span>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setEditingId(chat.id);
                      setEditTitle(chat.title);
                    }}
                    className="p-1.5 text-[rgba(255,255,255,0.3)] active:text-white"
                  >
                    <EditIcon size={15} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(chat.id, e)}
                    className="p-1.5 text-[rgba(255,255,255,0.3)] active:text-red-400"
                  >
                    <TrashIcon size={15} />
                  </button>
                </div>
              </Link>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4 border-b border-[var(--border)]">
        <GhostIcon size={22} className="text-accent" />
        <span className="text-base font-medium text-white tracking-tight">Чаты</span>
        <button
          onClick={handleNewChat}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 text-accent text-sm"
        >
          <PlusIcon size={14} />
          Новый
        </button>
      </div>

      {/* Token bar */}
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 text-xs text-[rgba(255,255,255,0.4)]">
            <TokenIcon size={12} className="text-accent" />
            <span>{formatTokens(balance)} токенов</span>
          </div>
          <Link href="/billing" className="text-[11px] text-accent">+ Купить</Link>
        </div>
        <div className="h-1 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-accent rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${tokenPercent}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto py-3">
        <Section label="Сегодня"    items={grouped.today} />
        <Section label="Вчера"      items={grouped.yesterday} />
        <Section label="Эта неделя" items={grouped.week} />
        <Section label="Ранее"      items={grouped.older} />

        {!chats.length && (
          <div className="flex flex-col items-center justify-center mt-20 gap-3">
            <GhostIcon size={48} className="text-[rgba(255,255,255,0.08)]" />
            <p className="text-sm text-[rgba(255,255,255,0.25)]">История пустая</p>
            <button
              onClick={handleNewChat}
              className="mt-2 px-4 py-2 rounded-xl bg-accent/10 text-accent text-sm"
            >
              Начать первый чат
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
