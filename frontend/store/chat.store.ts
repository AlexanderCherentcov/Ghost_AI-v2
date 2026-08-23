import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Chat, Message } from '@/lib/api';

interface ChatState {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Message[];
  isStreaming: boolean;
  streamContent: string;
  // id модели чата из реестра (config/models.ts на бэкенде), 'auto' по умолчанию.
  // Персистится в localStorage — выбор пользователя переживает перезагрузку страницы.
  model: string;

  setChats: (chats: Chat[]) => void;
  addChat: (chat: Chat) => void;
  updateChat: (chatId: string, data: Partial<Chat>) => void;
  removeChat: (chatId: string) => void;
  setActiveChat: (chat: Chat | null) => void;

  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  appendStreamToken: (token: string) => void;
  commitStream: (message: Message) => void;
  setStreaming: (streaming: boolean) => void;
  clearStream: () => void;

  setModel: (model: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      chats: [],
      activeChat: null,
      messages: [],
      isStreaming: false,
      streamContent: '',
      model: 'auto',

      setChats: (chats) => set({ chats }),

      addChat: (chat) =>
        set((s) => ({ chats: [chat, ...s.chats], activeChat: chat })),

      updateChat: (chatId, data) =>
        set((s) => ({
          chats: s.chats.map((c) => (c.id === chatId ? { ...c, ...data } : c)),
          activeChat: s.activeChat?.id === chatId ? { ...s.activeChat, ...data } : s.activeChat,
        })),

      removeChat: (chatId) =>
        set((s) => ({
          chats: s.chats.filter((c) => c.id !== chatId),
          activeChat: s.activeChat?.id === chatId ? null : s.activeChat,
        })),

      // [M-14] НЕ сбрасываем messages здесь — избегаем гонки при быстром переключении чатов.
      // За вызов setMessages([]) отвечает компонент страницы (ChatIdPage) — после того,
      // как подтвердится, что сообщения нового чата загружены.
      setActiveChat: (chat) => set({ activeChat: chat }),

      setMessages: (messages) => set({ messages }),

      addMessage: (message) =>
        set((s) => ({ messages: [...s.messages, message] })),

      appendStreamToken: (token) =>
        set((s) => ({ streamContent: s.streamContent + token })),

      commitStream: (message) =>
        set((s) => ({
          messages: [...s.messages, message],
          streamContent: '',
          isStreaming: false,
        })),

      setStreaming: (isStreaming) => set({ isStreaming }),
      clearStream: () => set({ streamContent: '', isStreaming: false }),

      setModel: (model) => set({ model }),
    }),
    {
      name: 'ghost-chat-prefs',
      // Персистим только выбор модели — chats/messages/streaming живут за пределами localStorage.
      partialize: (s) => ({ model: s.model }),
    }
  )
);
