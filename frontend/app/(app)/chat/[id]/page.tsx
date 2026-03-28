'use client';

import { useEffect, useCallback, use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { connectWS, onToken, abortStream, type WSChunk } from '@/lib/socket';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { InputBar } from '@/components/chat/InputBar';
import { useToast } from '@/components/ui/Toast';
import { LimitPopup, type LimitType } from '@/components/ui/LimitPopup';
import { getFileCategory } from '@/components/chat/InputBar';

const IMAGE_VERBS = [
  'нарисуй', 'нарисовать', 'создай', 'создать', 'сгенерируй', 'сгенерировать',
  'сделай', 'сделать', 'покажи', 'draw', 'generate', 'create', 'make',
];
const IMAGE_NOUNS = [
  'картинку', 'картину', 'картинок', 'изображение', 'изображения', 'рисунок',
  'рисунки', 'иллюстрацию', 'арт', 'image', 'picture', 'photo', 'illustration',
];
const IMAGE_EXACT = ['изображение в стиле', 'generate image', 'хочу картинку'];

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

// Extract clean image prompt from markdown (strips headers, bold markers, bullet points etc.)
function extractImagePrompt(content: string): string {
  // Try to grab the longest bold **...** span — usually the actual prompt
  const boldMatches = content.match(/\*\*([^*]{30,})\*\*/g);
  if (boldMatches && boldMatches.length > 0) {
    const longest = boldMatches
      .map((m) => m.replace(/\*\*/g, '').trim())
      .sort((a, b) => b.length - a.length)[0];
    if (longest) return longest.slice(0, 600);
  }
  // Fallback: strip all markdown formatting
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
    commitStream, setStreaming, isStreaming, mode,
    setActiveChat, chats, preferredModel, setPreferredModel,
  } = useChatStore();

  const [limitType, setLimitType] = useState<LimitType>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [messagesReady, setMessagesReady] = useState(false);

  // Load messages
  useEffect(() => {
    const chat = chats.find((c) => c.id === id);
    if (chat) setActiveChat(chat);
    api.chats.messages(id)
      .then(({ messages }) => { setMessages(messages); setMessagesReady(true); })
      .catch(() => router.replace('/chat'));
  }, [id]);

  // Auto-send initial prompt — waits until history is loaded (messagesReady) to avoid race condition
  useEffect(() => {
    if (!messagesReady) return; // wait for history to load before auto-sending

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

    (async () => {
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
      id: `temp-${Date.now()}`,
      role: 'user',
      content: prompt,
      mode: 'vision',
      tokensCost: 0,
      cacheHit: false,
      mediaUrl: sourceImageUrl ?? null,
      createdAt: new Date().toISOString(),
    });

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
      const { jobId } = await api.generate.vision({ prompt, size: '1024x1024', chatId: id, ...(sourceImageUrl ? { sourceImageUrl } : {}) });

      const poll = async (): Promise<void> => {
        const job = await api.generate.status(jobId);
        if (job.status === 'done' && job.mediaUrl) {
          const current = useChatStore.getState().messages;
          useChatStore.getState().setMessages(current.map((m) =>
            m.id === placeholderId
              ? { ...m, content: prompt, mediaUrl: job.mediaUrl, tokensCost: 10 }
              : m
          ));
          if (user) {
            const { setUser } = useAuthStore.getState();
            setUser({ ...user, balanceImages: Math.max(0, user.balanceImages - 10) });
          }
        } else if (job.status === 'failed') {
          const current = useChatStore.getState().messages;
          useChatStore.getState().setMessages(current.map((m) =>
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
  }, [accessToken, user, messagesReady]);

  // ── Main send handler ────────────────────────────────────────────────────────
  const handleSend = useCallback(async (prompt: string, file?: File) => {
    if ((isStreaming || generatingImage) || !accessToken || !messagesReady) return;

    // Verb-only generation command ("сгенерируй", "нарисуй", "create" etc. without a noun)
    // → use last assistant message as the image prompt
    if (!file && prompt) {
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

    // Auto-detect image intent → generate inline
    if (!file && prompt && isImageRequest(prompt)) {
      // If user refers to previous message ("по этому промту", "по нему" etc.)
      // use the last assistant message as the actual image prompt
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
  }, [id, messages, mode, accessToken, isStreaming, generatingImage, user, messagesReady]);

  const busy = isStreaming || generatingImage || !messagesReady;

  return (
    <div className="flex flex-col h-full">
      <LimitPopup type={limitType} onClose={() => setLimitType(null)} />

      <ChatWindow onSuggestion={handleSend} />

      <InputBar
        onSend={handleSend}
        onStop={() => { abortStream(); setStreaming(false); }}
        isStreaming={busy}
        placeholder="Продолжайте диалог..."
        preferredModel={preferredModel}
        setPreferredModel={setPreferredModel}
        userPlan={user?.plan}
        onUpgradeRequired={() => setLimitType('pro')}
      />
    </div>
  );
}
