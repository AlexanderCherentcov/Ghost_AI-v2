'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { SendIcon, AttachIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

interface InputBarProps {
  onSend: (prompt: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputBar({ onSend, disabled = false, placeholder }: InputBarProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="max-w-[720px] mx-auto">
        <div
          className={cn(
            'flex items-end gap-3 bg-[var(--bg-input)] border rounded-2xl px-4 py-3 transition-all',
            value.trim()
              ? 'border-[var(--accent-border)] shadow-[0_0_0_3px_var(--accent-glow)]'
              : 'border-[var(--border)] focus-within:border-[var(--accent-border)] focus-within:shadow-[0_0_0_3px_var(--accent-glow)]'
          )}
        >
          {/* Attach button */}
          <button
            className="text-[rgba(255,255,255,0.25)] hover:text-[rgba(255,255,255,0.5)] transition-colors flex-shrink-0 mb-0.5"
            title="Прикрепить файл"
          >
            <AttachIcon size={18} />
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); handleInput(); }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? 'Напишите что-нибудь...'}
            disabled={disabled}
            rows={1}
            style={{ fontSize: '16px' }} /* prevent iOS auto-zoom on focus */
            className={cn(
              'flex-1 bg-transparent resize-none outline-none text-[rgba(255,255,255,0.88)] placeholder:text-[rgba(255,255,255,0.2)] leading-6 max-h-[200px]',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />

          {/* Send button */}
          <motion.button
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            whileTap={{ scale: 0.92 }}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all mb-0.5',
              value.trim() && !disabled
                ? 'bg-accent text-white hover:opacity-90'
                : 'bg-[var(--bg-elevated)] text-[rgba(255,255,255,0.25)] cursor-not-allowed'
            )}
          >
            <SendIcon size={16} />
          </motion.button>
        </div>

        <p className="text-center text-[11px] text-[rgba(255,255,255,0.15)] mt-2">
          GhostLine может ошибаться. Проверяйте важную информацию.
        </p>
      </div>
    </div>
  );
}
