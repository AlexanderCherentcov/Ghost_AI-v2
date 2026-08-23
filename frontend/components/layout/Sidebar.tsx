'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon, SettingsIcon, TrashIcon, EditIcon,
} from '@/components/icons';
import { CasperCoin } from '@/components/icons';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { useUIStore } from '@/store/ui.store';
import { api, type Chat } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { truncate, formatNumber, cn } from '@/lib/utils';

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
  const { show } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const caspersBalance = user?.caspers_balance ?? 0;

  // Стандартный чат безлимитный на всех тарифах (включая FREE) — платный счётчик
  // здесь всегда про Caspers, дневного лимита сообщений больше нет ни у кого.
  const tokenPercent = 0; // не используется для платных тарифов
  const balanceLabel = `${formatNumber(caspersBalance)} Caspers`;

  const grouped = groupChats(chats);

  function handleNewChat() {
    // Сбрасываем стор, чтобы сайдбар не продолжал подсвечивать старый чат
    useChatStore.getState().setActiveChat(null);
    useChatStore.getState().setMessages([]);
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
        useChatStore.getState().setActiveChat(null);
        useChatStore.getState().setMessages([]);
        router.push('/chat');
      }
    } catch {
      // молча игнорируем — чат остаётся в списке
    }
  }

  async function handleRenameChat(chatId: string) {
    if (!editTitle.trim()) return;
    try {
      await api.chats.update(chatId, { title: editTitle });
      updateChat(chatId, { title: editTitle });
    } catch (err: any) {
      show(err.message ?? 'Не удалось переименовать чат', 'error');
    } finally {
      setEditingId(null);
    }
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
        <p className="text-[11px] font-bold uppercase tracking-wider px-3 mb-1.5" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
        {items.map((chat) => (
          <div
            key={chat.id}
            className={cn(
              'group flex items-center gap-2 px-3 rounded-xl text-sm transition-all relative',
              activeChat?.id !== chat.id && 'hover:bg-[var(--bg-elevated)]'
            )}
            style={{
              color: 'var(--text-primary)',
              background: activeChat?.id === chat.id ? 'rgba(123,92,240,.14)' : undefined,
            }}
          >
            {/* Кликабельная область заголовка */}
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
                  style={{ color: 'var(--text-primary)', fontSize: '16px' }}
                  onClick={(e) => e.preventDefault()}
                />
              ) : (
                <span className="block truncate">{truncate(chat.title, 28)}</span>
              )}
            </Link>
            {/* Кнопки действий — всегда видны на мобильных, на десктопе только при наведении */}
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
      className="flex flex-col h-screen border-r flex-shrink-0 overflow-hidden"
      style={{ position: 'fixed', top: 0, left: 0, zIndex: 40, background: 'var(--panel-glass-sidebar)', borderColor: 'var(--panel-glass-border)', WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)' }}
    >
      {/* Лого + переключатель — две разные раскладки, чтобы избежать обрезки при переполнении */}
      {sidebarOpen ? (
        <div className="flex items-center gap-3 px-4 pt-5 pb-4 min-w-0">
          <Link href="/chat" className="flex items-center gap-3 min-w-0 flex-1">
            <img
              src="/ghostline-logo-icon.png"
              alt="GhostLine"
              className="w-7 h-7 rounded-[7px] object-cover flex-shrink-0"
              style={{ filter: 'drop-shadow(0 0 8px rgba(123,92,240,.5))' }}
            />
            <span className="font-display text-base font-bold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>GhostLine</span>
          </Link>
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
          <Link href="/chat">
            <img
              src="/ghostline-logo-icon.png"
              alt="GhostLine"
              className="w-[22px] h-[22px] rounded-[6px] object-cover"
              style={{ filter: 'drop-shadow(0 0 8px rgba(123,92,240,.5))' }}
            />
          </Link>
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

      {/* Новый чат */}
      <div className="px-3 mb-4">
        <button
          onClick={handleNewChat}
          className={cn(
            'w-full flex items-center border font-semibold transition-all',
            sidebarOpen ? 'gap-2 justify-start' : 'justify-center p-2.5 rounded-xl'
          )}
          style={
            sidebarOpen
              ? { color: '#e3ddfa', borderColor: 'var(--accent-border)', background: 'var(--accent-dim)', padding: '11px 14px', borderRadius: '11px', fontSize: '13.5px' }
              : { color: '#e3ddfa', borderColor: 'var(--accent-border)', background: 'var(--accent-dim)' }
          }
          aria-label="Новый чат"
        >
          <PlusIcon size={16} className="flex-shrink-0" />
          {sidebarOpen && <span>Новый чат</span>}
        </button>
      </div>

      {/* Разделитель */}
      <div className="mx-3 border-t mb-4" style={{ borderColor: 'var(--panel-glass-border)' }} />

      {/* История чатов — скрыта в свёрнутом виде */}
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

      {/* Низ: единая glass-панель — баланс/прогресс + юзер-карточка */}
      <div className="p-3">
        <div
          className="rounded-[11px]"
          style={{ background: 'var(--panel-glass)', border: '1px solid var(--panel-glass-border)' }}
        >
          {/* Полоса токенов — только в развёрнутом виде */}
          {sidebarOpen && (
            <div className="px-3 pt-2.5 pb-2 border-b" style={{ borderColor: 'var(--panel-glass-border)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <CasperCoin size={14} />
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

          {/* Информация о пользователе */}
          <div className={cn('flex items-center p-2.5', sidebarOpen ? 'gap-3' : 'justify-center')}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name ?? 'User'} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-teal))' }}>
                <span className="text-xs text-white font-medium">{user?.name?.[0]?.toUpperCase() ?? 'G'}</span>
              </div>
            )}
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{user?.name ?? 'Ghost'}</p>
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
      </div>
    </motion.aside>
  );
}
