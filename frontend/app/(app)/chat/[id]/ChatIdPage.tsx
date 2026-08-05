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
import {
  IMAGE_VERBS, REF_KEYWORDS,
  isOnlyImageIntent, isImageRequest, isImageEditRequest, isPromptComposeRequest, extractImagePrompt,
} from '@/lib/image-intent';

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
  // В статическом экспорте все маршруты /chat/* отдаются из /chat/index/index.html,
  // поэтому params.id всегда равен 'index'. Настоящий ID чата читаем из URL браузера.
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
  const [fillPrompt, setFillPrompt] = useState('');
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [generatingMusic, setGeneratingMusic] = useState(false);
  const [messagesReady, setMessagesReady] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('chat');
  const [dispatchResult, setDispatchResult] = useState<{ category: string; autoFill: Record<string, unknown> } | null>(null);
  const dispatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Автозаголовок + обновление баланса — срабатывает после генерации картинки/видео/музыки
  const triggerAutoTitle = useCallback((prompt: string) => {
    // Обновляем баланс Caspers сразу, чтобы сайдбар обновился без перезагрузки страницы
    useAuthStore.getState().refreshUser();
    // Генерируем заголовок при первой генерации
    api.chats.autoTitle(id, prompt)
      .then(({ title }) => {
        if (title && title !== 'Новый чат') {
          useChatStore.getState().updateChat(id, { title });
        }
      })
      .catch(() => {});
  }, [id]);

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

  // Загружаем сообщения + возобновляем незавершённую задачу генерации после перезагрузки страницы
  useEffect(() => {
    // Ждём accessToken — он живёт только в памяти и восстанавливается асинхронно
    // через вызов refreshToken в providers.tsx. Без этой проверки запрос
    // уйдёт раньше, чем токен будет готов, и получит 401.
    if (!accessToken) return;
    // Предотвращаем повторную загрузку для того же чата (например, при тихом обновлении токена в середине сессии).
    // Отслеживаем по ID, чтобы переключение на другой чат всегда вызывало повторную загрузку.
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

        // Восстанавливаем URL последней сгенерированной картинки, чтобы запросы редактирования сохраняли контекст после перезагрузки
        const lastImg = [...messages].reverse().find(
          (m) => m.role === 'assistant' && m.mode === 'vision' && m.mediaUrl && m.mediaUrl !== '__loading__'
        );
        if (lastImg?.mediaUrl) lastGeneratedImageRef.current = lastImg.mediaUrl;

        // Возобновляем незавершённую задачу генерации, если пользователь обновил страницу во время генерации
        const stored = localStorage.getItem(`pending_gen_${id}`);
        if (!stored) return;
        try {
          const { jobId, mode, prompt } = JSON.parse(stored) as { jobId: string; mode: 'vision' | 'reel'; prompt: string };
          // Если результат уже попал в сообщения из БД — просто убираем след
          const alreadyDone = messages.some(
            (m) => m.role === 'assistant' && m.mode === mode && m.mediaUrl && m.mediaUrl !== '__loading__'
          );
          if (alreadyDone) { localStorage.removeItem(`pending_gen_${id}`); return; }

          // Добавляем плейсхолдер и возобновляем опрос
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

  // Автоотправка начального промта — ждёт загрузки истории (messagesReady), чтобы избежать гонки
  useEffect(() => {
    if (!messagesReady) return; // ждём загрузки истории перед автоотправкой
    if (autoSentChatRef.current === id) return; // для этого чата уже отправлено автоматически

    const initialPrompt      = sessionStorage.getItem('initialPrompt');
    const initialImagePrompt = sessionStorage.getItem('initialImagePrompt');
    const initialVideoPrompt = sessionStorage.getItem('initialVideoPrompt');
    const initialVideoOptionsRaw = sessionStorage.getItem('initialVideoOptions');
    let initialVideoOptions: VideoOptions | undefined;
    if (initialVideoOptionsRaw) {
      try { initialVideoOptions = JSON.parse(initialVideoOptionsRaw); } catch {}
    }
    const initialMusicPrompt = sessionStorage.getItem('initialMusicPrompt');
    const initialMusicMode = (sessionStorage.getItem('initialMusicMode') ?? 'short') as MusicMode;
    const initialMusicDuration = sessionStorage.getItem('initialMusicDuration') ? Number(sessionStorage.getItem('initialMusicDuration')) : undefined;
    const initialLyrics = sessionStorage.getItem('initialLyrics') ?? undefined;
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

    autoSentChatRef.current = id; // помечаем чат как автоотправленный до начала асинхронной работы
    ['initialPrompt','initialImagePrompt','initialVideoPrompt','initialVideoOptions','initialMusicPrompt','initialMusicMode','initialMusicDuration',
     'initialLyrics','initialSunoStyle','initialSunoTitle','initialSunoInstrumental',
     'initialImageUrl','initialFileContent','initialFileName','initialFileLang','initialBinaryFileUrl','initialFileMime',
    ].forEach((k) => sessionStorage.removeItem(k));

    (async () => {
      if (initialVideoPrompt) {
        handleGenerateVideo(initialVideoPrompt, initialVideoOptions);
      } else if (initialMusicPrompt) {
        handleGenerateMusic(initialMusicPrompt, initialMusicMode, initialMusicDuration, initialSunoStyle, initialSunoTitle, initialSunoInstrumental, initialLyrics);
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

  // Подключаем WS
  useEffect(() => {
    connectWS();
    const unsub = onToken((chunk: WSChunk) => {
      if (chunk.type === 'token' && chunk.data) appendStreamToken(chunk.data);
    });
    return unsub;
  }, []);

  // ── Встроенная генерация изображений ──────────────────────────────────────────
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
          triggerAutoTitle(prompt);
          // Счётчик обновляется на бэкенде; локально баланс обновлять не нужно
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
  }, [accessToken, user, messagesReady, triggerAutoTitle]);

  // ── Генерация видео ────────────────────────────────────────────────────────────
  const handleGenerateVideo = useCallback(async (prompt: string, options?: VideoOptions) => {
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
      mediaUrl: options?.imageUrl ?? null,
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
        videoModel: options?.videoModel,
        videoDuration: options?.duration,
        videoAspectRatio: options?.aspectRatio,
        videoEnableAudio: options?.enableAudio,
        videoResolution: options?.resolution,
        videoImageUrl: options?.imageUrl || undefined,
        negativePrompt: options?.negativePrompt || undefined,
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
          triggerAutoTitle(prompt);
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
  }, [accessToken, messagesReady, triggerAutoTitle]);

  // ── Генерация музыки ───────────────────────────────────────────────────────────
  const handleGenerateMusic = useCallback(async (prompt: string, musicMode: MusicMode = 'short', musicDuration?: number, sunoStyle?: string, sunoTitle?: string, sunoInstrumental?: boolean, lyrics?: string) => {
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
      const { jobId } = await api.generate.sound({ prompt, chatId: id, musicMode, musicDuration, lyrics, sunoStyle, sunoTitle, sunoInstrumental });

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
          triggerAutoTitle(prompt);
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
        showToast('Генерация музыки доступна только на платных тарифах', 'error');
        router.push('/billing');
      } else {
        showToast(err.message ?? 'Ошибка генерации музыки', 'error');
      }
    } finally {
      generatingMusicRef.current = false;
      setGeneratingMusic(false);
    }
  }, [accessToken, messagesReady, triggerAutoTitle]);

  // ── Диспетчер — определение намерения по вводу пользователя с задержкой ────────
  const handleInputChange = useCallback((text: string) => {
    // Автоопределение только в режиме чата; пропускаем, если пользователь уже открыл виджет
    if (chatMode !== 'chat') return;
    if (dispatchTimerRef.current) clearTimeout(dispatchTimerRef.current);
    if (text.trim().length < 4) { setDispatchResult(null); return; }
    dispatchTimerRef.current = setTimeout(async () => {
      try {
        // Передаём последние 3 сообщения как контекст, чтобы диспетчер понимал "давай", "сделай это" и т.п.
        const recentContext = useChatStore.getState().messages
          .slice(-3)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 400) }));
        const result = await api.dispatch(text.trim(), recentContext.length > 0 ? recentContext : undefined);
        if (result.category !== 'chat') setDispatchResult(result);
        else setDispatchResult(null);
      } catch {
        // молча игнорируем — диспетчер работает по принципу best-effort
      }
    }, 800);
  }, [chatMode]);

  // Сбрасываем результат диспетчера при явном переключении режима пользователем
  const handleSetChatMode = useCallback((m: ChatMode) => {
    setChatMode(m);
    setDispatchResult(null);
    if (dispatchTimerRef.current) clearTimeout(dispatchTimerRef.current);
  }, []);

  // "⚡ Использовать промт" — заполняет InputBar промтом.
  // Переключает на нужный режим, чтобы появились виджеты (модель, длительность и т.п.)
  // и пользователь мог настроить параметры перед отправкой.
  const handleUsePrompt = useCallback((prompt: string, messageMode?: string) => {
    if (messageMode === 'reel') {
      handleSetChatMode('video');
    } else if (messageMode === 'sound') {
      handleSetChatMode('music');
    } else if (messageMode === 'vision') {
      handleSetChatMode('images');
    } else {
      // Промт из режима чата (пользователь попросил AI написать промт для генерации) —
      // по ключевым словам определяем видео это или картинка и переключаемся автоматически
      const lower = prompt.toLowerCase();
      const isVideoPrompt = ['camera', 'motion', 'shot', 'dolly', 'pan ', 'zoom', 'fps', 'cinematic move'].some(k => lower.includes(k));
      handleSetChatMode(isVideoPrompt ? 'video' : 'images');
    }
    setFillPrompt(prompt);
  }, [handleSetChatMode]);

  // ── Главный обработчик отправки ─────────────────────────────────────────────────
  const handleSend = useCallback(async (prompt: string, file?: File, videoOptions?: VideoOptions, musicMode?: MusicMode, musicDuration?: number, sunoStyle?: string, sunoTitle?: string, sunoInstrumental?: boolean, lyrics?: string) => {
    if ((isStreaming || generatingImage || generatingVideo || generatingMusic) || !accessToken || !messagesReady) return;
    // Сбрасываем предложение диспетчера при каждой отправке
    setDispatchResult(null);

    // ── Маршрутизация по режиму ────────────────────────────────────────────────
    // В режимах картинок/видео/музыки пользователь ВСЕГДА хочет генерацию — никогда не уходим в обычный AI-чат.
    // isPromptComposeRequest актуален только в режиме чата (где пользователь просит AI *написать* промт).
    if (chatMode === 'images' && !file) {
      if (prompt && isImageEditRequest(prompt) && lastGeneratedImageRef.current) {
        return handleGenerateImage(prompt, lastGeneratedImageRef.current);
      }
      return handleGenerateImage(prompt || 'beautiful landscape');
    }
    if (chatMode === 'video') {
      const hasSourceImage = !!(file && getFileCategory(file) === 'image');
      if (!prompt.trim() && !hasSourceImage) return;

      // Image-to-video: прикреплённая картинка загружается на сервер,
      // её публичный URL уходит провайдеру как источник видео
      let effectiveVideoOptions = videoOptions;
      if (hasSourceImage) {
        try {
          const { url } = await api.upload.image(file!);
          const base: VideoOptions = videoOptions ?? {
            videoModel: 'motion', duration: '8s', aspectRatio: '16:9',
            enableAudio: false, resolution: '720p', negativePrompt: '',
          };
          effectiveVideoOptions = { ...base, imageUrl: url };
        } catch {
          showToast('Не удалось загрузить изображение', 'error');
          return;
        }
      }

      const lower = prompt.toLowerCase();
      const isRef = REF_KEYWORDS.some(kw => lower.includes(kw));
      if (isRef) {
        // "сделай по промту", "используй это" → извлекаем из последнего сообщения AI
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && !m.mediaUrl);
        if (lastAssistant) {
          const extracted = extractImagePrompt(lastAssistant.content);
          if (extracted && extracted.length > 20) return handleGenerateVideo(extracted, effectiveVideoOptions);
        }
        showToast('Вставьте промт в поле ввода и нажмите отправить', 'warning');
        return;
      }
      return handleGenerateVideo(prompt.trim() || 'animate this image', effectiveVideoOptions);
    }
    if (chatMode === 'music') {
      if (!prompt.trim()) return;
      const lower = prompt.toLowerCase();
      const isRef = REF_KEYWORDS.some(kw => lower.includes(kw));
      if (isRef) {
        // "сделай по промту" → извлекаем из последнего сообщения AI
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant' && !m.mediaUrl);
        if (lastAssistant) {
          const extracted = extractImagePrompt(lastAssistant.content);
          if (extracted && extracted.length > 20) return handleGenerateMusic(extracted, musicMode ?? 'short', musicDuration, sunoStyle, sunoTitle, sunoInstrumental, lyrics);
        }
        showToast('Вставьте промт в поле ввода и нажмите отправить', 'warning');
        return;
      }
      return handleGenerateMusic(prompt, musicMode ?? 'short', musicDuration, sunoStyle, sunoTitle, sunoInstrumental, lyrics);
    }

    // ── Маршрутизация намерения по картинке ───────────────────────────────────
    // Флаг: пользователь хочет, чтобы AI НАПИСАЛ промт для картинки (а не сгенерировал её напрямую)
    let isWritingPrompt = false;

    if (!file && prompt) {
      const lower = prompt.toLowerCase().trim();

      // 1. Только глагол: одиночный глагол ИЛИ глагол + местоимение/ссылочное слово (существительное про картинку не нужно)
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

      // 2. Пользователь хочет, чтобы AI НАПИСАЛ промт — содержит "промт", но НЕ как ссылку.
      //    "напиши промт битва ангелов", "создай промт для изображения 9:18"
      //    → уходим в обычный AI-чат с добавленной в историю инструкцией по промтам для картинок
      if (isPromptComposeRequest(prompt)) {
        isWritingPrompt = true;
        // проваливаемся в обычный AI-чат ниже
      } else if (isImageRequest(prompt)) {
        // 3. Есть ссылочное ключевое слово → извлекаем промт из последнего сообщения ассистента
        //    "сгенерируй изображение по этому промту", "нарисуй картинку по нему"
        const isRef = REF_KEYWORDS.some((kw) => lower.includes(kw));
        if (isRef) {
          const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.mediaUrl);
          if (lastAssistant) {
            return handleGenerateImage(extractImagePrompt(lastAssistant.content));
          }
        }
        // 4. Только намерение ("хочу картинку", "хотел бы сделать изображение") → переключаемся в режим картинок
        if (isOnlyImageIntent(prompt)) {
          handleSetChatMode('images');
          return;
        }
        // 5. В промте есть реальное описание → генерируем напрямую
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

          // Редактирование картинки: пользователь прикрепил изображение и хочет его изменить
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
          content: 'Когда я прошу написать промт — имею в виду промт для AI-генерации изображений (DALL-E / Stable Diffusion). Пиши промт на английском с деталями стиля, освещения, композиции, качества — оформляй в блоке кода ```. После блока кода добавляй русский перевод промта обычным текстом.',
        },
        {
          role: 'assistant' as const,
          content: 'Понял! Буду писать детальные промты для AI-генерации изображений: английский вариант в блоке кода, затем русский перевод — чтобы было понятно что именно сгенерирует нейросеть.',
        },
      ];
      const VIDEO_PROMPT_GUIDE = [
        {
          role: 'user' as const,
          content: 'Когда я прошу написать промт для видео — имею в виду промт для AI-генерации видео (Veo / Kling). Пиши промт на английском: сцена, движение камеры, действия, атмосфера, стиль — оформляй в блоке кода ```. После блока кода добавляй русский перевод промта обычным текстом.',
        },
        {
          role: 'assistant' as const,
          content: 'Понял! Буду писать детальные промты для AI-генерации видео: английский вариант в блоке кода, затем русский перевод.',
        },
      ];
      const MUSIC_PROMPT_GUIDE = [
        {
          role: 'user' as const,
          content: 'Когда я прошу написать промт для музыки — имею в виду промт для AI-генерации трека (Suno). Пиши промт на английском: жанр, инструменты, темп, настроение, вокал — кратко через запятую, оформляй в блоке кода ```. После блока кода добавляй русский перевод промта обычным текстом.',
        },
        {
          role: 'assistant' as const,
          content: 'Понял! Буду писать промты для AI-генерации музыки: английский вариант в блоке кода, затем русский перевод.',
        },
      ];

      // Режимы video/music всегда завершаются выше через return, поэтому activeGuide используется
      // только в режиме чата (когда пользователь просит AI *написать* промт для картинки)
      const activeGuide = IMAGE_PROMPT_GUIDE;

      const history = isWritingPrompt
        ? [...activeGuide, ...historyBase]
        : historyBase;

      const { tokensCost, cacheHit } = await send({
        chatId: id,
        mode: preferredModel === 'deepseek' ? 'think' : 'chat',
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
      // Обновляем баланс Caspers после каждого ответа AI (токены были списаны)
      useAuthStore.getState().refreshUser();
      // Заголовок приходит отдельным WS-событием 'title' → обрабатывается глобально в socket.ts

    } catch (err: any) {
      setStreaming(false);
      if (err.code === 'LIMIT_MESSAGES_DAILY') {
        setLimitType('LIMIT_MESSAGES_DAILY');
      } else if (err.code === 'LIMIT_MESSAGES') {
        setLimitType('LIMIT_MESSAGES');
      } else if (err.code === 'LIMIT_PRO_MESSAGES' || err.code === 'LIMIT_PRO_UNAVAILABLE') {
        setLimitType('LIMIT_PRO_MESSAGES');
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
      } else if (err.code === 'STREAM_TIMEOUT') {
        showToast('Нет ответа от сервера, попробуйте ещё раз', 'error');
      } else {
        // Незнакомый/новый код ошибки — не оставляем пользователя без обратной связи
        showToast(err.message ?? 'Не удалось отправить сообщение', 'error');
      }
    }
  }, [id, messages, mode, accessToken, isStreaming, generatingImage, generatingVideo, generatingMusic, chatMode, user, messagesReady, handleGenerateImage, handleGenerateVideo, handleGenerateMusic, showToast]);

  const busy = isStreaming || generatingImage || generatingVideo || generatingMusic || !messagesReady;

  // isLoading = true, пока ждём токен ИЛИ ждём сообщения с сервера
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

      <ChatWindow onSuggestion={handleSend} onUsePrompt={handleUsePrompt} isLoading={isLoading} />

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
        setChatMode={handleSetChatMode}
        dispatchResult={dispatchResult}
        onInputChange={handleInputChange}
        fillPrompt={fillPrompt}
        userImages={user?.images_this_week}
        userMusic={user?.music_this_week}
        userVideos={user?.videos_this_month}
        userProFreeRemaining={(() => {
          const limits: Record<string, number> = { FREE: 0, BASIC: 0, PRO: 20, VIP: 50, ULTRA: -1 };
          const limit = limits[user?.plan ?? 'FREE'] ?? 0;
          return limit === -1 ? undefined : Math.max(0, limit - (user?.pro_messages_today ?? 0));
        })()}
      />
    </div>
  );
}
