'use client';

import { useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useChatStore } from '@/store/chat.store';
import { connectWS, onToken, abortStream, type WSChunk } from '@/lib/socket';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { InputBar } from '@/components/chat/InputBar';
import { ModeSelector } from '@/components/chat/ModeSelector';
import { useToast } from '@/components/ui/Toast';
import { getFileCategory } from '@/components/chat/InputBar';

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

/** Read a text/code file as UTF-8 string */
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
    messages,
    setMessages,
    addMessage,
    appendStreamToken,
    commitStream,
    setStreaming,
    isStreaming,
    mode,
    setMode,
    setActiveChat,
    chats,
  } = useChatStore();

  // Load messages
  useEffect(() => {
    const chat = chats.find((c) => c.id === id);
    if (chat) setActiveChat(chat);

    api.chats.messages(id)
      .then(({ messages }) => setMessages(messages))
      .catch(() => router.replace('/chat'));
  }, [id]);

  // Auto-send initial prompt (and optional file) from new chat creation
  useEffect(() => {
    const initialPrompt      = sessionStorage.getItem('initialPrompt');
    const initialImageUrl    = sessionStorage.getItem('initialImageUrl');
    const initialFileContent = sessionStorage.getItem('initialFileContent');
    const initialFileName    = sessionStorage.getItem('initialFileName');
    const initialFileLang    = sessionStorage.getItem('initialFileLang');
    const initialBinaryUrl   = sessionStorage.getItem('initialBinaryFileUrl');
    const initialFileMime    = sessionStorage.getItem('initialFileMime');

    const hasAny = initialPrompt || initialImageUrl || initialFileContent || initialBinaryUrl;
    if (!hasAny) return;

    // Clear all sessionStorage keys
    ['initialPrompt','initialImageUrl','initialFileContent',
     'initialFileName','initialFileLang','initialBinaryFileUrl','initialFileMime',
    ].forEach((k) => sessionStorage.removeItem(k));

    setTimeout(async () => {
      if (initialImageUrl) {
        const res = await fetch(initialImageUrl);
        const blob = await res.blob();
        const file = new File([blob], initialFileName ?? 'image.jpg', { type: 'image/jpeg' });
        handleSend(initialPrompt ?? '', file);
      } else if (initialBinaryUrl && initialFileName) {
        // Binary file (PDF/DOCX/XLSX): fetch from object URL and re-create File
        const res = await fetch(initialBinaryUrl);
        const blob = await res.blob();
        const file = new File([blob], initialFileName, { type: initialFileMime ?? '' });
        handleSend(initialPrompt ?? '', file);
      } else if (initialFileContent && initialFileName) {
        // Text file already extracted — inject directly bypassing handleSend file logic
        // We create a synthetic Blob so handleSend reads it as text
        const blob = new Blob([initialFileContent], { type: 'text/plain' });
        // Rename with original extension so getFileCategory returns 'text'
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
      if (chunk.type === 'token' && chunk.data) {
        appendStreamToken(chunk.data);
      }
    });

    return unsub;
  }, []);

  const handleSend = useCallback(async (prompt: string, file?: File) => {
    if (isStreaming || !accessToken) return;

    // ── Process attached file ────────────────────────────────────────────────
    let imageUrl: string | undefined;
    let fileContent: string | undefined;
    let fileName: string | undefined;
    let fileLang: string | undefined;
    let fileDisplayUrl: string | null = null; // for optimistic preview

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
        // binary (PDF, DOCX, XLSX …) — extract on backend
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

    // Optimistically add user message
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
      });

      // Build assistant message from streamed content
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

      // Update chat title if backend generated one from first message
      if (newTitle) {
        const { updateChat } = useChatStore.getState();
        updateChat(id, { title: newTitle });
      }

      // Update user token balance
      if (user) {
        const { setUser } = useAuthStore.getState();
        setUser({ ...user, tokenBalance: user.tokenBalance - tokensCost });
      }
    } catch (err: any) {
      setStreaming(false);
      if (err.code === 'INSUFFICIENT_TOKENS') {
        showToast('Недостаточно токенов — пополните баланс', 'error');
        router.push('/billing');
      }
    }
  }, [id, messages, mode, accessToken, isStreaming, user]);

  return (
    <div className="flex flex-col h-full">
      {/* Mode selector */}
      <div className="flex justify-center pt-4 px-4">
        <ModeSelector
          value={mode as 'chat' | 'vision' | 'sound' | 'reel' | 'think'}
          onChange={(m) => {
            if (m !== 'chat' && m !== 'think') {
              router.push(`/${m}`);
            } else {
              setMode(m);
            }
          }}
        />
      </div>

      <ChatWindow onSuggestion={handleSend} />

      <InputBar
        onSend={handleSend}
        onStop={() => { abortStream(); setStreaming(false); }}
        isStreaming={isStreaming}
        placeholder="Продолжайте диалог..."
      />
    </div>
  );
}
