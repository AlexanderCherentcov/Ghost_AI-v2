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

type ModelChoice = 'haiku' | 'deepseek' | undefined;

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
  return IMAGE_KEYWORDS.some((kw) => text.toLowerCase().includes(kw));
}

async function downloadImage(url: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `ghostline-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
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
  const [model, setModel] = useState<ModelChoice>(undefined);
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
      ...(model ? { preferredModel: model } : {}),
    }));
  }, [input, streaming, chatId, messages, tg, model, handleGenerateImage]);

  const isEmpty = !messages.length && !streaming;

  const MODEL_LABEL: Record<string, string> = {
    haiku: 'Стандарт',
    deepseek: 'Про',
  };

  const modelOptions: { key: ModelChoice; label: string }[] = [
    { key: undefined,   label: 'Авто' },
    { key: 'haiku',     label: 'Стандарт' },
    { key: 'deepseek',  label: 'Про' },
  ];

  // BottomNav height ~60px
  const NAV_H = 60;

  return (
    <div className="flex flex-col bg-[#0A0A12]" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
        <span className="text-lg">👻</span>
        <span className="font-medium text-sm text-white flex-1">GhostLine</span>

        {/* Model selector */}
        <div className="relative" ref={modelRef}>
          <button
            onClick={() => setModelOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all"
            style={{
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {model ? MODEL_LABEL[model] : 'Авто'}
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
                style={{ background: '#1A1A2E', border: '1px solid rgba(255,255,255,0.08)', minWidth: '120px' }}
              >
                {modelOptions.map(({ key, label }) => (
                  <button
                    key={String(key)}
                    onClick={() => { setModel(key); setModelOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs transition-all"
                    style={{
                      color: model === key ? '#7B5CF0' : 'rgba(255,255,255,0.65)',
                      background: model === key ? 'rgba(123,92,240,0.1)' : 'transparent',
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

      {/* Messages — flex-1, scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
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
                {msg.role === 'assistant' && <span className="text-base flex-shrink-0 mt-1">👻</span>}
                <div
                  className={`max-w-[85%] text-sm rounded-2xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-[#13131F] text-[rgba(255,255,255,0.88)] rounded-tr-sm'
                      : 'prose-ghost'
                  }`}
                >
                  {msg.mediaUrl ? (
                    <div>
                      <img src={msg.mediaUrl} alt="generated" className="rounded-xl max-w-full mb-2" />
                      <button
                        onClick={() => downloadImage(msg.mediaUrl!)}
                        className="flex items-center gap-1.5 text-[11px] opacity-60 hover:opacity-100 transition-opacity"
                        style={{ color: '#7B5CF0' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Скачать
                      </button>
                    </div>
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

      {/* Input — в потоке */}
      <div className="flex-shrink-0 px-3 pt-2 pb-2 bg-[#0A0A12] border-t border-[rgba(255,255,255,0.06)]">
        <div className="flex gap-2 items-end">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="Сообщение..."
            style={{ fontSize: '16px', minHeight: '44px' }}
            className="flex-1 rounded-xl px-4 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.88)] placeholder:text-[rgba(255,255,255,0.25)] outline-none"
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

      {/* Spacer для фиксированного BottomNav */}
      <div className="flex-shrink-0" style={{ height: `calc(${NAV_H}px + env(safe-area-inset-bottom))` }} />
      <BottomNav />
    </div>
  );
}
