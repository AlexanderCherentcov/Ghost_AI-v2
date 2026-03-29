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
    localStorage.setItem('lastChatId', id);
    const chat = chats.find((c) => c.id === id);
    if (chat) setActiveChat(chat);
    api.chats.messages(id)
      .then(({ messages }) => { setMessages(messages); setMessagesReady(true); })
      .catch(() => { localStorage.removeItem('lastChatId'); router.replace('/chat'); });
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
          // Counter updated on backend; no local balance update needed
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
        onUpgradeRequired={() => setLimitType('FREE_LOCKED')}
      />
    </div>
  );
}
