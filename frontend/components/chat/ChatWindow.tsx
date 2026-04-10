'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GhostIcon } from '@/components/icons/GhostIcon';
import { MessageBubble } from './MessageBubble';
import { useChatStore } from '@/store/chat.store';
import { useAuthStore } from '@/store/auth.store';
import { greetingByHour } from '@/lib/utils';

interface ChatWindowProps {
  onSuggestion?: (text: string) => void;
  isLoading?: boolean;
}

// Skeleton rows: [side, width%]
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

export function ChatWindow({ onSuggestion, isLoading }: ChatWindowProps) {
  const { user } = useAuthStore();
  const { messages, isStreaming, streamContent, activeChat } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  const isEmpty = !messages.length && !isStreaming;

  return (
    <div className="flex-1 overflow-y-auto">
      {isLoading ? (
        <ChatSkeleton />
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <GhostIcon size={64} className="text-accent animate-float mx-auto mb-6" animated />
            <h1 className="text-3xl font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Чем займёмся?</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {greetingByHour()}{user?.name ? `, ${user.name.charAt(0).toUpperCase() + user.name.slice(1)}` : ''}.
            </p>
          </motion.div>
        </div>
      ) : (
        <div className="max-w-[720px] mx-auto px-4 py-6 space-y-1">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </AnimatePresence>

          {/* Streaming message */}
          {isStreaming && streamContent && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 py-4"
            >
              <GhostIcon size={24} className="text-accent flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-7 prose-ghost" style={{ color: 'var(--text-primary)' }}>
                <span>{streamContent}</span>
                <span className="ghost-cursor" />
              </div>
            </motion.div>
          )}

          {/* Typing indicator */}
          {isStreaming && !streamContent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3 py-4"
            >
              <GhostIcon size={24} className="text-accent flex-shrink-0" />
              <div className="flex items-center gap-1.5 py-2">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
