'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { GhostIcon } from '@/components/icons/GhostIcon';
import {
  ChatIcon, VisionIcon, SoundIcon, ReelIcon, ThinkIcon,
  PlusIcon, TokenIcon, SettingsIcon, TrashIcon, EditIcon,
} from '@/components/icons';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { api } from '@/lib/api';
import { formatTokens, truncate } from '@/lib/utils';
import { cn } from '@/lib/utils';

const MODES = [
  { id: 'chat',   label: 'Chat',   href: '/chat',   Icon: ChatIcon },
  { id: 'vision', label: 'Vision', href: '/vision', Icon: VisionIcon },
  { id: 'sound',  label: 'Sound',  href: '/sound',  Icon: SoundIcon },
  { id: 'reel',   label: 'Reel',   href: '/reel',   Icon: ReelIcon },
  { id: 'think',  label: 'Think',  href: '/think',  Icon: ThinkIcon },
] as const;

function groupChats(chats: ReturnType<typeof useChatStore>['chats']) {
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const planTokens = {
    FREE: 50_000,
    PRO: 500_000,
    ULTRA: 2_000_000,
    TEAM: 10_000_000,
  };
  const maxTokens = planTokens[user?.plan ?? 'FREE'];
  const balance = user?.tokenBalance ?? 0;
  const tokenPercent = Math.min((balance / maxTokens) * 100, 100);

  const grouped = groupChats(chats);

  async function handleNewChat() {
    const chat = await api.chats.create({ mode: 'chat' });
    addChat(chat);
    router.push(`/chat/${chat.id}`);
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
    <aside
      className="flex flex-col w-[260px] h-screen bg-[var(--bg-surface)] border-r border-[var(--border)] flex-shrink-0"
      style={{ position: 'fixed', top: 0, left: 0, zIndex: 40 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <GhostIcon size={28} className="text-accent" />
        <span className="text-base font-medium tracking-tight text-white">GhostLine</span>
      </div>

      {/* New Chat */}
      <div className="px-3 mb-4">
        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[rgba(255,255,255,0.55)] hover:bg-[var(--bg-elevated)] hover:text-white transition-all"
        >
          <PlusIcon size={16} />
          <span>Новый чат</span>
        </button>
      </div>

      {/* Modes */}
      <div className="px-3 mb-4">
        <p className="text-[11px] uppercase tracking-wider text-[rgba(255,255,255,0.2)] px-0 mb-2">
          Режимы
        </p>
        {MODES.map(({ id, label, href, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={id}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all mb-0.5',
                isActive
                  ? 'bg-[var(--bg-elevated)] border-l-2 border-accent text-white pl-[10px]'
                  : 'text-[rgba(255,255,255,0.45)] hover:bg-[var(--bg-elevated)] hover:text-[rgba(255,255,255,0.7)]'
              )}
            >
              <Icon size={16} className={isActive ? 'text-accent' : ''} />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-[var(--border)] mb-4" />

      {/* Chat history */}
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

      {/* Bottom */}
      <div className="p-3 border-t border-[var(--border)]">
        {/* Token bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-xs text-[rgba(255,255,255,0.4)]">
              <TokenIcon size={12} className="text-accent" />
              <span>{formatTokens(balance)} / {formatTokens(maxTokens)}</span>
            </div>
            <Link
              href="/billing"
              className="text-[11px] text-accent hover:opacity-80 transition-opacity"
            >
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

        {/* User info */}
        <div className="flex items-center gap-3">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name ?? 'User'}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
              <span className="text-xs text-accent font-medium">
                {user?.name?.[0]?.toUpperCase() ?? 'G'}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{user?.name ?? 'Ghost'}</p>
            <p className="text-[11px] text-[rgba(255,255,255,0.3)] uppercase tracking-wider">
              {user?.plan ?? 'FREE'}
            </p>
          </div>
          <Link href="/settings" className="text-[rgba(255,255,255,0.3)] hover:text-white transition-colors">
            <SettingsIcon size={16} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
