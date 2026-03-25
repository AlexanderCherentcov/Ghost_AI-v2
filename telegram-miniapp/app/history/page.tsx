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

  useEffect(() => {
    apiRequest<{ chats: Chat[] }>('/chats')
      .then(({ chats }) => setChats(chats))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleNew() {
    router.push('/chat');
  }

  async function handleDelete(chatId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await apiRequest(`/chats/${chatId}`, { method: 'DELETE' });
    setChats((prev) => prev.filter((c) => c.id !== chatId));
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
                className="flex items-center rounded-xl px-4 py-3"
                style={{ background: '#0E0E1A', border: '1px solid rgba(255,255,255,0.07)' }}
                onClick={() => router.push(`/chat?id=${chat.id}`)}
              >
                <span
                  className="flex-1 text-sm truncate pr-2"
                  style={{ color: 'rgba(255,255,255,0.75)' }}
                >
                  {chat.title.length > 38 ? chat.title.slice(0, 38) + '…' : chat.title}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(chat.id);
                    setEditTitle(chat.title);
                  }}
                  className="p-1.5"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  ✏️
                </button>
                <button
                  onClick={(e) => handleDelete(chat.id, e)}
                  className="p-1.5"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  🗑
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen pb-[60px]" style={{ background: '#06060B', color: 'white' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pt-5 pb-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <span className="text-base font-medium tracking-tight flex-1">История чатов</span>
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
