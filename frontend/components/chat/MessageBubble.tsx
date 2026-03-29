'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GhostIcon } from '@/components/icons/GhostIcon';
import { CopyIcon, CheckIcon } from '@/components/icons';
import { ImageViewer } from '@/components/ui/ImageViewer';
import type { Message } from '@/lib/api';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const isUser = message.role === 'user';

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
    <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />
    {videoOpen && message.mediaUrl && (
      <VideoViewer url={message.mediaUrl} onClose={() => setVideoOpen(false)} />
    )}
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
          /* Ghost response */
          <div className="flex-1">
            {message.mediaUrl ? (
              <MediaContent
                mediaUrl={message.mediaUrl}
                mode={message.mode}
                onOpenImage={() => setViewerUrl(message.mediaUrl!)}
                onOpenVideo={() => setVideoOpen(true)}
              />
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
            </div>
          </div>
        )}
      </div>
    </motion.div>
    </>
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

async function downloadFile(url: string, ext = 'mp4') {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `ghostline-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
}

function MediaContent({
  mediaUrl, mode, onOpenImage, onOpenVideo,
}: {
  mediaUrl: string;
  mode: string;
  onOpenImage?: () => void;
  onOpenVideo?: () => void;
}) {
  if (mode === 'vision') {
    return (
      <div className="rounded-xl overflow-hidden border border-[var(--border)] max-w-sm">
        <img
          src={mediaUrl}
          alt="Generated"
          className="w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
          loading="lazy"
          onClick={onOpenImage}
          title="Нажмите для просмотра"
        />
        <div className="flex justify-end px-3 py-2 bg-[var(--bg-elevated)]">
          <button
            onClick={() => downloadFile(mediaUrl, 'jpg')}
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
    return <VideoCard mediaUrl={mediaUrl} onOpen={onOpenVideo} />;
  }

  return null;
}

function VideoCard({ mediaUrl, onOpen }: { mediaUrl: string; onOpen?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);

  function toggleMute() {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setMuted(videoRef.current.muted);
    }
  }

  return (
    <div className="rounded-xl overflow-hidden border border-[var(--border)] max-w-sm">
      <div className="relative">
        <video
          ref={videoRef}
          src={mediaUrl}
          controls
          className="w-full h-auto"
          muted={muted}
        />
      </div>
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-elevated)]">
        <div className="flex items-center gap-3">
          <button
            onClick={toggleMute}
            className="flex items-center gap-1.5 text-[11px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
          >
            {muted ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 4.5h2l3-3v9l-3-3H1V4.5zM9 4.5l2 3M11 4.5l-2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 4.5h2l3-3v9l-3-3H1V4.5zM8 3.5c1 .8 1.5 2 1.5 3s-.5 2.2-1.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            )}
            {muted ? 'Включить звук' : 'Выключить звук'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpen}
            className="flex items-center gap-1.5 text-[11px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2h3M2 2v3M10 10H7M10 10V7M2 10h3M2 10V7M10 2H7M10 2v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            Открыть
          </button>
          <button
            onClick={() => downloadFile(mediaUrl, 'mp4')}
            className="flex items-center gap-1.5 text-[11px] text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Скачать
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Video Viewer modal ───────────────────────────────────────────────────────

function VideoViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);

  function toggleMute() {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setMuted(videoRef.current.muted);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="max-w-[90vw] max-h-[75vh] rounded-2xl overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <video
            ref={videoRef}
            src={url}
            controls
            autoPlay
            muted={muted}
            className="w-full h-auto max-h-[75vh]"
          />
        </motion.div>

        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="flex items-center gap-3 mt-6"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={toggleMute}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
          >
            {muted ? '🔇 Включить звук' : '🔊 Выключить звук'}
          </button>
          <button
            onClick={() => downloadFile(url, 'mp4')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ background: '#7B5CF0', color: 'white' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v9M4 7l3 3 3-3M2 12h10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Скачать
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Закрыть
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
