import { create } from 'zustand';
import type { Chat, Message } from '@/lib/api';

interface ChatState {
  chats: Chat[];
  activeChat: Chat | null;
  messages: Message[];
  isStreaming: boolean;
  streamContent: string;
  mode: 'chat' | 'vision' | 'sound' | 'reel' | 'think';

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

  setMode: (mode: ChatState['mode']) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  chats: [],
  activeChat: null,
  messages: [],
  isStreaming: false,
  streamContent: '',
  mode: 'chat',

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

  setActiveChat: (chat) => set({ activeChat: chat, messages: [] }),

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

  setMode: (mode) => set({ mode }),
}));
