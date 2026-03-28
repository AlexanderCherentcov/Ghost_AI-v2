'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  fileName?: string | null;
}

type ModelChoice = 'haiku' | 'deepseek' | undefined;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL
  ?? API_URL.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');

const IMAGE_VERBS = [
  'нарисуй', 'нарисовать', 'создай', 'создать', 'сгенерируй', 'сгенерировать',
  'сделай', 'сделать', 'покажи', 'draw', 'generate', 'create', 'make',
];
const IMAGE_NOUNS = [
  'картинку', 'картину', 'картинок', 'изображение', 'изображения', 'рисунок',
  'рисунки', 'иллюстрацию', 'арт', 'image', 'picture', 'photo', 'illustration',
];
const IMAGE_EXACT = ['изображение в стиле', 'generate image', 'хочу картинку'];

const EDIT_VERBS = [
  'измени', 'изменить', 'отредактируй', 'отредактировать', 'сделай', 'поменяй', 'поменять',
  'добавь', 'добавить', 'убери', 'убрать', 'замени', 'заменить', 'преврати', 'превратить',
  'перекрась', 'раскрась', 'стилизуй', 'edit', 'change', 'modify', 'transform', 'remove', 'add',
];

const IMAGE_REF_KEYWORDS = ['эту картинку', 'это изображение', 'её', 'ее', 'его', 'эту', 'это фото', 'картинку выше', 'изображение выше'];

function isImageRequest(text: string): boolean {
  const lower = text.toLowerCase();
  if (IMAGE_EXACT.some((kw) => lower.includes(kw))) return true;
  return IMAGE_VERBS.some((v) => lower.includes(v)) && IMAGE_NOUNS.some((n) => lower.includes(n));
}

function isImageEditRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return EDIT_VERBS.some((v) => lower.includes(v)) && IMAGE_REF_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractImagePrompt(content: string): string {
  // 1. Code block ```...``` — highest priority
  const codeBlock = content.match(/```[^\n]*\n?([\s\S]+?)```/);
  if ((codeBlock?.[1]?.trim().length ?? 0) > 20) return codeBlock![1].trim().slice(0, 600);

  // 2. Inline code `...` > 20 chars
  const inline = content.match(/`([^`]{20,})`/);
  if (inline?.[1]?.trim()) return inline[1].trim().slice(0, 600);

  // 3. Bold **...** > 30 chars that's NOT a section header (doesn't end with : or —)
  const boldMatches = content.match(/\*\*([^*]{30,})\*\*/g);
  if (boldMatches?.length) {
    const candidates = boldMatches
      .map((m) => m.replace(/\*\*/g, '').trim())
      .filter((t) => !t.endsWith(':') && !t.endsWith('—') && !t.endsWith('-'))
      .sort((a, b) => b.length - a.length);
    if (candidates[0]) return candidates[0].slice(0, 600);
  }

  // 4. Quoted text "..." or «...» > 30 chars
  const quoted = content.match(/["""«]([^"""»\n]{30,})["""»]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim().slice(0, 600);

  // 5. Find a line that looks like an image prompt
  const IMAGE_KEYWORDS = ['4k', '8k', 'photorealistic', 'detailed', 'style', 'lighting',
    'portrait', 'landscape', 'digital art', 'cinematic', 'high quality', 'beautiful',
    'stunning', 'realistic', 'illustration', 'render', 'resolution'];
  const INTRO_PREFIXES = ['конечно', 'вот ', 'используй', 'этот промт', 'данный', 'можно',
    'вы можете', 'для генерации', 'для создания', 'ниже', 'предлагаю', 'here ', 'this '];
  const lines = content
    .replace(/\*\*/g, '').replace(/\*/g, '').replace(/#{1,6}\s+/g, '').replace(/`/g, '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 30 && !l.endsWith(':'));
  const keywordLine = lines.find((l) => IMAGE_KEYWORDS.some((kw) => l.toLowerCase().includes(kw)));
  if (keywordLine) return keywordLine.slice(0, 600);
  const nonIntroLine = lines.find((l) => !INTRO_PREFIXES.some((p) => l.toLowerCase().startsWith(p)));
  if (nonIntroLine) return nonIntroLine.slice(0, 600);
  if (lines.length) return lines.sort((a, b) => b.length - a.length)[0].slice(0, 600);

  return content
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/---+/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 600);
}

function getFileCategory(file: File): 'image' | 'text' | 'binary' {
  if (file.type.startsWith('image/')) return 'image';
  const textExts = ['js', 'ts', 'tsx', 'jsx', 'json', 'csv', 'md', 'txt', 'xml', 'yaml', 'yml', 'html', 'css', 'py', 'go', 'rs', 'java', 'php', 'rb', 'sh', 'c', 'cpp', 'h'];
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (file.type.startsWith('text/') || textExts.includes(ext)) return 'text';
  return 'binary';
}

async function resizeImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 800;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.readAsText(file, 'utf-8');
  });
}

async function extractFile(file: File): Promise<{ text: string; lang: string; truncated: boolean }> {
  const form = new FormData();
  form.append('file', file);
  const token = getToken();
  const res = await fetch(`${API_URL}/api/upload/extract`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw Object.assign(new Error(err.error ?? 'Upload failed'), { status: res.status });
  }
  return res.json();
}

async function downloadImage(url: string) {
  if (url.startsWith('data:')) {
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
    return;
  }
  const tg = window.Telegram?.WebApp;
  if (tg) { tg.openLink(url); return; }
  window.open(url, '_blank');
}

export default function TgChatPage() {
  return (
    <TelegramProvider>
      <Suspense>
        <ChatApp />
      </Suspense>
    </TelegramProvider>
  );
}

function ChatApp() {
  const tg = useTg();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [model, setModel] = useState<ModelChoice>(undefined);
  const [modelOpen, setModelOpen] = useState(false);
  const [vpHeight, setVpHeight] = useState('100dvh');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync height with Telegram viewport — updates dynamically when keyboard opens/closes
  useEffect(() => {
    const tgApp = (window.Telegram?.WebApp) as any;
    if (!tgApp) return;

    function updateHeight() {
      const h = tgApp.viewportHeight ?? tgApp.viewportStableHeight;
      if (h && h > 100) setVpHeight(`${h}px`);
    }

    updateHeight();
    tgApp.onEvent?.('viewportChanged', updateHeight);
    return () => tgApp.offEvent?.('viewportChanged', updateHeight);
  }, []);

  // Sync chatId → URL so page refresh reopens the same chat
  useEffect(() => {
    if (chatId) {
      router.replace(`/chat?id=${chatId}`);
    }
  }, [chatId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent, vpHeight]);

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

  function handleTextareaInput() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  // Init: load chat by ?id param, or last chat, or create new
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (idParam) {
      setChatId(idParam);
      apiRequest<{ messages: Message[] }>(`/chats/${idParam}/messages`)
        .then(({ messages: msgs }) => setMessages(msgs))
        .catch(() => {});
      return;
    }

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

  // WS with auto-reconnect
  useEffect(() => {
    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (destroyed) return;
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

      ws.onclose = () => {
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  // ── Image generation ─────────────────────────────────────────────────────────
  const handleGenerateImage = useCallback(async (prompt: string, sourceImageUrl?: string) => {
    if (!prompt.trim()) return;
    setStreaming(true);

    const placeholderId = `gen-${Date.now()}`;
    setMessages((msgs) => [
      ...msgs,
      { id: `u-${Date.now()}`, role: 'user', content: prompt, mediaUrl: sourceImageUrl },
      { id: placeholderId, role: 'assistant', content: '⏳ Генерирую изображение...' },
    ]);

    try {
      const { jobId } = await apiRequest<{ jobId: string }>('/generate/vision', {
        method: 'POST',
        body: JSON.stringify({ prompt, ...(chatId ? { chatId } : {}), ...(sourceImageUrl ? { sourceImageUrl } : {}) }),
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
  }, [tg, router, chatId]);

  // ── File selection ────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    e.target.value = '';
  }

  // ── Chat send ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if ((!prompt && !selectedFile) || streaming) return;
    setInput('');
    const fileToSend = selectedFile;
    setSelectedFile(null);

    // Image edit: user wants to modify last generated image
    if (!fileToSend && isImageEditRequest(prompt)) {
      const lastImage = [...messages].reverse().find((m) => m.role === 'assistant' && m.mediaUrl);
      if (lastImage?.mediaUrl) {
        return handleGenerateImage(prompt, lastImage.mediaUrl);
      }
    }

    // Verb-only generation command ("сгенерируй", "нарисуй", "create" etc. without a noun)
    // → use last assistant message as the image prompt
    if (!fileToSend) {
      const lowerPrompt = prompt.toLowerCase().trim();
      const verbOnly = IMAGE_VERBS.some(v =>
        lowerPrompt === v ||
        lowerPrompt.startsWith(v + ' это') ||
        lowerPrompt.startsWith(v + ' его') ||
        lowerPrompt.startsWith(v + ' её') ||
        lowerPrompt.startsWith(v + ' пожалуйста')
      );
      if (verbOnly) {
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && !m.mediaUrl);
        if (lastAssistant) {
          return handleGenerateImage(extractImagePrompt(lastAssistant.content));
        }
      }
    }

    // Pure text image generation request
    if (!fileToSend && isImageRequest(prompt)) {
      const REF_KEYWORDS = ['по этому', 'по нему', 'по промту', 'по этой', 'этот промт', 'выше', 'его', 'из чата'];
      const isRef = REF_KEYWORDS.some((kw) => prompt.toLowerCase().includes(kw));
      if (isRef) {
        const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.mediaUrl);
        if (lastAssistant) {
          return handleGenerateImage(extractImagePrompt(lastAssistant.content));
        }
      }
      return handleGenerateImage(prompt);
    }

    // Process attached file
    let imageUrl: string | undefined;
    let fileContent: string | undefined;
    let fileName: string | undefined;
    let fileLang: string | undefined;
    let fileDisplayUrl: string | undefined;

    if (fileToSend) {
      const category = getFileCategory(fileToSend);
      fileName = fileToSend.name;

      if (category === 'image') {
        try {
          imageUrl = await resizeImageToBase64(fileToSend);
          fileDisplayUrl = imageUrl;
          // Image editing intent with attached image
          if (prompt && EDIT_VERBS.some((v) => prompt.toLowerCase().includes(v))) {
            return handleGenerateImage(prompt, imageUrl);
          }
        } catch {
          tg?.showAlert('Не удалось обработать изображение');
          return;
        }
      } else if (category === 'text') {
        try {
          const raw = await readFileAsText(fileToSend);
          fileContent = raw.slice(0, 60_000);
          fileLang = fileToSend.name.split('.').pop()?.toLowerCase();
        } catch {
          tg?.showAlert('Не удалось прочитать файл');
          return;
        }
      } else {
        try {
          tg?.showAlert('Извлечение текста из файла...');
          const result = await extractFile(fileToSend);
          fileContent = result.text;
          fileLang = result.lang;
        } catch (err: any) {
          tg?.showAlert(err.message ?? 'Ошибка загрузки файла');
          return;
        }
      }
    }

    // If chatId not yet set (init still loading) — create chat on the fly
    let activeChatId = chatId;
    if (!activeChatId) {
      try {
        const chat = await apiRequest<{ id: string }>('/chats', {
          method: 'POST',
          body: JSON.stringify({ mode: 'chat' }),
        });
        activeChatId = chat.id;
        setChatId(chat.id);
      } catch {
        return;
      }
    }

    tg?.HapticFeedback.impactOccurred('medium');

    const displayContent = prompt || (fileName ? `[Файл: ${fileName}]` : '');
    setMessages((msgs) => [
      ...msgs,
      {
        id: `tmp-${Date.now()}`,
        role: 'user',
        content: displayContent,
        mediaUrl: fileDisplayUrl ?? null,
        fileName: fileName ?? null,
      },
    ]);
    setStreaming(true);

    const token = getToken() ?? '';
    wsRef.current?.send(JSON.stringify({
      chatId: activeChatId,
      mode: 'chat',
      prompt: prompt || (fileName ? `[Файл: ${fileName}]` : ''),
      history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      jwt: token,
      ...(model ? { preferredModel: model } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(fileContent ? { fileContent } : {}),
      ...(fileName ? { fileName } : {}),
      ...(fileLang ? { fileLang } : {}),
    }));
  }, [input, streaming, chatId, messages, tg, model, handleGenerateImage, selectedFile]);

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

  return (
    <div className="flex flex-col bg-[#0A0A12]" style={{ height: vpHeight }}>
      {/* Image lightbox */}
      <AnimatePresence>
        {viewerUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 flex flex-col items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)', zIndex: 200 }}
            onClick={() => setViewerUrl(null)}
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.18 }}
              src={viewerUrl}
              alt="preview"
              className="max-w-[92vw] max-h-[72vh] rounded-2xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <div
              className="flex items-center gap-3 mt-5"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => downloadImage(viewerUrl)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: '#7B5CF0', color: 'white' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1v9M4 7l3 3 3-3M2 12h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Скачать
              </button>
              <button
                onClick={() => setViewerUrl(null)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Закрыть
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
        <span className="text-lg">👻</span>
        <span className="font-medium text-sm text-white flex-1">GhostLine</span>
        {/* New chat button */}
        <button
          type="button"
          onClick={() => {
            setMessages([]);
            setChatId(null);
            setSelectedFile(null);
            tg?.HapticFeedback.impactOccurred('light');
          }}
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
          style={{ color: 'rgba(255,255,255,0.4)' }}
          title="Новый чат"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Messages — flex-1, scrollable, padding-bottom accounts for fixed input + bottom nav */}
      <div
        className="flex-1 min-h-0 overflow-y-auto px-4 pt-4"
        style={{ paddingBottom: 'calc(200px + env(safe-area-inset-bottom))' }}
      >
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
                      <img
                        src={msg.mediaUrl}
                        alt="generated"
                        className="rounded-xl max-w-full mb-2 cursor-pointer active:opacity-80"
                        onClick={() => setViewerUrl(msg.mediaUrl!)}
                      />
                      {msg.content && msg.content !== msg.mediaUrl && (
                        <p className="mt-1 text-[rgba(255,255,255,0.6)] text-xs">{msg.content}</p>
                      )}
                    </div>
                  ) : msg.fileName ? (
                    <div className="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 1h5l3 3v9H3V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                        <path d="M8 1v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                      </svg>
                      <span className="truncate">{msg.fileName}</span>
                      {msg.content && msg.content !== `[Файл: ${msg.fileName}]` && (
                        <span className="text-[rgba(255,255,255,0.5)]">— {msg.content}</span>
                      )}
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

      {/* Input — fixed above BottomNav, doesn't move when keyboard opens */}
      <div
        style={{
          position: 'fixed',
          bottom: 'calc(60px + env(safe-area-inset-bottom))',
          left: 0,
          right: 0,
          zIndex: 40,
          padding: '8px 12px',
          background: '#0A0A12',
        }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Attached file chip */}
        {selectedFile && (
          <div
            className="flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl text-xs"
            style={{ background: 'rgba(123,92,240,0.12)', border: '1px solid rgba(123,92,240,0.3)', color: 'rgba(255,255,255,0.7)' }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M3 1h5l3 3v9H3V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              <path d="M8 1v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            </svg>
            <span className="flex-1 truncate">{selectedFile.name}</span>
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        <div
          className="flex flex-col rounded-2xl px-4 pt-3 pb-2.5 transition-all"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: (input.trim() || selectedFile)
              ? '1px solid rgba(123,92,240,0.5)'
              : '1px solid rgba(255,255,255,0.08)',
            boxShadow: (input.trim() || selectedFile) ? '0 0 0 3px rgba(123,92,240,0.12)' : 'none',
          }}
        >
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); handleTextareaInput(); }}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            placeholder="Сообщение..."
            disabled={streaming}
            rows={1}
            style={{ fontSize: '16px', minHeight: '36px' }}
            className="w-full bg-transparent resize-none outline-none text-[rgba(255,255,255,0.88)] placeholder:text-[rgba(255,255,255,0.2)] leading-[1.75] max-h-[160px]"
          />

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {/* Attach file button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={streaming}
                className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors disabled:opacity-30"
                style={{ color: 'rgba(255,255,255,0.35)' }}
                title="Прикрепить файл"
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M13 7.5l-5.5 5.5a3.5 3.5 0 0 1-5-5L8 2.5a2 2 0 0 1 2.8 2.8L5.3 10.8a.5.5 0 0 1-.7-.7L10 4.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Model selector */}
              <div className="relative" ref={modelRef}>
                <button
                  type="button"
                  onClick={() => setModelOpen(v => !v)}
                  className="flex items-center gap-1 text-[12px] rounded-md px-1.5 py-0.5"
                  style={{ color: 'rgba(255,255,255,0.45)' }}
                >
                  {model ? MODEL_LABEL[model] : 'Авто'}
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                </button>
                <AnimatePresence>
                  {modelOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.97 }}
                      transition={{ duration: 0.12 }}
                      className="absolute bottom-full mb-2 left-0 z-50 rounded-xl overflow-hidden shadow-xl"
                      style={{ background: '#1A1A2E', border: '1px solid rgba(255,255,255,0.08)', minWidth: '130px' }}
                    >
                      {modelOptions.map(({ key, label }) => (
                        <button
                          key={String(key)}
                          type="button"
                          onClick={() => { setModel(key); setModelOpen(false); }}
                          className="w-full text-left px-4 py-2.5 text-[12px] transition-all"
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

            {/* Send button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={(!input.trim() && !selectedFile) || streaming}
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40"
              style={{
                background: (input.trim() || selectedFile) && !streaming ? '#7B5CF0' : 'rgba(255,255,255,0.08)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 12V3M3.5 7L7.5 3L11.5 7" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
