'use client';

import { useEffect, useCallback, use, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { connectWS, onToken, abortStream, type WSChunk } from '@/lib/socket';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { InputBar } from '@/components/chat/InputBar';
import { ChatQuickActions, type QuickMode } from '@/components/chat/ChatQuickActions';
import { useToast } from '@/components/ui/Toast';
import { LimitPopup, type LimitType } from '@/components/ui/LimitPopup';
import { getFileCategory } from '@/components/chat/InputBar';

// Keywords that trigger image generation routing
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

/** Resize an image File to max 800px and return as base64 JPEG data URL */
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
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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

interface Props {
  params: Promise<{ id: string }>;
}

export default function ChatConversationPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const { show: showToast } = useToast();
  const {
    messages, setMessages, addMessage, appendStreamToken,
    commitStream, setStreaming, isStreaming, mode, setMode,
    setActiveChat, chats, preferredModel, setPreferredModel,
  } = useChatStore();

  const [quickMode, setQuickMode] = useState<QuickMode>(null);
  const [limitType, setLimitType] = useState<LimitType>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [imageSuggestion, setImageSuggestion] = useState<string | null>(null);

  // Load messages
  useEffect(() => {
    const chat = chats.find((c) => c.id === id);
    if (chat) setActiveChat(chat);
    api.chats.messages(id)
      .then(({ messages }) => setMessages(messages))
      .catch(() => router.replace('/chat'));
  }, [id]);

  // Auto-send initial prompt
  useEffect(() => {
    const initialPrompt      = sessionStorage.getItem('initialPrompt');
    const initialImagePrompt = sessionStorage.getItem('initialImagePrompt');
    const initialImageUrl    = sessionStorage.getItem('initialImageUrl');
    const initialFileContent = sessionStorage.getItem('initialFileContent');
    const initialFileName    = sessionStorage.getItem('initialFileName');
    const initialFileLang    = sessionStorage.getItem('initialFileLang');
    const initialBinaryUrl   = sessionStorage.getItem('initialBinaryFileUrl');
    const initialFileMime    = sessionStorage.getItem('initialFileMime');

    const hasAny = initialPrompt || initialImagePrompt || initialImageUrl || initialFileContent || initialBinaryUrl;
    if (!hasAny) return;

    ['initialPrompt','initialImagePrompt','initialImageUrl','initialFileContent',
     'initialFileName','initialFileLang','initialBinaryFileUrl','initialFileMime',
    ].forEach((k) => sessionStorage.removeItem(k));

    setTimeout(async () => {
      if (initialImagePrompt) {
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
    }, 300);
  }, [id]);

  // Connect WS
  useEffect(() => {
    connectWS();
    const unsub = onToken((chunk: WSChunk) => {
      if (chunk.type === 'token' && chunk.data) appendStreamToken(chunk.data);
    });
    return unsub;
  }, []);

  // ── Inline image generation ─────────────────────────────────────────────────
  const handleGenerateImage = useCallback(async (prompt: string) => {
    if (!accessToken) return;
    setGeneratingImage(true);
    setImageSuggestion(null);

    // Add user message
    addMessage({
      id: `temp-${Date.now()}`,
      role: 'user',
      content: prompt,
      mode: 'vision',
      tokensCost: 0,
      cacheHit: false,
      mediaUrl: null,
      createdAt: new Date().toISOString(),
    });

    // Placeholder "generating" message
    const placeholderId = `gen-${Date.now()}`;
    addMessage({
      id: placeholderId,
      role: 'assistant',
      content: '⏳ Генерирую изображение...',
      mode: 'vision',
      tokensCost: 0,
      cacheHit: false,
      mediaUrl: null,
      createdAt: new Date().toISOString(),
    });

    try {
      const { jobId } = await api.generate.vision({ prompt, size: '1024x1024' });

      // Poll for result
      const poll = async (): Promise<void> => {
        const job = await api.generate.status(jobId);
        if (job.status === 'done' && job.mediaUrl) {
          const { setMessages } = useChatStore.getState();
          const current = useChatStore.getState().messages;
          setMessages(current.map((m) =>
            m.id === placeholderId
              ? { ...m, content: prompt, mediaUrl: job.mediaUrl, tokensCost: 10 }
              : m
          ));
          if (user) {
            const { setUser } = useAuthStore.getState();
            setUser({ ...user, balanceImages: Math.max(0, user.balanceImages - 10) });
          }
        } else if (job.status === 'failed') {
          const { setMessages } = useChatStore.getState();
          const current = useChatStore.getState().messages;
          setMessages(current.map((m) =>
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
      showToast(err.message ?? 'Ошибка генерации изображения', 'error');
    } finally {
      setGeneratingImage(false);
    }
  }, [accessToken, user]);

  // ── Main send handler ────────────────────────────────────────────────────────
  const handleSend = useCallback(async (prompt: string, file?: File) => {
    if ((isStreaming || generatingImage) || !accessToken) return;

    // Auto-route: image-create mode → generate inline
    if (quickMode === 'image-create') {
      setQuickMode(null);
      return handleGenerateImage(prompt);
    }

    // Auto-detect image intent in plain chat → show suggestion banner
    if (quickMode === null && prompt && isImageRequest(prompt)) {
      setImageSuggestion(prompt);
      return;
    }

    // image-edit: attach file to prompt for vision API
    if (quickMode === 'image-edit' && !file) {
      showToast('Прикрепите фото для редактирования', 'warning');
      return;
    }

    // ── Process attached file ────────────────────────────────────────────────
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
      id: `temp-${Date.now()}`,
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

      const history = messages
        .filter((m) => m.id !== tempUserMsg.id)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

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

      if (user) {
        const { setUser } = useAuthStore.getState();
        setUser({ ...user, balanceMessages: Math.max(0, user.balanceMessages - tokensCost) });
      }
    } catch (err: any) {
      setStreaming(false);
      if (err.code === 'LIMIT_MESSAGES') {
        setLimitType('messages');
      } else if (err.code === 'LIMIT_IMAGES') {
        setLimitType('images');
      } else if (err.code === 'PLAN_RESTRICTED') {
        showToast('Эта функция доступна только на платных тарифах', 'error');
        router.push('/billing');
      } else if (err.code === 'TASK_IN_PROGRESS') {
        showToast('Подождите — предыдущий запрос ещё выполняется', 'warning');
      } else if (err.code === 'RATE_LIMITED') {
        showToast('Слишком быстро! Подождите минуту.', 'warning');
      }
    }
  }, [id, messages, mode, accessToken, isStreaming, generatingImage, user, quickMode]);

  const busy = isStreaming || generatingImage;

  return (
    <div className="flex flex-col h-full">
      <LimitPopup type={limitType} onClose={() => setLimitType(null)} />
      <ChatWindow onSuggestion={handleSend} />

      {/* Image suggestion banner (auto-detected intent) */}
      <AnimatePresence>
        {imageSuggestion && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mx-4 mb-2 max-w-[720px] mx-auto w-full"
          >
            <div className="bg-[rgba(92,140,240,0.08)] border border-[rgba(92,140,240,0.25)] rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-lg">🖼️</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[rgba(255,255,255,0.6)]">Похоже, вы хотите создать изображение</p>
                <p className="text-xs text-[rgba(255,255,255,0.3)] truncate">«{imageSuggestion}»</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => { const p = imageSuggestion; setImageSuggestion(null); handleGenerateImage(p); }}
                  className="text-xs px-3 py-1.5 bg-[#5C8CF0] text-white rounded-lg hover:opacity-90 transition-opacity"
                >
                  Создать
                </button>
                <button
                  onClick={() => { const p = imageSuggestion; setImageSuggestion(null); handleSend(p); }}
                  className="text-xs px-3 py-1.5 border border-[var(--border)] text-[rgba(255,255,255,0.5)] rounded-lg hover:text-white transition-colors"
                >
                  Чат
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick actions bar */}
      <ChatQuickActions
        onSelect={setQuickMode}
        activeMode={quickMode}
        isPaidPlan={user?.plan !== 'FREE'}
      />

      {/* Model selector */}
      <div className="flex items-center gap-1.5 px-4 pb-2 max-w-[720px] mx-auto w-full">
        <span className="text-[11px] text-[rgba(255,255,255,0.3)] mr-1">Модель:</span>
        {([
          { key: 'haiku' as const,    label: '⚡ Быстрая' },
          { key: 'deepseek' as const, label: '🧠 Про' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPreferredModel(preferredModel === key ? undefined : key)}
            className={`px-3 py-1 rounded-full text-[11px] border transition-all ${
              preferredModel === key
                ? 'border-accent bg-[var(--accent-dim)] text-accent'
                : 'border-[var(--border)] text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.6)]'
            }`}
          >
            {label}
          </button>
        ))}
        {preferredModel && (
          <button
            onClick={() => setPreferredModel(undefined)}
            className="ml-1 text-[10px] text-[rgba(255,255,255,0.25)] hover:text-[rgba(255,255,255,0.5)] transition-colors"
          >
            Авто
          </button>
        )}
      </div>

      <InputBar
        onSend={handleSend}
        onStop={() => { abortStream(); setStreaming(false); }}
        isStreaming={busy}
        placeholder={
          quickMode === 'image-create' ? '✨ Опишите картинку которую хотите создать...' :
          quickMode === 'image-edit'   ? '🎨 Прикрепите фото и опишите изменения...' :
          'Продолжайте диалог...'
        }
      />
    </div>
  );
}
