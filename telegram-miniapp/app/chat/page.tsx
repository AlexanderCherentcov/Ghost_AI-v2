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

type ModelChoice = 'haiku' | undefined;
type ChatMode = 'chat' | 'images' | 'video';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL
  ?? API_URL.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');

const IMAGE_VERBS = [
  // imperative
  'нарисуй', 'создай', 'сгенерируй', 'сделай', 'покажи',
  // 1st-person future (mobile dictation / typos)
  'нарисую', 'сгенерирую',
  // infinitive
  'нарисовать', 'создать', 'сгенерировать', 'сделать',
  // english
  'draw', 'generate', 'create', 'make',
];
const IMAGE_NOUNS = [
  'картинку', 'картину', 'картинок', 'изображение', 'изображения', 'рисунок',
  'рисунки', 'иллюстрацию', 'арт', 'image', 'picture', 'photo', 'illustration',
];
const IMAGE_EXACT = ['изображение в стиле', 'generate image', 'хочу картинку'];

// Keywords indicating user is REFERENCING a previous message/prompt
const REF_KEYWORDS = [
  'по этому', 'по нему', 'по промту', 'по этой', 'этот промт', 'выше', 'его', 'из чата',
];

const EDIT_VERBS = [
  'измени', 'изменить', 'отредактируй', 'отредактировать', 'сделай', 'поменяй', 'поменять',
  'добавь', 'добавить', 'убери', 'убрать', 'замени', 'заменить', 'преврати', 'превратить',
  'перекрась', 'раскрась', 'стилизуй', 'edit', 'change', 'modify', 'transform', 'remove', 'add',
];

const IMAGE_EDIT_REF = ['эту картинку', 'это изображение', 'её', 'ее', 'его', 'эту', 'это фото', 'картинку выше', 'изображение выше'];

function isImageRequest(text: string): boolean {
  const lower = text.toLowerCase();
  if (IMAGE_EXACT.some((kw) => lower.includes(kw))) return true;
  return IMAGE_VERBS.some((v) => lower.includes(v)) && IMAGE_NOUNS.some((n) => lower.includes(n));
}

function isImageEditRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return EDIT_VERBS.some((v) => lower.includes(v)) && IMAGE_EDIT_REF.some((kw) => lower.includes(kw));
}

// Returns true if user wants AI to WRITE a prompt — NOT generate an image directly.
// e.g. "создай мне промт для изображения битвы", "напиши промт 9:18"
// Exception: "сгенерируй по этому промту" — user is USING a previously written prompt.
function isPromptComposeRequest(text: string): boolean {
  const lower = text.toLowerCase();
  if (REF_KEYWORDS.some((ref) => lower.includes(ref))) return false;
  return lower.includes('промт') || lower.includes('prompt') || lower.includes('промпт');
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
  const [chatMode, setChatMode] = useState<ChatMode>('chat');
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoDuration, setVideoDuration] = useState<5 | 10>(5);
  const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [videoEnableAudio, setVideoEnableAudio] = useState(false);
  const [videoSettingsOpen, setVideoSettingsOpen] = useState(false);
  const [videoCameraPreset, setVideoCameraPreset] = useState('static');
  const [videoNegativePrompt, setVideoNegativePrompt] = useState('');
  const [videoCfgScale, setVideoCfgScale] = useState(50); // 0-100, maps to 0-1
  const videoSettingsRef = useRef<HTMLDivElement>(null);
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
      if (videoSettingsRef.current && !videoSettingsRef.current.contains(e.target as Node)) {
        setVideoSettingsOpen(false);
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

  // ── Video generation ─────────────────────────────────────────────────────────
  const handleGenerateVideo = useCallback(async (prompt: string, imageUrl?: string) => {
    if (!prompt.trim() && !imageUrl) return;
    setGeneratingVideo(true);

    const placeholderId = `gen-video-${Date.now()}`;
    const durationLabel = videoDuration === 10 ? '10 секунд' : '5 секунд';
    setMessages((msgs) => [
      ...msgs,
      { id: `u-${Date.now()}`, role: 'user', content: prompt, mediaUrl: imageUrl },
      { id: placeholderId, role: 'assistant', content: `⏳ Генерирую видео (${durationLabel})... Это займёт 1-2 минуты.` },
    ]);

    try {
      const { jobId } = await apiRequest<{ jobId: string }>('/generate/reel', {
        method: 'POST',
        body: JSON.stringify({
          prompt: prompt || 'animate this image',
          ...(chatId ? { chatId } : {}),
          videoDuration,
          videoAspectRatio,
          videoEnableAudio,
          ...(imageUrl ? { videoImageUrl: imageUrl } : {}),
          cameraPreset: videoCameraPreset,
          ...(videoNegativePrompt.trim() ? { negativePrompt: videoNegativePrompt.trim() } : {}),
          cfgScale: videoCfgScale / 100,
        }),
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
              ? { ...m, content: `❌ Ошибка: ${job.error ?? 'не удалось создать видео'}` }
              : m
          ));
        } else {
          await new Promise((r) => setTimeout(r, 3000));
          return poll();
        }
      };

      await poll();
    } catch (err: any) {
      setMessages((msgs) => msgs.filter((m) => m.id !== placeholderId));
      if (err.code === 'LIMIT_VIDEOS' || err.code === 'LIMIT_VIDEOS_UNAVAILABLE') {
        tg?.showAlert('Лимит видео исчерпан! Обновите тариф.', () => router.push('/balance'));
      } else if (err.code === 'PLAN_RESTRICTED') {
        tg?.showAlert('Генерация видео доступна с тарифа STANDARD.', () => router.push('/balance'));
      } else {
        tg?.showAlert(err.message ?? 'Ошибка генерации видео');
      }
    } finally {
      setGeneratingVideo(false);
    }
  }, [tg, router, chatId, videoDuration, videoAspectRatio, videoEnableAudio, videoCameraPreset, videoNegativePrompt, videoCfgScale]);

  // ── File selection ────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    e.target.value = '';
  }

  // ── Chat send ─────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if ((!prompt && !selectedFile) || streaming || generatingVideo) return;
    setInput('');
    const fileToSend = selectedFile;
    setSelectedFile(null);

    // ── Mode-based routing ───────────────────────────────────────────────────
    if (chatMode === 'images' && !fileToSend) {
      return handleGenerateImage(prompt || 'beautiful landscape');
    }
    if (chatMode === 'video') {
      if (!prompt && !fileToSend) return;
      if (fileToSend && fileToSend.type.startsWith('image/')) {
        try {
          const imgUrl = await resizeImageToBase64(fileToSend);
          return handleGenerateVideo(prompt, imgUrl);
        } catch {
          tg?.showAlert('Не удалось обработать изображение');
          return;
        }
      }
      return handleGenerateVideo(prompt);
    }

    // ── Image intent routing ─────────────────────────────────────────────────
    let isWritingPrompt = false;
    if (!fileToSend && prompt) {
      const lower = prompt.toLowerCase().trim();

      // 1. Verb-only: bare verb OR verb + pronoun/ref (no image noun needed)
      //    "сгенерируй", "нарисуй его", "создай по этому промту"
      const verbOnly = IMAGE_VERBS.some(v =>
        lower === v ||
        lower.startsWith(v + ' это') ||
        lower.startsWith(v + ' его') ||
        lower.startsWith(v + ' её') ||
        lower.startsWith(v + ' пожалуйста') ||
        (lower.startsWith(v) && REF_KEYWORDS.some(ref => lower.includes(ref)))
      );
      if (verbOnly) {
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && !m.mediaUrl);
        if (lastAssistant) {
          return handleGenerateImage(extractImagePrompt(lastAssistant.content));
        }
      }

      // 2. User wants AI to WRITE a prompt — contains "промт" but NOT as a reference.
      //    "создай промт для изображения битвы", "напиши промт изображений 9:18"
      //    → route to AI, skip image generation entirely
      if (isPromptComposeRequest(prompt)) {
        isWritingPrompt = true; // fall through to regular AI chat below
      } else if (isImageRequest(prompt)) {
        // 3. Has reference keyword → extract prompt from last assistant message
        const isRef = REF_KEYWORDS.some((kw) => lower.includes(kw));
        if (isRef) {
          const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.mediaUrl);
          if (lastAssistant) {
            return handleGenerateImage(extractImagePrompt(lastAssistant.content));
          }
        }
        // 4. Direct image generation with user's own description
        return handleGenerateImage(prompt);
      } else if (isImageEditRequest(prompt)) {
        // 5. Edit last generated image (no file attached, explicit edit command + image ref pronoun)
        const lastImage = [...messages].reverse().find((m) => m.role === 'assistant' && m.mediaUrl);
        if (lastImage?.mediaUrl) {
          return handleGenerateImage(prompt, lastImage.mediaUrl);
        }
      }
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

    const IMAGE_PROMPT_GUIDE = [
      {
        role: 'user' as const,
        content: 'Когда я прошу написать промт — имею в виду промт для AI-генерации изображений (DALL-E / Stable Diffusion). Пиши на английском, с деталями стиля, освещения, композиции, качества. Оформляй промт в блоке кода ```.',
      },
      {
        role: 'assistant' as const,
        content: 'Понял! Буду писать детальные промты для AI-генерации изображений на английском в блоке кода — с визуальным стилем, освещением, деталями сцены и тегами качества.',
      },
    ];

    const historyBase = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
    const history = isWritingPrompt
      ? [...IMAGE_PROMPT_GUIDE, ...historyBase]
      : historyBase;

    const token = getToken() ?? '';
    wsRef.current?.send(JSON.stringify({
      chatId: activeChatId,
      mode: 'chat',
      prompt: prompt || (fileName ? `[Файл: ${fileName}]` : ''),
      history,
      jwt: token,
      ...(model ? { preferredModel: model } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(fileContent ? { fileContent } : {}),
      ...(fileName ? { fileName } : {}),
      ...(fileLang ? { fileLang } : {}),
    }));
  }, [input, streaming, generatingVideo, chatId, messages, tg, model, chatMode, handleGenerateImage, handleGenerateVideo, selectedFile]);

  const isEmpty = !messages.length && !streaming;

  const MODEL_LABEL: Record<string, string> = {
    haiku: 'Стандарт',
  };

  const modelOptions: { key: ModelChoice; label: string }[] = [
    { key: undefined, label: 'Авто' },
    { key: 'haiku',   label: 'Стандарт' },
  ];

  const CHAT_MODES: { key: ChatMode; label: string }[] = [
    { key: 'chat',   label: 'Чат' },
    { key: 'images', label: 'Картинки' },
    { key: 'video',  label: 'Видео' },
  ];

  return (
    <div
      className="flex flex-col bg-[#0A0A12]"
      style={{
        height: vpHeight,
        // Reserve space for fixed BottomNav so input never goes behind it
        paddingBottom: 'calc(68px + env(safe-area-inset-bottom))',
      }}
    >
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

      {/* Messages — flex-1, scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-4">
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
                className={`mb-4 flex min-w-0 ${msg.role === 'user' ? 'justify-end' : 'justify-start gap-2'}`}
              >
                {msg.role === 'assistant' && <span className="text-base flex-shrink-0 mt-1">👻</span>}
                <div
                  className={`min-w-0 max-w-[85%] text-sm rounded-2xl px-4 py-3 break-words overflow-hidden ${
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
          <div className="flex gap-2 mb-4 min-w-0">
            <span className="text-base flex-shrink-0">👻</span>
            <div className="min-w-0 max-w-[85%] text-sm prose-ghost break-words overflow-hidden">
              <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{streamContent}</span>
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

      {/* Input — flex-shrink-0, sits in normal flow above the padded-out space for BottomNav */}
      <div
        className="flex-shrink-0"
        style={{
          padding: '8px 12px 4px',
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

        {/* Mode tabs */}
        <div className="flex items-center gap-1 mb-2">
          {CHAT_MODES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setChatMode(key)}
              className="px-3 py-1 rounded-lg text-[11px] font-medium transition-all"
              style={{
                background: chatMode === key ? 'rgba(123,92,240,0.25)' : 'transparent',
                color: chatMode === key ? '#A78BFA' : 'rgba(255,255,255,0.35)',
                border: chatMode === key ? '1px solid rgba(123,92,240,0.4)' : '1px solid transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Video options */}
        {chatMode === 'video' && (
          <div className="mb-2">
            {/* Basic options row */}
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {([5, 10] as const).map((d) => (
                <button key={d} type="button" onClick={() => setVideoDuration(d)}
                  className="px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-all"
                  style={{
                    background: videoDuration === d ? 'rgba(123,92,240,0.2)' : 'transparent',
                    color: videoDuration === d ? '#A78BFA' : 'rgba(255,255,255,0.38)',
                    border: videoDuration === d ? '1px solid rgba(123,92,240,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >{d}с</button>
              ))}
              <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 11 }}>|</span>
              {(['16:9', '9:16', '1:1'] as const).map((ar) => (
                <button key={ar} type="button" onClick={() => setVideoAspectRatio(ar)}
                  className="px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-all"
                  style={{
                    background: videoAspectRatio === ar ? 'rgba(123,92,240,0.2)' : 'transparent',
                    color: videoAspectRatio === ar ? '#A78BFA' : 'rgba(255,255,255,0.38)',
                    border: videoAspectRatio === ar ? '1px solid rgba(123,92,240,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >{ar}</button>
              ))}
              <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 11 }}>|</span>
              <button type="button" onClick={() => setVideoEnableAudio(v => !v)}
                className="px-2.5 py-0.5 rounded-lg text-[11px] font-medium transition-all"
                style={{
                  background: videoEnableAudio ? 'rgba(123,92,240,0.2)' : 'transparent',
                  color: videoEnableAudio ? '#A78BFA' : 'rgba(255,255,255,0.38)',
                  border: videoEnableAudio ? '1px solid rgba(123,92,240,0.4)' : '1px solid rgba(255,255,255,0.1)',
                }}
              >{videoEnableAudio ? '🔊' : '🔇'}</button>
              {videoDuration === 10 && (
                <span style={{ color: 'rgba(255,200,80,0.7)', fontSize: 10 }}>10с = 2 генерации</span>
              )}

              {/* Advanced settings button */}
              <div className="relative ml-auto" ref={videoSettingsRef}>
                <button
                  type="button"
                  onClick={() => setVideoSettingsOpen(v => !v)}
                  className="w-6 h-6 flex items-center justify-center rounded-md transition-all relative"
                  style={{
                    background: videoSettingsOpen ? 'rgba(123,92,240,0.18)' : 'transparent',
                    color: videoSettingsOpen ? '#A78BFA' : 'rgba(255,255,255,0.35)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
                    <path d="M1.5 4h12M1.5 7.5h12M1.5 11h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                    <circle cx="5" cy="4" r="1.6" fill="#0A0A12" stroke="currentColor" strokeWidth="1.2"/>
                    <circle cx="10" cy="7.5" r="1.6" fill="#0A0A12" stroke="currentColor" strokeWidth="1.2"/>
                    <circle cx="6" cy="11" r="1.6" fill="#0A0A12" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                  {(videoCameraPreset !== 'static' || videoNegativePrompt.trim() || videoCfgScale !== 50) && (
                    <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full" style={{ background: '#7B5CF0' }} />
                  )}
                </button>

                <AnimatePresence>
                  {videoSettingsOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.97 }}
                      transition={{ duration: 0.14 }}
                      className="absolute bottom-full right-0 mb-2 z-50 rounded-2xl overflow-hidden"
                      style={{
                        width: 260,
                        background: '#13131F',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
                      }}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[rgba(255,255,255,0.06)]">
                        <span className="text-[12px] font-medium text-white">Настройки видео</span>
                        <button type="button" onClick={() => setVideoSettingsOpen(false)}
                          className="w-5 h-5 flex items-center justify-center rounded text-[rgba(255,255,255,0.3)]"
                        >
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>

                      {/* Camera presets */}
                      <div className="px-3.5 py-2.5 border-b border-[rgba(255,255,255,0.06)]">
                        <p className="text-[10px] font-semibold text-[rgba(255,255,255,0.35)] uppercase tracking-widest mb-2">
                          Движение камеры
                        </p>
                        <div className="grid grid-cols-4 gap-1">
                          {[
                            { key: 'static', label: 'Стоп' },
                            { key: 'zoom_in', label: 'Зум +' },
                            { key: 'zoom_out', label: 'Зум −' },
                            { key: 'pan_left', label: 'Влево' },
                            { key: 'pan_right', label: 'Вправо' },
                            { key: 'tilt_up', label: 'Вверх' },
                            { key: 'tilt_down', label: 'Вниз' },
                            { key: 'orbit', label: 'Облёт' },
                          ].map((p) => (
                            <button key={p.key} type="button" onClick={() => setVideoCameraPreset(p.key)}
                              className="py-2 px-0.5 rounded-lg text-[9px] transition-all text-center"
                              style={{
                                background: videoCameraPreset === p.key ? 'rgba(123,92,240,0.22)' : 'rgba(255,255,255,0.04)',
                                color: videoCameraPreset === p.key ? '#A78BFA' : 'rgba(255,255,255,0.4)',
                                border: videoCameraPreset === p.key ? '1px solid rgba(123,92,240,0.4)' : '1px solid transparent',
                              }}
                            >{p.label}</button>
                          ))}
                        </div>
                      </div>

                      {/* Negative prompt */}
                      <div className="px-3.5 py-2.5 border-b border-[rgba(255,255,255,0.06)]">
                        <p className="text-[10px] font-semibold text-[rgba(255,255,255,0.35)] uppercase tracking-widest mb-2">
                          Исключить
                        </p>
                        <textarea
                          value={videoNegativePrompt}
                          onChange={(e) => setVideoNegativePrompt(e.target.value)}
                          placeholder="размытость, плохое качество..."
                          rows={2}
                          className="w-full rounded-lg px-2.5 py-1.5 text-[11px] text-[rgba(255,255,255,0.7)] placeholder:text-[rgba(255,255,255,0.2)] outline-none resize-none"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                        />
                      </div>

                      {/* cfg_scale */}
                      <div className="px-3.5 py-2.5">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-[10px] font-semibold text-[rgba(255,255,255,0.35)] uppercase tracking-widest">
                            Точность
                          </p>
                          <span className="text-[10px]" style={{ color: 'rgba(123,92,240,0.9)' }}>{videoCfgScale}%</span>
                        </div>
                        <input type="range" min={0} max={100} step={5}
                          value={videoCfgScale}
                          onChange={(e) => setVideoCfgScale(parseInt(e.target.value))}
                          className="w-full cursor-pointer"
                          style={{ accentColor: '#7B5CF0', height: '4px' }}
                        />
                        <div className="flex justify-between mt-0.5">
                          <span className="text-[9px] text-[rgba(255,255,255,0.2)]">Свободно</span>
                          <span className="text-[9px] text-[rgba(255,255,255,0.2)]">Точно</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
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
            placeholder={chatMode === 'images' ? 'Опишите изображение...' : chatMode === 'video' ? 'Опишите видео...' : 'Сообщение...'}
            disabled={streaming || generatingVideo}
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

              {/* Model selector — only in chat mode */}
              {chatMode === 'chat' && (<div className="relative" ref={modelRef}>
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
              </div>)}
            </div>

            {/* Send button */}
            <button
              type="button"
              onClick={handleSend}
              disabled={(!input.trim() && !selectedFile) || streaming || generatingVideo}
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40"
              style={{
                background: (input.trim() || selectedFile) && !streaming && !generatingVideo ? '#7B5CF0' : 'rgba(255,255,255,0.08)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path d="M7.5 12V3M3.5 7L7.5 3L11.5 7" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-center text-[10px] mt-2 mb-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
          GhostLine может ошибаться. Проверяйте важную информацию.
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
