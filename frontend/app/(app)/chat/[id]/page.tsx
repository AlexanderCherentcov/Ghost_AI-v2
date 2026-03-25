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

  // Auto-send initial prompt from new chat creation
  useEffect(() => {
    const initialPrompt = sessionStorage.getItem('initialPrompt');
    if (initialPrompt) {
      sessionStorage.removeItem('initialPrompt');
      setTimeout(() => handleSend(initialPrompt), 300);
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

  const handleSend = useCallback(async (prompt: string) => {
    if (isStreaming || !accessToken) return;

    // Optimistically add user message
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      role: 'user' as const,
      content: prompt,
      mode,
      tokensCost: 0,
      cacheHit: false,
      mediaUrl: null,
      createdAt: new Date().toISOString(),
    };
    addMessage(tempUserMsg);
    setStreaming(true);

    try {
      const { connectWS: _, sendMessage } = await import('@/lib/socket');
      const { sendMessage: send } = await import('@/lib/socket');

      const history = messages
        .filter((m) => m.id !== tempUserMsg.id)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const { tokensCost, cacheHit } = await send({
        chatId: id,
        mode: mode as 'chat' | 'think',
        prompt,
        history,
        jwt: accessToken,
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
