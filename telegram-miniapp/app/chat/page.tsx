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
  mediaUrl?: string | null;
}

type ModelChoice = 'haiku' | 'deepseek';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL
  ?? API_URL.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');

const IMAGE_KEYWORDS = [
  'нарисуй', 'нарисовать', 'создай картинку', 'создать картинку',
  'сгенерируй', 'сгенерировать', 'generate image', 'draw', 'создай изображение',
  'создать изображение', 'нарисуй мне', 'хочу картинку', 'сделай картинку',
  'покажи картинку', 'изображение в стиле',
];

function isImageRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return IMAGE_KEYWORDS.some((kw) => lower.includes(kw));
}

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
  const [model, setModel] = useState<ModelChoice>('haiku');
  const [modelOpen, setModelOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  // Close model dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Init: load last chat or create new
  useEffect(() => {
    apiRequest<{ chats: Array<{ id: string }> }>('/chats')
      .then(async ({ chats }) => {
        if (chats.length > 0) {
          const id = chats[0].id;
          setChatId(id);
          const { messages: msgs } = await apiRequest<{ messages: Message[] }>(`/chats/${id}/messages`);
          setMessages(msgs);
        } else {
          const chat = await apiRequest<{ id: string }>('/chats', {
            method: 'POST',
            body: JSON.stringify({ mode: 'chat' }),
          });
          setChatId(chat.id);
        }
      })
      .catch(() => {});
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
        if (chunk.code === 'LIMIT_MESSAGES' || chunk.code === 'LIMIT_IMAGES') {
          tg?.showAlert('Лимит исчерпан! Пополните баланс.', () => {
            router.push('/balance');
          });
          tg?.HapticFeedback.notificationOccurred('error');
        }
      }
    };

    return () => ws.close();
  }, []);

  // ── Image generation ─────────────────────────────────────────────────────────
  const handleGenerateImage = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return;
    setStreaming(true);

    const placeholderId = `gen-${Date.now()}`;
    setMessages((msgs) => [
      ...msgs,
      { id: `u-${Date.now()}`, role: 'user', content: prompt },
      { id: placeholderId, role: 'assistant', content: '⏳ Генерирую изображение...' },
    ]);

    try {
      const { jobId } = await apiRequest<{ jobId: string }>('/generate/vision', {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      });

      const poll = async (): Promise<void> => {
        const job = await apiRequest<{ status: string; mediaUrl?: string; error?: string }>(`/generate/${jobId}`);
        if (job.status === 'done' && job.mediaUrl) {
          setMessages((msgs) => msgs.map((m) =>
            m.id === placeholderId
              ? { ...m, content: prompt, mediaUrl: job.mediaUrl }
              : m
          ));
          tg?.HapticFeedback.notificationOccurred('success');
        } else if (job.status === 'failed') {
          setMessages((msgs) => msgs.map((m) =>
            m.id === placeholderId
              ? { ...m, content: `❌ Ошибка: ${job.error ?? 'не удалось создать изображение'}` }
              : m
          ));
        } else {
          await new Promise((r) => setTimeout(r, 2000));
          return poll();
        }
      };

      await poll();
    } catch (err: any) {
      setMessages((msgs) => msgs.map((m) =>
        m.id === placeholderId
          ? { ...m, content: `❌ ${err.message ?? 'Ошибка генерации'}` }
          : m
      ));
      if (err.code === 'LIMIT_IMAGES' || err.code === 'PLAN_RESTRICTED') {
        tg?.showAlert('Лимит картинок исчерпан! Пополните баланс.', () => router.push('/balance'));
      }
    } finally {
      setStreaming(false);
    }
  }, [tg, router]);

  // ── Chat send ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const prompt = input.trim();
    if (!prompt || streaming) return;
    setInput('');

    // Auto-detect image request
    if (isImageRequest(prompt)) {
      return handleGenerateImage(prompt);
    }

    if (!chatId) return;
    tg?.HapticFeedback.impactOccurred('medium');

    setMessages((msgs) => [
      ...msgs,
      { id: `tmp-${Date.now()}`, role: 'user', content: prompt },
    ]);
    setStreaming(true);

    const token = getToken() ?? '';
    wsRef.current?.send(JSON.stringify({
      chatId,
      mode: 'chat',
      prompt,
      history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      jwt: token,
      preferredModel: model,
    }));
  }, [input, streaming, chatId, messages, tg, model, handleGenerateImage]);

  const isEmpty = !messages.length && !streaming;

  const modelLabels: Record<ModelChoice, string> = {
    haiku: 'Стандарт',
    deepseek: 'Про',
  };

  return (
    <div className="flex flex-col h-dvh bg-[#0A0A12]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
        <span className="text-lg">👻</span>
        <span className="font-medium text-sm text-white flex-1">GhostLine</span>

        {/* Model selector dropdown */}
        <div className="relative" ref={modelRef}>
          <button
            onClick={() => setModelOpen(v => !v)}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-all"
            style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)' }}
          >
            {modelLabels[model]}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
          <AnimatePresence>
            {modelOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                className="absolute top-full right-0 mt-1 z-50 rounded-xl overflow-hidden shadow-xl"
                style={{ background: '#1A1A2E', border: '1px solid rgba(255,255,255,0.08)', minWidth: '110px' }}
              >
                {([
                  { key: undefined,    label: 'Авто' },
                  { key: 'haiku' as const,    label: 'Стандарт' },
                  { key: 'deepseek' as const, label: 'Про' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={String(key)}
                    onClick={() => { if (key) setModel(key); else setModel('haiku'); setModelOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs transition-all"
                    style={{
                      color: model === key ? '#7B5CF0' : 'rgba(255,255,255,0.65)',
                      background: 'transparent',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-[120px]">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="text-5xl mb-4 animate-float">👻</div>
            <p className="text-white font-medium mb-1">Чем займёмся?</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Напишите что-нибудь или попросите создать картинку
            </p>
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
                  {msg.mediaUrl ? (
                    <img src={msg.mediaUrl} alt="generated" className="rounded-xl max-w-full" />
                  ) : msg.role === 'assistant' ? (
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
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: '#7B5CF0', animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="fixed bottom-[60px] left-0 right-0 px-3 py-2 bg-[#0A0A12] border-t border-[rgba(255,255,255,0.06)]">
        <div className="flex gap-2 items-end">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="Сообщение..."
            style={{ fontSize: '16px' }}
            className="flex-1 h-11"
            disabled={streaming}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="w-11 h-11 rounded-xl text-white flex items-center justify-center disabled:opacity-40 flex-shrink-0"
            style={{ background: '#7B5CF0' }}
          >
            ↑
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
