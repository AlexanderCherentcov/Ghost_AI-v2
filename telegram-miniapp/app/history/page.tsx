'use client';


import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TelegramProvider } from '@/components/TelegramProvider';
import { BottomNav } from '@/components/BottomNav';
import { apiRequest } from '@/lib/auth';

interface Chat {
  id: string;
  title: string;
  updatedAt: string;
}

function groupChats(chats: Chat[]) {
  const now = Date.now();
  const day = 86400000;
  const today: Chat[] = [], yesterday: Chat[] = [], older: Chat[] = [];
  for (const chat of chats) {
    const diff = now - new Date(chat.updatedAt).getTime();
    if (diff < day) today.push(chat);
    else if (diff < 2 * day) yesterday.push(chat);
    else older.push(chat);
  }
  return { today, yesterday, older };
}

function HistoryApp() {
  const router = useRouter();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ chats: Chat[] }>('/chats')
      .then(({ chats }) => setChats(chats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleNew() {
    try {
      const chat = await apiRequest<{ id: string; title: string; updatedAt: string }>('/chats', {
        method: 'POST',
        body: JSON.stringify({ mode: 'chat' }),
      });
      router.push(`/chat?id=${chat.id}`);
    } catch {
      router.push('/chat');
    }
  }

  async function handleRename(chatId: string) {
    if (!editTitle.trim()) return;
    await apiRequest(`/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: editTitle }),
    });
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title: editTitle } : c)));
    setEditingId(null);
  }

  async function handleDelete(chatId: string) {
    setDeletingId(chatId);
    setDeleteError(null);
    try {
      await apiRequest(`/chats/${chatId}`, { method: 'DELETE' });
      setChats((prev) => prev.filter((c) => c.id !== chatId));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка удаления';
      setDeleteError(msg);
      setTimeout(() => setDeleteError(null), 3000);
    } finally {
      setDeletingId(null);
    }
  }

  const grouped = groupChats(chats);

  function Section({ label, items }: { label: string; items: Chat[] }) {
    if (!items.length) return null;
    return (
      <div className="mb-4">
        <p className="text-[11px] uppercase tracking-wider px-4 mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {label}
        </p>
        {items.map((chat) => (
          <div key={chat.id} className="px-3 py-0.5">
            {editingId === chat.id ? (
              <div
                className="flex items-center px-4 py-3 rounded-xl"
                style={{ background: '#1A1A2E', border: '1px solid rgba(123,92,240,0.4)' }}
              >
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => handleRename(chat.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(chat.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 bg-transparent text-sm"
                  style={{ color: 'white' }}
                />
              </div>
            ) : (
              <div
                className="flex items-center rounded-xl px-3 py-2 gap-0"
                style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
                onClick={() => router.push(`/chat?id=${chat.id}`)}
              >
                <span
                  className="flex-1 text-sm truncate px-1"
                  style={{ color: 'rgba(255,255,255,0.75)' }}
                >
                  {chat.title.length > 34 ? chat.title.slice(0, 34) + '…' : chat.title}
                </span>
                {/* Rename button — 44×44 touch target */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(chat.id);
                    setEditTitle(chat.title);
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                  className="flex-shrink-0 flex items-center justify-center transition-opacity active:opacity-60"
                  style={{ width: 44, height: 44, color: 'rgba(255,255,255,0.35)' }}
                  title="Переименовать"
                >
                  <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                    <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  </svg>
                </button>
                {/* Delete button — 44×44 touch target */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(chat.id);
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                  disabled={deletingId === chat.id}
                  className="flex-shrink-0 flex items-center justify-center disabled:opacity-30 transition-opacity active:opacity-60"
                  style={{ width: 44, height: 44, color: 'rgba(255,80,80,0.7)' }}
                  title="Удалить"
                >
                  <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                    <path d="M2 3.5h10M5 3.5V2.5h4v1M5.5 6v4.5M8.5 6v4.5M3 3.5l.5 8h7l.5-8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen pb-[60px]" style={{ background: 'var(--bg-void)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pt-5 pb-4"
        style={{ borderBottom: '0.5px solid var(--border)' }}
      >
        <span className="text-base font-medium tracking-tight flex-1">
          {deleteError ? <span style={{ color: '#f87171', fontSize: 13 }}>{deleteError}</span> : 'История чатов'}
        </span>
        <button
          onClick={handleNew}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm"
          style={{ background: 'rgba(123,92,240,0.12)', color: '#7B5CF0' }}
        >
          + Новый
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-3">
        {loading ? (
          <p className="text-center text-sm mt-10" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Загрузка...
          </p>
        ) : (
          <>
            <Section label="Сегодня" items={grouped.today} />
            <Section label="Вчера" items={grouped.yesterday} />
            <Section label="Ранее" items={grouped.older} />
            {!chats.length && (
              <div className="flex flex-col items-center mt-20 gap-3">
                <span className="text-4xl">👻</span>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  История пустая
                </p>
                <button
                  onClick={handleNew}
                  className="mt-2 px-4 py-2 rounded-xl text-sm"
                  style={{ background: 'rgba(123,92,240,0.12)', color: '#7B5CF0' }}
                >
                  Начать первый чат
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

export default function HistoryPage() {
  return (
    <TelegramProvider>
      <HistoryApp />
    </TelegramProvider>
  );
}
