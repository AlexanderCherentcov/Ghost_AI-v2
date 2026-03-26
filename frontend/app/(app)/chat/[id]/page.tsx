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

  // Auto-send initial prompt (and optional image) from new chat creation
  useEffect(() => {
    const initialPrompt = sessionStorage.getItem('initialPrompt');
    const initialImageUrl = sessionStorage.getItem('initialImageUrl');
    if (initialPrompt || initialImageUrl) {
      sessionStorage.removeItem('initialPrompt');
      sessionStorage.removeItem('initialImageUrl');
      // Pass a synthetic File-like object via imageUrl directly in handleSend
      setTimeout(async () => {
        if (initialImageUrl) {
          // Convert base64 back to File so handleSend can process it
          const res = await fetch(initialImageUrl);
          const blob = await res.blob();
          const file = new File([blob], 'image.jpg', { type: 'image/jpeg' });
          handleSend(initialPrompt ?? '', file);
        } else {
          handleSend(initialPrompt ?? '');
        }
      }, 300);
    }
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

    // If image attached, resize to base64
    let imageUrl: string | undefined;
    if (file && file.type.startsWith('image/')) {
      try {
        imageUrl = await resizeImageToBase64(file);
      } catch {
        imageUrl = undefined;
      }
    }

    // Optimistically add user message (show image preview immediately)
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      role: 'user' as const,
      content: prompt,
      mode,
      tokensCost: 0,
      cacheHit: false,
      mediaUrl: imageUrl ?? null,
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
