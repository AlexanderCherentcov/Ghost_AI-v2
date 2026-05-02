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
  onUsePrompt?: (prompt: string, messageMode?: string) => void;
}

// Extract the first code block from a message (used for "Use prompt" button)
function extractCodeBlock(content: string): string | null {
  const m = content.match(/```[^\n]*\n?([\s\S]+?)```/);
  const text = m?.[1]?.trim();
  return text && text.length > 20 ? text.slice(0, 600) : null;
}

export function MessageBubble({ message, onUsePrompt }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const isUser = message.role === 'user';
  const codeBlockPrompt = !isUser && !message.mediaUrl && onUsePrompt
    ? extractCodeBlock(message.content)
    : null;

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
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[18px_4px_18px_18px] px-4 py-3 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
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
                className="flex items-center gap-1.5 text-[11px] transition-colors"
                style={{ color: copied ? 'var(--accent)' : 'var(--text-secondary)' }}
              >
                {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
              {message.cacheHit && (
                <span className="text-[11px]" style={{ color: 'rgba(123,92,240,0.5)' }}>⚡ Кэш</span>
              )}
              {codeBlockPrompt && (
                <button
                  onClick={() => onUsePrompt!(codeBlockPrompt, message.mode)}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-colors"
                  style={{ background: 'rgba(123,92,240,0.15)', color: 'var(--accent)' }}
                >
                  ⚡ Использовать промт
                </button>
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
    <div className="flex items-center gap-1.5 mb-2 rounded-lg px-2.5 py-1.5 w-fit max-w-[240px]" style={{ background: 'var(--bg-elevated)' }}>
      <span className="text-sm leading-none">{fileIcon(name)}</span>
      <span className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{name}</span>
    </div>
  );
}

async function downloadFile(url: string, ext = 'mp4') {
  const fname = `ghostline-${Date.now()}.${ext}`;
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();

    // Try Web Share API with files first (iOS Safari 15+, some Android browsers)
    // Note: canShare({files}) check prevents Chrome-desktop false positive
    if (typeof navigator !== 'undefined' && 'canShare' in navigator) {
      const file = new File([blob], fname, { type: blob.type || `video/${ext}` });
      if ((navigator as any).canShare({ files: [file] })) {
        try {
          await (navigator as any).share({ files: [file], title: 'GhostLine' });
          return;
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') return; // user cancelled — done
          // share failed (e.g. Chrome Android) → fall through to blob download
        }
      }
    }

    // Blob URL download — works on desktop and Chrome for Android
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    // Delay revoke to give browser time to start the download
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 5000);
  } catch {
    // Fetch failed (e.g. CORS) — open in new tab; user can save from there
    window.open(url, '_blank');
  }
}

// ─── AI Disclaimer ───────────────────────────────────────────────────────────

function AiDisclaimer() {
  return (
    <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.18)' }}>
      Контент создан нейросетью. Сервис не несёт ответственности за достоверность или содержание сгенерированных данных.
    </p>
  );
}

// ─── Generating placeholder ───────────────────────────────────────────────────

function GeneratingPlaceholder({ mode }: { mode: string }) {
  const isVideo = mode === 'reel';
  const isMusic = mode === 'sound';
  return (
    <div
      className={`relative rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--bg-elevated)] flex flex-col items-center justify-center gap-4 ${
        isVideo ? 'w-full max-w-lg min-h-[200px] aspect-video' : isMusic ? 'w-full max-w-sm py-8' : 'w-[260px] h-[260px]'
      }`}
    >
      {/* Shimmer overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
        <div
          className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
          }}
        />
      </div>
      {/* Icon */}
      {isVideo ? (
        <svg width="40" height="40" viewBox="0 0 32 32" fill="none" className="text-accent/50">
          <rect x="2" y="7" width="20" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M22 13l8-4v14l-8-4V13z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      ) : isMusic ? (
        <svg width="40" height="40" viewBox="0 0 32 32" fill="none" className="text-accent/50">
          <path d="M9 24V10l16-3v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="6" cy="24" r="3" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="22" cy="21" r="3" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      ) : (
        <svg width="40" height="40" viewBox="0 0 32 32" fill="none" className="text-accent/50">
          <rect x="3" y="3" width="26" height="26" rx="4" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="11" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M3 22l7-7 6 6 4-4 9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {/* Dots loader */}
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-accent/60 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <div className="flex flex-col items-center gap-1 px-4 text-center">
        <span className="text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>
          {isVideo ? 'Генерирую видео...' : isMusic ? 'Создаю трек...' : 'Генерирую картинку...'}
        </span>
        {isVideo && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Обычно занимает 1–3 минуты
          </span>
        )}
        {isMusic && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Обычно занимает 1–2 минуты
          </span>
        )}
      </div>
    </div>
  );
}

function MediaContent({
  mediaUrl, mode, onOpenImage, onOpenVideo,
}: {
  mediaUrl: string;
  mode: string;
  onOpenImage?: () => void;
  onOpenVideo?: () => void;
}) {
  if (mediaUrl === '__loading__') {
    return <GeneratingPlaceholder mode={mode} />;
  }

  if (mode === 'vision') {
    return (
      <div className="space-y-1.5">
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
              className="flex items-center gap-1.5 text-[11px] transition-colors hover:opacity-100 opacity-60"
              style={{ color: 'var(--text-secondary)' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {typeof navigator !== 'undefined' && 'share' in navigator ? 'Сохранить' : 'Скачать'}
            </button>
          </div>
        </div>
        <AiDisclaimer />
      </div>
    );
  }

  if (mode === 'sound') {
    return <AudioCard mediaUrl={mediaUrl} />;
  }

  if (mode === 'reel') {
    return (
      <div className="space-y-1.5">
        <VideoCard mediaUrl={mediaUrl} onOpen={onOpenVideo} />
        <AiDisclaimer />
      </div>
    );
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
    <div className="rounded-xl overflow-hidden border border-[var(--border)] w-full max-w-lg">
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
            className="flex items-center gap-1.5 text-[11px] transition-colors hover:opacity-100 opacity-60"
            style={{ color: 'var(--text-secondary)' }}
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
            className="flex items-center gap-1.5 text-[11px] transition-colors hover:opacity-100 opacity-60"
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2h3M2 2v3M10 10H7M10 10V7M2 10h3M2 10V7M10 2H7M10 2v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            Открыть
          </button>
          <button
            onClick={() => downloadFile(mediaUrl, 'mp4')}
            className="flex items-center gap-1.5 text-[11px] transition-colors hover:opacity-100 opacity-60"
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {typeof navigator !== 'undefined' && 'share' in navigator ? 'Сохранить' : 'Скачать'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Audio Card ───────────────────────────────────────────────────────────────

function AudioCard({ mediaUrl }: { mediaUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  }

  function handleTimeUpdate() {
    if (!audioRef.current) return;
    const pct = audioRef.current.duration
      ? (audioRef.current.currentTime / audioRef.current.duration) * 100
      : 0;
    setProgress(pct);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    if (!audioRef.current) return;
    const pct = Number(e.target.value);
    audioRef.current.currentTime = (pct / 100) * audioRef.current.duration;
    setProgress(pct);
  }

  function formatTime(s: number) {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  const filename = mediaUrl.split('/').pop()?.split('?')[0] ?? 'track.mp3';

  return (
    <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl p-4 w-full max-w-sm">
      <audio
        ref={audioRef}
        src={mediaUrl}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
      />

      <div className="flex items-center gap-3">
        {/* Play/Pause button */}
        <button
          onClick={togglePlay}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-accent text-white hover:opacity-90 transition-opacity"
          aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="2" width="4" height="10" rx="1" fill="currentColor"/>
              <rect x="8" y="2" width="4" height="10" rx="1" fill="currentColor"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 2l9 5-9 5V2z" fill="currentColor"/>
            </svg>
          )}
        </button>

        {/* Progress + time */}
        <div className="flex-1 min-w-0">
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={progress}
            onChange={handleSeek}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--accent) ${progress}%, var(--bg-void) ${progress}%)`,
            }}
          />
          <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            <span>{formatTime((progress / 100) * duration)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Download */}
        <a
          href={mediaUrl}
          download={filename}
          onClick={(e) => {
            // Use fetch+blob for cross-origin URLs to force download
            if (!mediaUrl.startsWith(window.location.origin)) {
              e.preventDefault();
              fetch(mediaUrl)
                .then((r) => r.blob())
                .then((b) => {
                  const url = URL.createObjectURL(b);
                  const a = document.createElement('a');
                  a.href = url; a.download = filename; a.click();
                  URL.revokeObjectURL(url);
                })
                .catch(() => { window.open(mediaUrl, '_blank'); });
            }
          }}
          className="flex items-center justify-center w-8 h-8 rounded-lg opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
          style={{ color: 'var(--text-secondary)' }}
          title="Скачать"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v8M4 6.5L7 9.5l3-3M2 12h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
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
            {typeof navigator !== 'undefined' && 'share' in navigator ? 'Сохранить' : 'Скачать'}
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
