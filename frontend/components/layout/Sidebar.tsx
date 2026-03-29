'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { GhostIcon } from '@/components/icons/GhostIcon';
import {
  PlusIcon, TokenIcon, SettingsIcon, TrashIcon, EditIcon,
} from '@/components/icons';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { useUIStore } from '@/store/ui.store';
import { api, type Chat } from '@/lib/api';
import { truncate } from '@/lib/utils';
import { cn } from '@/lib/utils';

function groupChats(chats: Chat[]) {
  const now = Date.now();
  const day = 86400000;

  const today: typeof chats = [];
  const yesterday: typeof chats = [];
  const week: typeof chats = [];
  const older: typeof chats = [];

  for (const chat of chats) {
    const diff = now - new Date(chat.updatedAt).getTime();
    if (diff < day) today.push(chat);
    else if (diff < 2 * day) yesterday.push(chat);
    else if (diff < 7 * day) week.push(chat);
    else older.push(chat);
  }

  return { today, yesterday, week, older };
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();
  const { chats, activeChat, addChat, updateChat, removeChat } = useChatStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const plan = user?.plan ?? 'FREE';
  const isDaily = plan === 'FREE' || plan === 'PRO' || plan === 'ULTRA';
  const todayUsed = user?.messagesToday ?? 0;
  const todayLimit = plan === 'FREE' ? 10 : plan === 'PRO' ? 200 : 400;
  const tokenPercent = isDaily
    ? Math.min((todayUsed / todayLimit) * 100, 100)
    : Math.min(((user?.messagesUsed ?? 0) / Math.max(user?.messagesLimit ?? 1, 1)) * 100, 100);
  const balanceLabel = isDaily
    ? `${todayUsed}/${todayLimit} сегодня`
    : `${user?.messagesUsed ?? 0}/${user?.messagesLimit ?? 0} сообщ.`;

  const grouped = groupChats(chats);

  function handleNewChat() {
    sessionStorage.setItem('newChat', '1');
    router.push('/chat');
  }

  async function handleDeleteChat(chatId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await api.chats.delete(chatId);
    removeChat(chatId);
    if (pathname === `/chat/${chatId}`) router.push('/chat');
  }

  async function handleRenameChat(chatId: string) {
    if (!editTitle.trim()) return;
    await api.chats.update(chatId, { title: editTitle });
    updateChat(chatId, { title: editTitle });
    setEditingId(null);
  }

  function startEdit(chatId: string, currentTitle: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(chatId);
    setEditTitle(currentTitle);
  }

  function ChatSection({ label, items }: { label: string; items: typeof chats }) {
    if (!items.length) return null;
    return (
      <div className="mb-3">
        <p className="text-[11px] uppercase tracking-wider text-[rgba(255,255,255,0.2)] px-3 mb-1">
          {label}
        </p>
        {items.map((chat) => (
          <Link
            key={chat.id}
            href={`/chat/${chat.id}`}
            className={cn(
              'group flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all relative',
              activeChat?.id === chat.id
                ? 'bg-[var(--bg-elevated)] border-l-2 border-accent text-[rgba(255,255,255,0.9)]'
                : 'text-[rgba(255,255,255,0.45)] hover:bg-[var(--bg-elevated)] hover:text-[rgba(255,255,255,0.7)]'
            )}
          >
            {editingId === chat.id ? (
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => handleRenameChat(chat.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameChat(chat.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="flex-1 bg-transparent outline-none text-sm"
                onClick={(e) => e.preventDefault()}
              />
            ) : (
              <span className="flex-1 truncate">{truncate(chat.title, 35)}</span>
            )}
            <span className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
              <button
                onClick={(e) => startEdit(chat.id, chat.title, e)}
                className="p-1 hover:text-white transition-colors"
              >
                <EditIcon size={14} />
              </button>
              <button
                onClick={(e) => handleDeleteChat(chat.id, e)}
                className="p-1 hover:text-red-400 transition-colors"
              >
                <TrashIcon size={14} />
              </button>
            </span>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <motion.aside
      animate={{ width: sidebarOpen ? 260 : 60 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex flex-col h-screen bg-[var(--bg-surface)] border-r border-[var(--border)] flex-shrink-0 overflow-hidden"
      style={{ position: 'fixed', top: 0, left: 0, zIndex: 40 }}
    >
      {/* Logo + toggle — two different layouts to avoid overflow clipping */}
      {sidebarOpen ? (
        <div className="flex items-center gap-3 px-4 pt-5 pb-4 min-w-0">
          <GhostIcon size={24} className="text-accent flex-shrink-0" />
          <span className="text-base font-medium tracking-tight text-white truncate flex-1">GhostLine</span>
          <button
            onClick={toggleSidebar}
            className="text-[rgba(255,255,255,0.3)] hover:text-white transition-colors flex-shrink-0"
            title="Свернуть"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center pt-4 pb-3 gap-3">
          <GhostIcon size={22} className="text-accent" />
          <button
            onClick={toggleSidebar}
            className="text-[rgba(255,255,255,0.3)] hover:text-white transition-colors"
            title="Развернуть"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* New Chat */}
      <div className="px-3 mb-4">
        <button
          onClick={handleNewChat}
          className={cn(
            'w-full flex items-center rounded-xl border border-[var(--border)] text-sm text-[rgba(255,255,255,0.55)] hover:bg-[var(--bg-elevated)] hover:text-white transition-all',
            sidebarOpen ? 'gap-2 px-4 py-2.5 justify-start' : 'justify-center p-2.5'
          )}
        >
          <PlusIcon size={16} className="flex-shrink-0" />
          {sidebarOpen && <span>Новый чат</span>}
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-[var(--border)] mb-4" />

      {/* Chat history — hidden when collapsed */}
      {sidebarOpen && (
        <div className="flex-1 overflow-y-auto px-3 min-h-0">
          <ChatSection label="Сегодня"    items={grouped.today} />
          <ChatSection label="Вчера"      items={grouped.yesterday} />
          <ChatSection label="Эта неделя" items={grouped.week} />
          <ChatSection label="Ранее"      items={grouped.older} />
          {!chats.length && (
            <p className="text-xs text-[rgba(255,255,255,0.2)] text-center mt-4">
              История пустая
            </p>
          )}
        </div>
      )}
      {!sidebarOpen && <div className="flex-1" />}

      {/* Bottom */}
      <div className="p-3 border-t border-[var(--border)]">
        {/* Token bar — only when expanded */}
        {sidebarOpen && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs text-[rgba(255,255,255,0.4)]">
                <TokenIcon size={12} className="text-accent" />
                <span>{balanceLabel}</span>
              </div>
              <Link href="/billing" className="text-[11px] text-accent hover:opacity-80 transition-opacity">
                + Купить
              </Link>
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
        )}

        {/* User info */}
        <div className={cn('flex items-center', sidebarOpen ? 'gap-3' : 'justify-center')}>
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name ?? 'User'} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-accent font-medium">{user?.name?.[0]?.toUpperCase() ?? 'G'}</span>
            </div>
          )}
          {sidebarOpen && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{user?.name ?? 'Ghost'}</p>
                <p className="text-[11px] text-[rgba(255,255,255,0.3)] uppercase tracking-wider">{user?.plan ?? 'FREE'}</p>
              </div>
              <Link href="/settings" className="text-[rgba(255,255,255,0.3)] hover:text-white transition-colors">
                <SettingsIcon size={16} />
              </Link>
            </>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
