'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { connectWS, onToken, abortStream, type WSChunk } from '@/lib/socket';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { InputBar, type ChatMode, type VideoOptions, type MusicMode } from '@/components/chat/InputBar';
import { useToast } from '@/components/ui/Toast';
import { LimitPopup, type LimitType } from '@/components/ui/LimitPopup';
import { getFileCategory } from '@/components/chat/InputBar';

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

// Keywords that mean user is REFERENCING a previous message/prompt
const REF_KEYWORDS = [
  'по этому', 'по нему', 'по промту', 'по этой', 'этот промт', 'выше', 'его', 'из чата',
];

// Edit-intent keywords — used when user has attached an image and wants to modify it
const EDIT_VERBS = [
  'измени', 'изменить', 'отредактируй', 'отредактировать', 'сделай', 'поменяй', 'поменять',
  'добавь', 'добавить', 'убери', 'убрать', 'замени', 'заменить', 'преврати', 'превратить',
  'перекрась', 'раскрась', 'нарисуй', 'стилизуй', 'edit', 'change', 'modify', 'transform',
  'remove', 'add', 'make it', 'turn into',
];

function isImageRequest(text: string): boolean {
  const lower = text.toLowerCase();
  if (IMAGE_EXACT.some((kw) => lower.includes(kw))) return true;
  return IMAGE_VERBS.some((v) => lower.includes(v)) && IMAGE_NOUNS.some((n) => lower.includes(n));
}

// Returns true if user attached an image and wants to edit it
function isImageEditRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return EDIT_VERBS.some((v) => lower.includes(v));
}

// Returns true if user wants AI to WRITE/COMPOSE a prompt — NOT generate an image.
// e.g. "создай мне промт для изображения битвы", "напиши промт 9:18"
// Exception: "сгенерируй по этому промту" — user is USING a previously written prompt.
function isPromptComposeRequest(text: string): boolean {
  const lower = text.toLowerCase();
  if (REF_KEYWORDS.some((ref) => lower.includes(ref))) return false;
  return lower.includes('промт') || lower.includes('prompt') || lower.includes('промпт');
}

// Extract clean image prompt from markdown (strips headers, bold markers, bullet points etc.)
function extractImagePrompt(content: string): string {
  // 1. Code block ```...``` — highest priority, unambiguous
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

  // 5. Find a line that looks like an image prompt (has visual keywords, not an intro sentence)
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

  // Final fallback: strip all markdown
  return content
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/---+/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 600);
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

export default function ChatConversationPage() {
  const pathname = usePathname();
  // In static export all /chat/* routes are served from /chat/index/index.html,
  // so params.id is always 'index'. Read the real chat ID from the browser URL instead.
  const segments = pathname.split('/').filter(Boolean);
  const id = segments[segments.length - 1] || 'index';
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const loadedChatIdRef = useRef<string | null>(null);
  const { show: showToast } = useToast();
  const {
    messages, setMessages, addMessage, appendStreamToken,
    commitStream, setStreaming, isStreaming, mode,
    setActiveChat, chats, preferredModel, setPreferredModel,
  } = useChatStore();

  const [limitType, setLimitType] = useState<LimitType>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatingMusic, setGeneratingMusic] = useState(false);
  const [messagesReady, setMessagesReady] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('chat');

  // Ref для предотвращения poll после unmount (H-09)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // URL последнего сгенерированного изображения — для редактирования без повторной загрузки
  const lastGeneratedImageRef = useRef<string | null>(null);
  // Синхронные ref-guards против двойного запуска генерации (state-updates async, refs sync)
  const generatingVideoRef = useRef(false);
  const generatingMusicRef = useRef(false);
  // Предотвращает повторный auto-send для того же чата
  const autoSentChatRef = useRef<string | null>(null);

  // Load messages + resume any pending generation job after page refresh
  useEffect(() => {
    // Wait for accessToken — it lives only in memory and is restored async
    // via refreshToken call in providers.tsx. Without this guard the request
    // fires before the token is ready and gets a 401.
    if (!accessToken) return;
    // Prevent double-fetch for the same chat (e.g. silent token refresh mid-session).
    // Use ID-based tracking so switching to a different chat always re-fetches.
    if (loadedChatIdRef.current === id) return;
    loadedChatIdRef.current = id;
    setMessagesReady(false);
    localStorage.setItem('lastChatId', id);
    const chat = chats.find((c) => c.id === id);
    if (chat) setActiveChat(chat);
    api.chats.messages(id)
      .then(({ messages }) => {
        setMessages(messages);
        setMessagesReady(true);

        // Restore last generated image URL so edit requests keep context after page reload
        const lastImg = [...messages].reverse().find(
          (m) => m.role === 'assistant' && m.mode === 'vision' && m.mediaUrl && m.mediaUrl !== '__loading__'
        );
        if (lastImg?.mediaUrl) lastGeneratedImageRef.current = lastImg.mediaUrl;

        // Resume pending generation job if the user refreshed mid-generation
        const stored = localStorage.getItem(`pending_gen_${id}`);
        if (!stored) return;
        try {
          const { jobId, mode, prompt } = JSON.parse(stored) as { jobId: string; mode: 'vision' | 'reel'; prompt: string };
          // If the result already landed in DB messages, just clean up
          const alreadyDone = messages.some(
            (m) => m.role === 'assistant' && m.mode === mode && m.mediaUrl && m.mediaUrl !== '__loading__'
          );
          if (alreadyDone) { localStorage.removeItem(`pending_gen_${id}`); return; }

          // Add placeholder and resume polling
          const placeholderId = `resumed-${Date.now()}`;
          useChatStore.getState().addMessage({
            id: placeholderId, role: 'assistant', content: '', mode,
            tokensCost: 0, cacheHit: false, mediaUrl: '__loading__', createdAt: new Date().toISOString(),
          });
          if (mode === 'vision') setGeneratingImage(true);
          else setGeneratingVideo(true);

          const pollResume = async (): Promise<void> => {
            if (!mountedRef.current) return;
            const job = await api.generate.status(jobId);
            if (!mountedRef.current) return;
            if (job.status === 'done' && job.mediaUrl) {
              useChatStore.getState().setMessages(
                useChatStore.getState().messages.map((m) =>
                  m.id === placeholderId ? { ...m, content: prompt, mediaUrl: job.mediaUrl!, tokensCost: 0 } : m
                )
              );
              localStorage.removeItem(`pending_gen_${id}`);
            } else if (job.status === 'failed') {
              useChatStore.getState().setMessages(
                useChatStore.getState().messages.map((m) =>
                  m.id === placeholderId
                    ? { ...m, content: `❌ Ошибка: ${job.error ?? 'не удалось создать'}`, mediaUrl: null }
                    : m
                )
              );
              localStorage.removeItem(`pending_gen_${id}`);
            } else {
              await new Promise((r) => setTimeout(r, mode === 'reel' ? 3000 : 2000));
              return pollResume();
            }
          };
          pollResume().finally(() => { setGeneratingImage(false); setGeneratingVideo(false); });
        } catch {
          localStorage.removeItem(`pending_gen_${id}`);
        }
      })
      .catch(() => { localStorage.removeItem('lastChatId'); router.replace('/chat'); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, accessToken]);

  // Auto-send initial prompt — waits until history is loaded (messagesReady) to avoid race condition
  useEffect(() => {
    if (!messagesReady) return; // wait for history to load before auto-sending
    if (autoSentChatRef.current === id) return; // already auto-sent for this chat

    const initialPrompt      = sessionStorage.getItem('initialPrompt');
    const initialImagePrompt = sessionStorage.getItem('initialImagePrompt');
    const initialVideoPrompt = sessionStorage.getItem('initialVideoPrompt');
    const initialMusicPrompt = sessionStorage.getItem('initialMusicPrompt');
    const initialMusicMode = (sessionStorage.getItem('initialMusicMode') ?? 'short') as MusicMode;
    const initialMusicDuration = sessionStorage.getItem('initialMusicDuration') ? Number(sessionStorage.getItem('initialMusicDuration')) : undefined;
    const initialSunoStyle = sessionStorage.getItem('initialSunoStyle') ?? undefined;
    const initialSunoTitle = sessionStorage.getItem('initialSunoTitle') ?? undefined;
    const initialSunoInstrumental = sessionStorage.getItem('initialSunoInstrumental') !== null ? sessionStorage.getItem('initialSunoInstrumental') !== 'false' : undefined;
    const initialImageUrl    = sessionStorage.getItem('initialImageUrl');
    const initialFileContent = sessionStorage.getItem('initialFileContent');
    const initialFileName    = sessionStorage.getItem('initialFileName');
    const initialFileLang    = sessionStorage.getItem('initialFileLang');
    const initialBinaryUrl   = sessionStorage.getItem('initialBinaryFileUrl');
    const initialFileMime    = sessionStorage.getItem('initialFileMime');

    const hasAny = initialPrompt || initialImagePrompt || initialVideoPrompt || initialMusicPrompt || initialImageUrl || initialFileContent || initialBinaryUrl;
    if (!hasAny) return;

    autoSentChatRef.current = id; // mark this chat as auto-sent before async work
    ['initialPrompt','initialImagePrompt','initialVideoPrompt','initialMusicPrompt','initialMusicMode','initialMusicDuration',
     'initialSunoStyle','initialSunoTitle','initialSunoInstrumental',
     'initialImageUrl','initialFileContent','initialFileName','initialFileLang','initialBinaryFileUrl','initialFileMime',
    ].forEach((k) => sessionStorage.removeItem(k));

    (async () => {
      if (initialVideoPrompt) {
        handleGenerateVideo(initialVideoPrompt);
      } else if (initialMusicPrompt) {
        handleGenerateMusic(initialMusicPrompt, initialMusicMode, initialMusicDuration, initialSunoStyle, initialSunoTitle, initialSunoInstrumental);
      } else if (initialImagePrompt) {
        handleGenerateImage(initialImagePrompt);
      } else if (initialImageUrl) {
        const res = await fetch(initialImageUrl);
        const blob = await res.blob();
        const file = new File([blob], initialFileName ?? 'image.jpg', { type: 'image/jpeg' });
        handleSend(initialPrompt ?? '', file);
      } else if (initialBinaryUrl && initialFileName) {
        const res = await fetch(initialBinaryUrl);
        const blob = await res.blob();
        const file = new File([blob], initialFileName, { type: initialFileMime ?? '' });
        handleSend(initialPrompt ?? '', file);
      } else if (initialFileContent && initialFileName) {
        const blob = new Blob([initialFileContent], { type: 'text/plain' });
        const file = new File([blob], initialFileName, { type: 'text/plain' });
        handleSend(initialPrompt ?? '', file);
      } else {
        handleSend(initialPrompt ?? '');
      }
    })();
  }, [id, messagesReady]);

  // Connect WS
  useEffect(() => {
    connectWS();
    const unsub = onToken((chunk: WSChunk) => {
      if (chunk.type === 'token' && chunk.data) appendStreamToken(chunk.data);
    });
    return unsub;
  }, []);

  // ── Inline image generation ──────────────────────────────────────────────────
  const handleGenerateImage = useCallback(async (prompt: string, sourceImageUrl?: string) => {
    if (!accessToken || !messagesReady) return;
    setGeneratingImage(true);

    addMessage({
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content: prompt,
      mode: 'vision',
      tokensCost: 0,
      cacheHit: false,
      mediaUrl: sourceImageUrl ?? null,
      createdAt: new Date().toISOString(),
    });

    const placeholderId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    addMessage({
      id: placeholderId,
      role: 'assistant',
      content: '',
      mode: 'vision',
      tokensCost: 0,
      cacheHit: false,
      mediaUrl: '__loading__',
      createdAt: new Date().toISOString(),
    });

    try {
      const { jobId } = await api.generate.vision({ prompt, size: '1024x1024', chatId: id, ...(sourceImageUrl ? { sourceImageUrl } : {}) });
      localStorage.setItem(`pending_gen_${id}`, JSON.stringify({ jobId, mode: 'vision', prompt }));

      const poll = async (): Promise<void> => {
        if (!mountedRef.current) return;
        const job = await api.generate.status(jobId);
        if (!mountedRef.current) return;
        if (job.status === 'done' && job.mediaUrl) {
          const current = useChatStore.getState().messages;
          useChatStore.getState().setMessages(current.map((m) =>
            m.id === placeholderId
              ? { ...m, content: prompt, mediaUrl: job.mediaUrl, tokensCost: 10 }
              : m
          ));
          lastGeneratedImageRef.current = job.mediaUrl;
          // Counter updated on backend; no local balance update needed
        } else if (job.status === 'failed') {
          const current = useChatStore.getState().messages;
          useChatStore.getState().setMessages(current.map((m) =>
            m.id === placeholderId
              ? { ...m, content: `❌ Ошибка: ${job.error ?? 'не удалось создать изображение'}`, mediaUrl: null }
              : m
          ));
        } else {
          await new Promise((r) => setTimeout(r, 2000));
          return poll();
        }
      };

      await poll();
    } catch (err: any) {
      useChatStore.getState().setMessages(
        useChatStore.getState().messages.map((m) =>
          m.id === placeholderId ? { ...m, content: '❌ Ошибка генерации', mediaUrl: null } : m
        )
      );
      showToast(err.message ?? 'Ошибка генерации изображения', 'error');
    } finally {
      localStorage.removeItem(`pending_gen_${id}`);
      setGeneratingImage(false);
    }
  }, [accessToken, user, messagesReady]);

  // ── Video generation ─────────────────────────────────────────────────────────
  const handleGenerateVideo = useCallback(async (prompt: string, options?: VideoOptions, imageUrl?: string) => {
    if (!accessToken || !messagesReady) return;
    if (generatingVideoRef.current) return;
    generatingVideoRef.current = true;
    setGeneratingVideo(true);

    addMessage({
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content: prompt,
      mode: 'reel',
      tokensCost: 0,
      cacheHit: false,
      mediaUrl: imageUrl ?? null,
      createdAt: new Date().toISOString(),
    });

    const placeholderId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    addMessage({
      id: placeholderId,
      role: 'assistant',
      content: '',
      mode: 'reel',
      tokensCost: 0,
      cacheHit: false,
      mediaUrl: '__loading__',
      createdAt: new Date().toISOString(),
    });

    try {
      const { jobId } = await api.generate.reel({
        prompt,
        chatId: id,
        videoDuration: options?.duration,
        videoAspectRatio: options?.aspectRatio,
        videoEnableAudio: options?.enableAudio,
        videoImageUrl: imageUrl,
        cameraPreset: options?.cameraPreset,
        negativePrompt: options?.negativePrompt || undefined,
        cfgScale: options?.cfgScale,
      });
      localStorage.setItem(`pending_gen_${id}`, JSON.stringify({ jobId, mode: 'reel', prompt }));

      const poll = async (): Promise<void> => {
        if (!mountedRef.current) return;
        const job = await api.generate.status(jobId);
        if (!mountedRef.current) return;
        if (job.status === 'done' && job.mediaUrl) {
          const current = useChatStore.getState().messages;
          useChatStore.getState().setMessages(current.map((m) =>
            m.id === placeholderId
              ? { ...m, content: prompt, mediaUrl: job.mediaUrl, tokensCost: 0 }
              : m
          ));
        } else if (job.status === 'failed') {
          const current = useChatStore.getState().messages;
          useChatStore.getState().setMessages(current.map((m) =>
            m.id === placeholderId
              ? { ...m, content: `❌ Ошибка: ${job.error ?? 'не удалось создать видео'}`, mediaUrl: null }
              : m
          ));
        } else {
          await new Promise((r) => setTimeout(r, 3000));
          return poll();
        }
      };

      await poll();
    } catch (err: any) {
      const current = useChatStore.getState().messages;
      useChatStore.getState().setMessages(current.map((m) =>
        m.id === placeholderId ? { ...m, content: '❌ Ошибка генерации видео', mediaUrl: null } : m
      ));
      if (err.code === 'LIMIT_VIDEOS') {
        setLimitType('LIMIT_VIDEOS');
      } else if (err.code === 'LIMIT_VIDEOS_UNAVAILABLE') {
        setLimitType('LIMIT_VIDEOS_UNAVAILABLE');
      } else {
        showToast(err.message ?? 'Ошибка генерации видео', 'error');
      }
    } finally {
      localStorage.removeItem(`pending_gen_${id}`);
      generatingVideoRef.current = false;
      setGeneratingVideo(false);
    }
  }, [accessToken, messagesReady]);

  // ── Music generation ─────────────────────────────────────────────────────────
  const handleGenerateMusic = useCallback(async (prompt: string, musicMode: MusicMode = 'short', musicDuration?: number, sunoStyle?: string, sunoTitle?: string, sunoInstrumental?: boolean) => {
    if (!accessToken || !messagesReady) return;
    if (generatingMusicRef.current) return;
    generatingMusicRef.current = true;
    setGeneratingMusic(true);

    addMessage({
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content: prompt,
      mode: 'sound',
      tokensCost: 0,
      cacheHit: false,
      mediaUrl: null,
      createdAt: new Date().toISOString(),
    });

    const placeholderId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    addMessage({
      id: placeholderId,
      role: 'assistant',
      content: '',
      mode: 'sound',
      tokensCost: 0,
      cacheHit: false,
      mediaUrl: '__loading__',
      createdAt: new Date().toISOString(),
    });

    try {
      const { jobId } = await api.generate.sound({ prompt, chatId: id, musicMode, musicDuration, sunoStyle, sunoTitle, sunoInstrumental });

      const poll = async (): Promise<void> => {
        if (!mountedRef.current) return;
        const job = await api.generate.status(jobId);
        if (!mountedRef.current) return;
        if (job.status === 'done' && job.mediaUrl) {
          const current = useChatStore.getState().messages;
          useChatStore.getState().setMessages(current.map((m) =>
            m.id === placeholderId
              ? { ...m, content: prompt, mediaUrl: job.mediaUrl, tokensCost: 0 }
              : m
          ));
        } else if (job.status === 'failed') {
          const current = useChatStore.getState().messages;
          useChatStore.getState().setMessages(current.map((m) =>
            m.id === placeholderId
              ? { ...m, content: `❌ Ошибка: ${job.error ?? 'не удалось создать трек'}`, mediaUrl: null }
              : m
          ));
        } else {
          await new Promise((r) => setTimeout(r, 3000));
          return poll();
        }
      };

      await poll();
    } catch (err: any) {
      useChatStore.getState().setMessages(
        useChatStore.getState().messages.map((m) =>
          m.id === placeholderId ? { ...m, content: '❌ Ошибка генерации музыки', mediaUrl: null } : m
        )
      );
      if (err.code === 'LIMIT_MUSIC') {
        setLimitType('LIMIT_MUSIC');
      } else if (err.code === 'LIMIT_MUSIC_UNAVAILABLE') {
        setLimitType('LIMIT_MUSIC_UNAVAILABLE');
      } else if (err.code === 'PLAN_RESTRICTED') {
        showToast('Генерация музыки доступна начиная с тарифа Пробный', 'error');
        router.push('/billing');
      } else {
        showToast(err.message ?? 'Ошибка генерации музыки', 'error');
      }
    } finally {
      generatingMusicRef.current = false;
      setGeneratingMusic(false);
    }
  }, [accessToken, messagesReady]);

  // ── Main send handler ────────────────────────────────────────────────────────
  const handleSend = useCallback(async (prompt: string, file?: File, videoOptions?: VideoOptions, musicMode?: MusicMode, musicDuration?: number, sunoStyle?: string, sunoTitle?: string, sunoInstrumental?: boolean) => {
    if ((isStreaming || generatingImage || generatingVideo || generatingMusic) || !accessToken || !messagesReady) return;

    // ── Mode-based routing ───────────────────────────────────────────────────
    if (chatMode === 'images' && !file) {
      // If user is editing the last generated image — pass it as source
      if (prompt && isImageEditRequest(prompt) && lastGeneratedImageRef.current) {
        return handleGenerateImage(prompt, lastGeneratedImageRef.current);
      }
      return handleGenerateImage(prompt || 'beautiful landscape');
    }
    if (chatMode === 'video') {
      if (!prompt.trim() && !file) return;
      // If image attached, use as source frame (image-to-video)
      if (file && getFileCategory(file) === 'image') {
        try {
          const imgUrl = await resizeImageToBase64(file);
          return handleGenerateVideo(prompt || 'animate this image', videoOptions, imgUrl);
        } catch {
          showToast('Не удалось обработать изображение', 'error');
          return;
        }
      }
      return handleGenerateVideo(prompt, videoOptions);
    }
    if (chatMode === 'music') {
      if (!prompt.trim()) return;
      return handleGenerateMusic(prompt, musicMode ?? 'short', musicDuration, sunoStyle, sunoTitle, sunoInstrumental);
    }

    // ── Image intent routing ─────────────────────────────────────────────────
    // Flag: user wants AI to WRITE an image prompt (not generate an image directly)
    let isWritingPrompt = false;

    if (!file && prompt) {
      const lower = prompt.toLowerCase().trim();

      // 1. Verb-only: bare verb OR verb + pronoun/ref keyword (no image noun needed)
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

      // 1b. Edit intent on last generated image (no file attached)
      //     "сделай темнее", "добавь снег", "убери фон" → edit last image
      if (isImageEditRequest(prompt) && lastGeneratedImageRef.current) {
        return handleGenerateImage(prompt, lastGeneratedImageRef.current);
      }

      // 2. User wants AI to WRITE a prompt — contains "промт" but NOT as a reference.
      //    "напиши промт битва ангелов", "создай промт для изображения 9:18"
      //    → route to AI with image-prompt guidance injected into history
      if (isPromptComposeRequest(prompt)) {
        isWritingPrompt = true;
        // fall through to regular AI chat below
      } else if (isImageRequest(prompt)) {
        // 3. Has reference keyword → extract prompt from last assistant message
        //    "сгенерируй изображение по этому промту", "нарисуй картинку по нему"
        const isRef = REF_KEYWORDS.some((kw) => lower.includes(kw));
        if (isRef) {
          const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.mediaUrl);
          if (lastAssistant) {
            return handleGenerateImage(extractImagePrompt(lastAssistant.content));
          }
        }
        // 4. Direct image generation with user's own description
        return handleGenerateImage(prompt);
      }
    }

    let imageUrl: string | undefined;
    let fileContent: string | undefined;
    let fileName: string | undefined;
    let fileLang: string | undefined;
    let fileDisplayUrl: string | null = null;

    if (file) {
      const category = getFileCategory(file);
      fileName = file.name;

      if (category === 'image') {
        try {
          imageUrl = await resizeImageToBase64(file);
          fileDisplayUrl = imageUrl;

          // Image editing: user attached an image and wants to modify it
          if (prompt && isImageEditRequest(prompt)) {
            return handleGenerateImage(prompt, imageUrl);
          }
        } catch {
          showToast('Не удалось обработать изображение', 'error');
        }
      } else if (category === 'text') {
        try {
          const raw = await readFileAsText(file);
          fileContent = raw.slice(0, 60_000);
          fileLang = file.name.split('.').pop()?.toLowerCase();
        } catch {
          showToast('Не удалось прочитать файл', 'error');
        }
      } else {
        try {
          showToast('Извлечение текста из файла...', 'info');
          const result = await api.upload.extract(file);
          fileContent = result.text;
          fileLang = result.lang;
          if (result.truncated) showToast('Файл обрезан до 60 000 символов', 'warning');
        } catch (err: any) {
          showToast(err.message ?? 'Ошибка загрузки файла', 'error');
          return;
        }
      }
    }

    const displayContent = prompt || (fileName ? `[Файл: ${fileName}]` : '');
    const tempUserMsg = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user' as const,
      content: displayContent,
      mode,
      tokensCost: 0,
      cacheHit: false,
      mediaUrl: fileDisplayUrl,
      fileName: fileName ?? null,
      createdAt: new Date().toISOString(),
    };
    addMessage(tempUserMsg);
    setStreaming(true);

    try {
      const { sendMessage: send } = await import('@/lib/socket');

      const historyBase = messages
        .filter((m) => m.id !== tempUserMsg.id)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

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

      const history = isWritingPrompt
        ? [...IMAGE_PROMPT_GUIDE, ...historyBase]
        : historyBase;

      const { tokensCost, cacheHit, title: newTitle } = await send({
        chatId: id,
        mode: mode as 'chat' | 'think',
        prompt,
        history,
        jwt: accessToken,
        imageUrl,
        fileContent,
        fileName,
        fileLang,
        preferredModel,
      });

      const { streamContent } = useChatStore.getState();
      const assistantMsg = {
        id: `msg-${Date.now()}`,
        role: 'assistant' as const,
        content: streamContent,
        mode,
        tokensCost,
        cacheHit,
        mediaUrl: null,
        createdAt: new Date().toISOString(),
      };
      commitStream(assistantMsg);

      if (newTitle) {
        const { updateChat } = useChatStore.getState();
        updateChat(id, { title: newTitle });
      }

    } catch (err: any) {
      setStreaming(false);
      if (err.code === 'LIMIT_MESSAGES_DAILY') {
        setLimitType('LIMIT_MESSAGES_DAILY');
      } else if (err.code === 'LIMIT_MESSAGES') {
        setLimitType('LIMIT_MESSAGES');
      } else if (err.code === 'LIMIT_IMAGES') {
        setLimitType('LIMIT_IMAGES');
      } else if (err.code === 'LIMIT_FILES') {
        setLimitType('LIMIT_FILES');
      } else if (err.code === 'FREE_LOCKED') {
        setLimitType('FREE_LOCKED');
      } else if (err.code === 'PLAN_RESTRICTED') {
        showToast('Эта функция доступна только на платных тарифах', 'error');
        router.push('/billing');
      } else if (err.code === 'TASK_IN_PROGRESS') {
        showToast('Подождите — предыдущий запрос ещё выполняется', 'warning');
      } else if (err.code === 'RATE_LIMITED') {
        showToast('Слишком быстро! Подождите минуту.', 'warning');
      }
    }
  }, [id, messages, mode, accessToken, isStreaming, generatingImage, generatingVideo, generatingMusic, chatMode, user, messagesReady, handleGenerateImage, handleGenerateVideo, handleGenerateMusic, showToast]);

  const busy = isStreaming || generatingImage || generatingVideo || generatingMusic || !messagesReady;

  // isLoading = true when we're waiting for token OR waiting for messages from server
  const isLoading = !accessToken || !messagesReady;

  const placeholder = chatMode === 'images'
    ? 'Опишите изображение...'
    : chatMode === 'video'
      ? 'Опишите видео...'
      : chatMode === 'music'
        ? 'Опишите стиль или настроение музыки...'
        : 'Продолжайте диалог...';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <LimitPopup type={limitType} onClose={() => setLimitType(null)} />

      <ChatWindow onSuggestion={handleSend} isLoading={isLoading} />

      <InputBar
        onSend={handleSend}
        onStop={() => { abortStream(); setStreaming(false); }}
        isStreaming={busy}
        placeholder={placeholder}
        preferredModel={preferredModel}
        setPreferredModel={setPreferredModel}
        userPlan={user?.plan}
        onUpgradeRequired={() => setLimitType('FREE_LOCKED')}
        chatMode={chatMode}
        setChatMode={setChatMode}
      />
    </div>
  );
}
