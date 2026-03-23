'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TelegramProvider, useTg } from '@/components/TelegramProvider';
import { BottomNav } from '@/components/BottomNav';
import { apiRequest, getToken } from '@/lib/auth';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokensCost?: number;
  cacheHit?: boolean;
}

// Auto-derive WS URL from API URL so only NEXT_PUBLIC_API_URL is needed
const _api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL
  ?? _api.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');

export default function TgChatPage() {
  return (
    <TelegramProvider>
      <ChatApp />
    </TelegramProvider>
  );
}

function ChatApp() {
  const tg = useTg();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  // Init chat
  useEffect(() => {
    apiRequest<{ id: string }>('/chats', {
      method: 'POST',
      body: JSON.stringify({ mode: 'chat' }),
    }).then((chat) => setChatId(chat.id)).catch(() => {});
  }, []);

  // WS
  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/api/chat/stream`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const chunk = JSON.parse(e.data);
      if (chunk.type === 'token' && chunk.data) {
        setStreamContent((prev) => prev + chunk.data);
      }
      if (chunk.type === 'done') {
        setStreamContent((prev) => {
          const content = prev;
          setMessages((msgs) => [
            ...msgs,
            {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content,
              tokensCost: chunk.tokensCost,
              cacheHit: chunk.cacheHit,
            },
          ]);
          return '';
        });
        setStreaming(false);
        tg?.HapticFeedback.notificationOccurred('success');
      }
      if (chunk.type === 'error') {
        setStreaming(false);
        setStreamContent('');
        if (chunk.code === 'INSUFFICIENT_TOKENS') {
          tg?.showAlert('Недостаточно токенов! Пополните баланс.', () => {
            router.push('/balance');
          });
          tg?.HapticFeedback.notificationOccurred('error');
        }
      }
    };

    return () => ws.close();
  }, []);

  const handleSend = useCallback(() => {
    const prompt = input.trim();
    if (!prompt || streaming || !chatId) return;

    tg?.HapticFeedback.impactOccurred('medium');

    setMessages((msgs) => [
      ...msgs,
      { id: `tmp-${Date.now()}`, role: 'user', content: prompt },
    ]);
    setInput('');
    setStreaming(true);

    const token = getToken() ?? '';
    wsRef.current?.send(JSON.stringify({
      chatId,
      mode: 'chat',
      prompt,
      history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      jwt: token,
    }));
  }, [input, streaming, chatId, messages, tg]);

  const isEmpty = !messages.length && !streaming;

  return (
    <div className="flex flex-col h-screen bg-[#0A0A12]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
        <span className="text-lg">👻</span>
        <span className="font-medium text-sm text-white">GhostLine Chat</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-[120px]">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="text-5xl mb-4 animate-float">👻</div>
            <p className="text-white font-medium mb-1">Чем займёмся?</p>
            <p className="text-xs text-[rgba(255,255,255,0.3)]">Напишите что-нибудь</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start gap-2'}`}
              >
                {msg.role === 'assistant' && <span className="text-base flex-shrink-0">👻</span>}
                <div
                  className={`max-w-[85%] text-sm rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-[#13131F] text-[rgba(255,255,255,0.88)] rounded-tr-sm'
                      : 'prose-ghost'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {streaming && streamContent && (
          <div className="flex gap-2 mb-4">
            <span className="text-base flex-shrink-0">👻</span>
            <div className="max-w-[85%] text-sm prose-ghost">
              <span>{streamContent}</span>
              <span className="ghost-cursor" />
            </div>
          </div>
        )}

        {streaming && !streamContent && (
          <div className="flex gap-2 mb-4 items-center">
            <span className="text-base">👻</span>
            <div className="flex gap-1">
              {[0,1,2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 bg-[#7B5CF0] rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="fixed bottom-[60px] left-0 right-0 px-3 py-2 bg-[#0A0A12] border-t border-[rgba(255,255,255,0.06)]">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="Сообщение..."
            className="flex-1 h-11 text-sm"
            disabled={streaming}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="w-11 h-11 rounded-xl bg-[#7B5CF0] text-white flex items-center justify-center disabled:opacity-40 flex-shrink-0"
          >
            ↑
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
