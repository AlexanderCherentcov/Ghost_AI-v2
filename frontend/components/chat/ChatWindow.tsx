'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ParticleAvatar } from '@/components/ParticleAvatar';
import { MessageBubble } from './MessageBubble';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { greetingByHour } from '@/lib/utils';

// Цикл лого-форм из мокапа (Chat.dc.html: CYCLE_SEQ) — используется и для простаивающего
// hero (медленно, 4000/1200), и для индикатора «думаю» (быстро, 900/500).
const CYCLE_SEQ = ['brainicon', 'claude', 'chatgpt', 'gemini', 'deepseek', 'kling', 'sora', 'perplexity'];

interface ChatWindowProps {
  onSuggestion?: (text: string) => void;
  onUsePrompt?: (prompt: string) => void;
  isLoading?: boolean;
}

// Строки скелетона: [сторона, ширина%]
const SKELETON_ROWS: Array<['left' | 'right', number]> = [
  ['left',  65],
  ['right', 45],
  ['left',  80],
  ['left',  55],
  ['right', 70],
  ['left',  40],
];

function ChatSkeleton() {
  return (
    <div className="max-w-[720px] mx-auto px-4 py-6 space-y-5">
      {SKELETON_ROWS.map(([side, w], i) => (
        <div key={i} className={`flex gap-3 ${side === 'right' ? 'justify-end' : ''}`}>
          {side === 'left' && (
            <div
              className="w-7 h-7 rounded-full flex-shrink-0 mt-1"
              style={{ background: 'var(--bg-elevated)', animation: `pulse 1.6s ease-in-out ${i * 0.1}s infinite` }}
            />
          )}
          <div
            className="h-10 rounded-2xl"
            style={{
              width: `${w}%`,
              background: side === 'left' ? 'var(--bg-elevated)' : 'var(--accent-dim)',
              borderRadius: side === 'right' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
              animation: `pulse 1.6s ease-in-out ${i * 0.1}s infinite`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export function ChatWindow({ onSuggestion, onUsePrompt, isLoading }: ChatWindowProps) {
  const { user } = useAuthStore();
  const { messages, isStreaming, streamContent, activeChat } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  const isEmpty = !messages.length && !isStreaming;

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain min-h-0 flex flex-col" style={{ touchAction: 'pan-y' }}>
      {isLoading ? (
        <ChatSkeleton />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center flex-1 min-h-0 text-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <ParticleAvatar size={88} cycleShapes={CYCLE_SEQ} stageMs={4000} transMs={1200} spinSpeed={0.006} className="mx-auto mb-6" />
            <h1 className="font-display text-3xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Чем займёмся?</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {greetingByHour()}{user?.name ? `, ${user.name.charAt(0).toUpperCase() + user.name.slice(1)}` : ''}.
            </p>
          </motion.div>
        </div>
      ) : (
        <>
          {/* Распорка прижимает сообщения к низу, когда контента мало */}
          <div className="flex-1" />
          <div className="max-w-[720px] w-full mx-auto px-4 py-6 space-y-1">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onUsePrompt={onUsePrompt} />
            ))}
          </AnimatePresence>

          {/* Стримящееся сообщение — тот же живой particle-avatar, что и у обычных
              сообщений ассистента (мокап: canvas на каждом сообщении). */}
          {isStreaming && streamContent && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 py-4"
            >
              <ParticleAvatar size={30} spinSpeed={0.006} className="flex-shrink-0 mt-0.5" />
              <div
                className="flex-1 leading-7 prose-ghost rounded-[14px] px-4 py-3"
                style={{ color: 'var(--text-primary)', background: 'var(--panel-glass)', border: '1px solid var(--panel-glass-border)' }}
              >
                <span>{streamContent}</span>
                <span className="ghost-cursor" />
              </div>
            </motion.div>
          )}

          {/* Индикатор набора текста */}
          {isStreaming && !streamContent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3 py-4 items-center"
            >
              <ParticleAvatar size={30} cycleShapes={CYCLE_SEQ} className="flex-shrink-0" />
              <div
                className="flex items-center gap-2 px-4 py-3.5 rounded-[14px]"
                style={{ background: 'var(--panel-glass)', border: '1px solid rgba(167,139,250,.16)' }}
              >
                <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Загрузка</span>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-[5px] h-[5px] rounded-full animate-[blink_1s_ease-in-out_infinite]"
                    style={{ background: '#a78bfa', animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
        </>
      )}
    </div>
  );
}
