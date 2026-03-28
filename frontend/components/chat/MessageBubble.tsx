'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GhostIcon } from '@/components/icons/GhostIcon';
import { CopyIcon, CheckIcon } from '@/components/icons';
import type { Message } from '@/lib/api';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-3 py-3 group ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {/* Ghost avatar */}
      {!isUser && (
        <div className="flex-shrink-0 mt-0.5">
          <GhostIcon size={24} className="text-accent" />
        </div>
      )}

      <div className={`relative max-w-[85%] ${isUser ? 'order-first' : ''}`}>
        {isUser ? (
          /* User bubble */
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[18px_4px_18px_18px] px-4 py-3 text-sm text-[rgba(255,255,255,0.88)] leading-relaxed">
            {/* Image preview */}
            {message.mediaUrl && (
              <div className="mb-2 rounded-xl overflow-hidden max-w-[260px]">
                <img
                  src={message.mediaUrl}
                  alt="Прикреплённое изображение"
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
              </div>
            )}
            {/* File attachment chip (for non-image files) */}
            {!message.mediaUrl && message.fileName && (
              <FileChip name={message.fileName} />
            )}
            {/* Text content */}
            {message.content && message.content !== `[Файл: ${message.fileName}]` && (
              <span>{message.content}</span>
            )}
          </div>
        ) : (
          /* Ghost response — clean text like Gemini */
          <div className="flex-1">
            {message.mediaUrl ? (
              <MediaContent mediaUrl={message.mediaUrl} mode={message.mode} />
            ) : (
              <div className="prose-ghost text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}

            {/* Actions */}
            <div className="mt-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-[11px] text-[rgba(255,255,255,0.3)] hover:text-white transition-colors"
              >
                {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
              {message.cacheHit && (
                <span className="text-[11px] text-[rgba(123,92,240,0.5)]">⚡ Кэш</span>
              )}
              {message.tokensCost > 0 && (
                <span className="text-[11px] text-[rgba(255,255,255,0.2)]">
                  {message.tokensCost.toLocaleString()} токенов
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return '📄';
  if (['doc','docx','odt'].includes(ext)) return '📝';
  if (['xls','xlsx','ods','csv','tsv'].includes(ext)) return '📊';
  if (['ppt','pptx'].includes(ext)) return '📑';
  if (['js','jsx','ts','tsx','mjs'].includes(ext)) return '⚡';
  if (['py','pyw'].includes(ext)) return '🐍';
  if (['html','htm','xml','svg'].includes(ext)) return '🌐';
  if (['json','yaml','yml','toml'].includes(ext)) return '⚙️';
  if (['sql'].includes(ext)) return '🗄️';
  if (['sh','bash','zsh','ps1'].includes(ext)) return '💻';
  if (['md','markdown','rst'].includes(ext)) return '📋';
  return '📎';
}

function FileChip({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2 bg-[rgba(255,255,255,0.06)] rounded-lg px-2.5 py-1.5 w-fit max-w-[240px]">
      <span className="text-sm leading-none">{fileIcon(name)}</span>
      <span className="text-xs text-[rgba(255,255,255,0.7)] truncate">{name}</span>
    </div>
  );
}

async function downloadImage(url: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `ghostline-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
}

function MediaContent({ mediaUrl, mode }: { mediaUrl: string; mode: string }) {
  if (mode === 'vision') {
    return (
      <div className="rounded-xl overflow-hidden border border-[var(--border)] max-w-sm">
        <img src={mediaUrl} alt="Generated" className="w-full h-auto" loading="lazy" />
        <div className="flex justify-end px-3 py-2 bg-[var(--bg-elevated)]">
          <button
            onClick={() => downloadImage(mediaUrl)}
            className="flex items-center gap-1.5 text-[11px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Скачать
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'sound') {
    return (
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-4">
        <audio controls src={mediaUrl} className="w-full" />
      </div>
    );
  }

  if (mode === 'reel') {
    return (
      <div className="rounded-xl overflow-hidden border border-[var(--border)] max-w-sm">
        <video controls src={mediaUrl} className="w-full h-auto" />
      </div>
    );
  }

  return null;
}
