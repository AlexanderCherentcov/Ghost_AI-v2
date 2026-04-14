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
  const isUnlimitedChat = plan === 'PRO' || plan === 'ULTRA';
  const imagesUsed  = user?.images_today ?? 0;
  const imagesLimit = user?.images_daily_limit ?? 0;
  const videoUsed   = user?.videos_today ?? 0;
  const videoLimit  = user?.videos_daily_limit ?? 0;
  const stdToday    = user?.std_messages_today ?? 0;
  const stdLimit    = user?.std_messages_daily_limit ?? 10;

  // FREE/TRIAL: show std message progress; paid: show images progress
  const showMsgProgress = plan === 'FREE' || plan === 'TRIAL';
  const tokenPercent = showMsgProgress
    ? Math.min(stdLimit > 0 ? (stdToday / stdLimit) * 100 : 0, 100)
    : Math.min(imagesLimit > 0 ? (imagesUsed / imagesLimit) * 100 : 0, 100);

  const balanceLabel = showMsgProgress
    ? `${stdToday}/${stdLimit} сегодня`
    : `${imagesUsed}/${imagesLimit} картинок`;

  const grouped = groupChats(chats);

  function handleNewChat() {
    sessionStorage.setItem('newChat', '1');
    router.push('/chat');
  }

  async function handleDeleteChat(chatId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.chats.delete(chatId);
      removeChat(chatId);
      if (pathname === `/chat/${chatId}`) {
        localStorage.removeItem('lastChatId');
        sessionStorage.setItem('newChat', '1');
        router.push('/chat');
      }
    } catch {
      // silently ignore — chat stays in list
    }
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
        <p className="text-[11px] uppercase tracking-wider px-3 mb-1" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
        {items.map((chat) => (
          <div
            key={chat.id}
            className={cn(
              'group flex items-center gap-2 px-3 rounded-xl text-sm transition-all relative',
              activeChat?.id === chat.id
                ? 'bg-[var(--bg-elevated)] border-l-2 border-accent'
                : 'hover:bg-[var(--bg-elevated)]'
            )}
            style={{
              color: activeChat?.id === chat.id ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {/* Clickable title area */}
            <Link
              href={`/chat/${chat.id}`}
              className="flex-1 min-w-0 py-2.5"
              style={{ color: 'inherit' }}
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
                  className="w-full bg-transparent outline-none text-sm"
                  style={{ color: 'var(--text-primary)' }}
                  onClick={(e) => e.preventDefault()}
                />
              ) : (
                <span className="block truncate">{truncate(chat.title, 28)}</span>
              )}
            </Link>
            {/* Action buttons — always visible on mobile, hover-only on desktop */}
            <span className="flex items-center gap-0.5 flex-shrink-0 md:opacity-0 md:group-hover:opacity-60 transition-opacity">
              <button
                onClick={(e) => startEdit(chat.id, chat.title, e)}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:opacity-100 active:bg-[var(--bg-elevated)]"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Переименовать"
              >
                <EditIcon size={15} />
              </button>
              <button
                onClick={(e) => handleDeleteChat(chat.id, e)}
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:text-red-400 transition-colors active:bg-red-500/10"
                style={{ color: 'var(--text-secondary)' }}
                aria-label="Удалить"
              >
                <TrashIcon size={15} />
              </button>
            </span>
          </div>
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
          <span className="text-base font-medium tracking-tight truncate flex-1" style={{ color: 'var(--text-primary)' }}>GhostLine</span>
          <button
            onClick={toggleSidebar}
            className="transition-colors flex-shrink-0 hover:opacity-100 opacity-40"
            style={{ color: 'var(--text-primary)' }}
            title="Свернуть"
            aria-label="Свернуть боковую панель"
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
            className="transition-colors hover:opacity-100 opacity-40"
            style={{ color: 'var(--text-primary)' }}
            title="Развернуть"
            aria-label="Развернуть боковую панель"
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
            'w-full flex items-center rounded-xl border border-[var(--border)] text-sm hover:bg-[var(--bg-elevated)] transition-all',
            sidebarOpen ? 'gap-2 px-4 py-2.5 justify-start' : 'justify-center p-2.5'
          )}
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Новый чат"
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
            <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
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
          <div className="mb-3 space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
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
            {/* Videos for PRO/ULTRA */}
            {isUnlimitedChat && videoLimit > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{videoUsed}/{videoLimit} видео</span>
                </div>
                <div className="h-1 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent/60 rounded-full"
                    style={{ width: `${Math.min((videoUsed / videoLimit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
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
                <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{user?.name ?? 'Ghost'}</p>
                <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{user?.plan ?? 'FREE'}</p>
              </div>
              <Link
                href="/settings"
                className="transition-colors opacity-40 hover:opacity-100 flex-shrink-0"
                style={{ color: 'var(--text-primary)' }}
                title="Настройки"
                aria-label="Открыть настройки"
              >
                <SettingsIcon size={16} />
              </Link>
            </>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
