'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyIcon, CheckIcon, BoltIcon, SoundIcon, MuteIcon } from '@/components/icons';
import { fileExtIcon } from './inputbar/fileHelpers';
import { ImageViewer } from '@/components/ui/ImageViewer';
import { MessageAvatar } from './MessageAvatar';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { capitalizeFirst } from '@/lib/utils';
import type { Message } from '@/lib/api';

interface MessageBubbleProps {
  message: Message;
  onUsePrompt?: (prompt: string, messageMode?: string) => void;
}

// Извлекает первый блок кода из сообщения (используется кнопкой "Использовать промт")
function extractCodeBlock(content: string): string | null {
  const m = content.match(/```[^\n]*\n?([\s\S]+?)```/);
  const text = m?.[1]?.trim();
  return text && text.length > 20 ? text.slice(0, 600) : null;
}

export function MessageBubble({ message, onUsePrompt }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [videoOpen, setVideoOpen] = useState(false);
  const { user } = useAuthStore();
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
      {/* Аватар ассистента — живой particle-avatar, как в утверждённом мокапе (Chat.dc.html:
          canvas на каждом сообщении, не только в hero/typing). См. MessageAvatar. */}
      {!isUser && <MessageAvatar size={30} modelId={message.provider} />}
      {/* Аватар пользователя — реальное фото профиля, если есть (тот же avatarUrl,
          что в Sidebar/Profile), иначе инициал первой буквы имени — тот же градиент,
          что был у заглушки "Я" (linear-gradient(135deg,#2dd4bf,#0f9c8c)). */}
      {isUser && (
        user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="flex-shrink-0 mt-0.5 w-[30px] h-[30px] rounded-lg object-cover"
          />
        ) : (
          <div
            className="flex-shrink-0 mt-0.5 w-[30px] h-[30px] rounded-lg flex items-center justify-center text-[13px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #2dd4bf, #0f9c8c)' }}
          >
            {user?.name?.trim()?.charAt(0).toUpperCase() ?? 'Я'}
          </div>
        )
      )}

      <div className={`relative max-w-[78%] ${isUser ? 'order-first' : ''}`}>
        {isUser ? (
          <>
          {/* Имя над пузырём — по прямому запросу Александра (аватар — фото, но
              нужно и имя рядом), только у пользователя: у ассистента подписи не
              было и не добавляем — единообразия ради (см. MessageAvatar). */}
          <div className="text-[11px] text-right mb-1 pr-1" style={{ color: 'var(--text-muted)' }}>
            {user?.name?.trim() ? capitalizeFirst(user.name.trim()) : 'Вы'}
          </div>
          {/* Пузырь пользователя — единая скруглённость 14px по всем углам (мокап), без
              «хвостика» */}
          <div
            className="rounded-[14px] px-4 py-3 text-sm leading-relaxed"
            style={{ color: 'var(--text-primary)', background: 'rgba(45,212,191,.12)', border: '1px solid rgba(45,212,191,.25)' }}
          >
            {/* Голосовое сообщение пользователя */}
            {message.mode === 'voice' && message.mediaUrl && (
              <div className="mb-2 min-w-[200px]">
                <audio src={message.mediaUrl} controls className="h-9 w-full" style={{ minWidth: '200px' }} />
              </div>
            )}
            {/* Превью изображения */}
            {message.mode !== 'voice' && message.mediaUrl && (
              <div className="mb-2 rounded-xl overflow-hidden max-w-[260px]">
                <img
                  src={message.mediaUrl}
                  alt="Прикреплённое изображение"
                  className="w-full h-auto object-cover"
                  loading="lazy"
                />
              </div>
            )}
            {/* Чип прикреплённого файла (для файлов, не являющихся изображением) */}
            {!message.mediaUrl && message.fileName && (
              <FileChip name={message.fileName} />
            )}
            {/* Текстовое содержимое */}
            {message.content && message.content !== `[Файл: ${message.fileName}]` && (
              <span>{message.content}</span>
            )}
          </div>
          </>
        ) : (
          /* Ответ призрака */
          <div className="flex-1">
            {message.mediaUrl ? (
              <MediaContent
                mediaUrl={message.mediaUrl}
                mode={message.mode}
                jobId={message.jobId}
                onOpenImage={() => setViewerUrl(message.mediaUrl!)}
                onOpenVideo={() => setVideoOpen(true)}
              />
            ) : (
              <div
                className="prose-ghost text-sm rounded-[14px] px-4 py-3"
                style={{ background: 'var(--panel-glass)', border: '1px solid var(--panel-glass-border)' }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}

            {/* Действия */}
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
                <span className="flex items-center gap-1 text-[11px]" style={{ color: 'rgba(123,92,240,0.5)' }}>
                  <BoltIcon size={11} /> Кэш
                </span>
              )}
              {codeBlockPrompt && (
                <button
                  onClick={() => onUsePrompt!(codeBlockPrompt, message.mode)}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md transition-colors"
                  style={{ background: 'rgba(123,92,240,0.15)', color: 'var(--accent)' }}
                >
                  <BoltIcon size={11} /> Использовать промт
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

function FileChip({ name }: { name: string }) {
  const Icon = fileExtIcon(name);
  return (
    <div className="flex items-center gap-1.5 mb-2 rounded-lg px-2.5 py-1.5 w-fit max-w-[240px]" style={{ background: 'var(--bg-elevated)' }}>
      <Icon size={14} className="flex-shrink-0" />
      <span className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{name}</span>
    </div>
  );
}

async function downloadFile(url: string, ext = 'mp4') {
  const fname = `ghostline-${Date.now()}.${ext}`;
  // isMobile: сенсорное устройство (iOS/Android) — Web Share API используем только там
  const isMobile = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();

    // Web Share API с файлами — только мобильные (избегаем десктопного диалога "Поделиться")
    if (isMobile && typeof navigator !== 'undefined' && 'canShare' in navigator) {
      const file = new File([blob], fname, { type: blob.type || `video/${ext}` });
      if ((navigator as any).canShare({ files: [file] })) {
        try {
          await (navigator as any).share({ files: [file], title: 'GhostLine' });
          return;
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') return; // пользователь отменил
          // проваливаемся дальше к скачиванию через blob
        }
      }
    }

    // Скачивание через Blob URL — надёжно работает на десктопе и в Android Chrome
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 5000);
  } catch {
    window.open(url, '_blank');
  }
}

// ─── Дисклеймер про AI ───────────────────────────────────────────────────────

function AiDisclaimer() {
  return (
    <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.18)' }}>
      Контент создан нейросетью. Сервис не несёт ответственности за достоверность или содержание сгенерированных данных.
    </p>
  );
}

// ─── Плейсхолдер генерации ───────────────────────────────────────────────────

function GeneratingPlaceholder({ mode }: { mode: string }) {
  const isVideo = mode === 'reel';
  const isMusic = mode === 'sound';
  const isVoice = mode === 'voice';
  return (
    <div
      className={`relative rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--bg-elevated)] flex flex-col items-center justify-center gap-4 ${
        isVideo ? 'w-full max-w-lg min-h-[200px] aspect-video' : (isMusic || isVoice) ? 'w-full max-w-sm py-8' : 'w-[260px] h-[260px]'
      }`}
    >
      {/* Оверлей мерцания */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
        <div
          className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
          }}
        />
      </div>
      {/* Иконка */}
      {isVoice ? (
        <svg width="40" height="40" viewBox="0 0 32 32" fill="none" className="text-accent/50">
          <rect x="11" y="4" width="10" height="16" rx="5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 15a9 9 0 0 0 18 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M16 24v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ) : isVideo ? (
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
      {/* Индикатор точками */}
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
          {isVideo ? 'Генерирую видео...' : isMusic ? 'Создаю трек...' : isVoice ? 'Думаю и озвучиваю ответ...' : 'Генерирую картинку...'}
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
        {!isVideo && !isMusic && !isVoice && (
          // Большинство картиночных моделей укладываются в 10-30 секунд, но у
          // тяжёлых reasoning-моделей (напр. gpt-image) реально бывает и 6+ минут
          // (живое подтверждение по логам OpenRouter) — таймаут на бэкенде теперь
          // 10 минут, предупреждаем заранее, а не оставляем гадать, зависло или нет.
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Обычно 10–30 секунд, у некоторых моделей — до 10 минут
          </span>
        )}
      </div>
    </div>
  );
}

// Кнопка "В галерею" — переиспользуется и на карточке картинки, и на карточке
// видео (см. MediaContent ниже), поэтому вынесена отдельным компонентом, а не
// продублирована в двух местах. jobId подставляется бэкендом и для истории тоже
// (см. комментарий у Message.jobId в lib/api.ts) — не только для сообщений,
// сгенерированных в текущей сессии.
function ShareToGalleryButton({ jobId }: { jobId: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function handleShare() {
    if (state !== 'idle' && state !== 'error') return;
    setState('sending');
    try {
      await api.gallery.share({ jobId });
      setState('sent');
    } catch {
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--accent)' }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        На модерации
      </span>
    );
  }

  return (
    <button
      onClick={handleShare}
      disabled={state === 'sending'}
      className="flex items-center gap-1.5 text-[11px] transition-colors hover:opacity-100 opacity-60"
      style={{ color: state === 'error' ? '#f87171' : 'var(--text-secondary)' }}
      title={state === 'error' ? 'Не получилось, нажмите ещё раз' : undefined}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 1l1.8 3.6L11.5 5l-2.8 2.6.7 3.9L6 9.6 2.6 11.5l.7-3.9L.5 5l3.7-.4L6 1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      </svg>
      {state === 'sending' ? 'Отправляю...' : state === 'error' ? 'Не отправилось' : 'В галерею'}
    </button>
  );
}

function MediaContent({
  mediaUrl, mode, jobId, onOpenImage, onOpenVideo,
}: {
  mediaUrl: string;
  mode: string;
  jobId?: string;
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
          <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-elevated)]">
            {jobId ? <ShareToGalleryButton jobId={jobId} /> : <span />}
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

  if (mode === 'sound' || mode === 'voice') {
    return <AudioCard mediaUrl={mediaUrl} />;
  }

  if (mode === 'reel') {
    return (
      <div className="space-y-1.5">
        <VideoCard mediaUrl={mediaUrl} jobId={jobId} onOpen={onOpenVideo} />
        <AiDisclaimer />
      </div>
    );
  }

  return null;
}

function VideoCard({ mediaUrl, jobId, onOpen }: { mediaUrl: string; jobId?: string; onOpen?: () => void }) {
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
          {jobId && <ShareToGalleryButton jobId={jobId} />}
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

// ─── Карточка аудио ─────────────────────────────────────────────────────────────

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
        {/* Кнопка Play/Pause */}
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

        {/* Прогресс + время */}
        <div className="flex-1 min-w-0">
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={progress}
            onChange={handleSeek}
            className="audio-seek w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, var(--accent) ${progress}%, var(--bg-void) ${progress}%)`,
            }}
          />
          <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
            <span>{formatTime((progress / 100) * duration)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Скачать */}
        <a
          href={mediaUrl}
          download={filename}
          onClick={(e) => {
            // Для кросс-доменных URL используем fetch+blob, чтобы принудительно скачать
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

// ─── Модалка просмотра видео ────────────────────────────────────────────────────

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
        style={{ background: 'rgba(0,0,0,0.92)', WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }}
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
            {muted ? <MuteIcon size={16} /> : <SoundIcon size={16} />}
            {muted ? 'Включить звук' : 'Выключить звук'}
          </button>
          <button
            onClick={() => downloadFile(url, 'mp4')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'var(--accent)', color: 'white' }}
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
