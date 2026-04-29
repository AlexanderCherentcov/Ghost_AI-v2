'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TelegramProvider, useTg } from '@/components/TelegramProvider';
import { BottomNav } from '@/components/BottomNav';
import { apiRequest } from '@/lib/auth';

type MusicMode = 'short' | 'long' | 'quality' | 'suno';

const MUSIC_MODES: { key: MusicMode; label: string }[] = [
  { key: 'short',   label: 'Короткий' },
  { key: 'long',    label: 'Длинный'  },
  { key: 'quality', label: 'Студия'   },
  { key: 'suno',    label: 'Suno'     },
];

const MUSIC_DURATIONS = [15, 30, 45, 60] as const;

interface Track {
  id: string;
  prompt: string;
  mediaUrl: string | null;
  status: 'loading' | 'done' | 'failed';
  error?: string;
}

// ─── Audio Player ─────────────────────────────────────────────────────────────

function AudioPlayer({ url, filename }: { url: string; filename: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play().catch(() => {});
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

  async function handleDownload() {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank');
    }
  }

  return (
    <div className="w-full">
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={() => {
          if (!audioRef.current) return;
          const pct = audioRef.current.duration
            ? (audioRef.current.currentTime / audioRef.current.duration) * 100 : 0;
          setProgress(pct);
        }}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
      />

      <div className="flex items-center gap-3">
        {/* Play / Pause */}
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--accent)', color: '#fff' }}
          aria-label={playing ? 'Пауза' : 'Слушать'}
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

        {/* Progress */}
        <div className="flex-1 min-w-0">
          <input
            type="range" min={0} max={100} step={0.1} value={progress}
            onChange={handleSeek}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{ background: `linear-gradient(to right, var(--accent) ${progress}%, rgba(255,255,255,0.12) ${progress}%)` }}
          />
          <div className="flex justify-between text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            <span>{formatTime((progress / 100) * duration)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Download */}
        <button
          onClick={handleDownload}
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 opacity-50 active:opacity-100 transition-opacity"
          style={{ color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.06)' }}
          aria-label="Скачать"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v8M5 7.5L8 10.5l3-3M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Track card ───────────────────────────────────────────────────────────────

function TrackCard({ track }: { track: Track }) {
  const filename = track.mediaUrl?.split('/').pop()?.split('?')[0] ?? 'track.mp3';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
    >
      {/* Prompt */}
      <p className="text-[13px] mb-3 line-clamp-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
        {track.prompt}
      </p>

      {track.status === 'loading' && (
        <div className="flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            className="w-4 h-4 border-2 rounded-full flex-shrink-0"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
          />
          <span className="text-[12px]">Генерируем трек...</span>
        </div>
      )}

      {track.status === 'failed' && (
        <p className="text-[12px]" style={{ color: '#ff6b6b' }}>
          ❌ {track.error ?? 'Не удалось создать трек'}
        </p>
      )}

      {track.status === 'done' && track.mediaUrl && (
        <AudioPlayer url={track.mediaUrl} filename={filename} />
      )}
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function MusicPageInner() {
  const [prompt, setPrompt] = useState('');
  const [musicMode, setMusicMode] = useState<MusicMode>('short');
  const [studioDuration, setStudioDuration] = useState(30);
  const [sunoStyle, setSunoStyle] = useState('');
  const [sunoTitle, setSunoTitle] = useState('');
  const [sunoInstrumental, setSunoInstrumental] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [generating, setGenerating] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const handleGenerate = useCallback(async () => {
    const text = prompt.trim();
    if (!text || generating) return;

    setGenerating(true);
    setPrompt('');

    const trackId = `track-${Date.now()}`;
    const newTrack: Track = { id: trackId, prompt: text, mediaUrl: null, status: 'loading' };
    setTracks((prev) => [newTrack, ...prev]);

    try {
      const res = await apiRequest<{ jobId: string }>('/generate/sound', {
        method: 'POST',
        body: JSON.stringify({
          prompt: text,
          musicMode,
          ...(musicMode === 'quality' ? { musicDuration: studioDuration } : {}),
          ...(musicMode === 'suno' ? {
            sunoStyle: sunoStyle.trim() || undefined,
            sunoTitle: sunoTitle.trim() || undefined,
            sunoInstrumental,
          } : {}),
        }),
      });

      const jobId = res.jobId;

      const poll = async (): Promise<void> => {
        if (!mountedRef.current) return;
        const job = await apiRequest<{ status: string; mediaUrl?: string; error?: string }>(
          `/generate/${jobId}`
        );
        if (!mountedRef.current) return;

        if (job.status === 'done' && job.mediaUrl) {
          setTracks((prev) =>
            prev.map((t) => t.id === trackId ? { ...t, status: 'done', mediaUrl: job.mediaUrl! } : t)
          );
        } else if (job.status === 'failed') {
          setTracks((prev) =>
            prev.map((t) => t.id === trackId ? { ...t, status: 'failed', error: job.error } : t)
          );
        } else {
          await new Promise((r) => setTimeout(r, 3000));
          return poll();
        }
      };

      await poll();
    } catch (err: any) {
      setTracks((prev) =>
        prev.map((t) => t.id === trackId ? { ...t, status: 'failed', error: err.message } : t)
      );
    } finally {
      if (mountedRef.current) setGenerating(false);
    }
  }, [prompt, generating, musicMode, studioDuration, sunoStyle, sunoTitle, sunoInstrumental]);

  return (
    <div className="flex flex-col min-h-svh" style={{ background: 'var(--bg-void)' }}>
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-[20px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Музыка
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Создай уникальный трек по описанию
        </p>
      </div>

      {/* Input */}
      <div className="px-4 pb-4">
        <div
          className="rounded-2xl p-3 flex gap-2"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Опиши стиль, настроение или жанр..."
            rows={3}
            className="flex-1 bg-transparent resize-none outline-none text-[14px] leading-relaxed placeholder:opacity-30"
            style={{ color: 'var(--text-primary)' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); }
            }}
          />
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
            className="self-end w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
            style={{
              background: prompt.trim() && !generating ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
              color: prompt.trim() && !generating ? '#fff' : 'rgba(255,255,255,0.2)',
            }}
            aria-label="Создать"
          >
            {generating ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                className="w-4 h-4 border-2 rounded-full"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
              />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 mt-3">
          {MUSIC_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMusicMode(m.key)}
              className="flex-1 rounded-xl py-2 text-[12px] font-medium transition-all"
              style={{
                background: musicMode === m.key ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                color: musicMode === m.key ? '#fff' : 'rgba(255,255,255,0.45)',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Duration selector — only for Студия */}
        {musicMode === 'quality' && (
          <div className="flex gap-2 mt-2">
            {MUSIC_DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => setStudioDuration(d)}
                className="flex-1 rounded-xl py-1.5 text-[12px] font-medium transition-all"
                style={{
                  background: studioDuration === d ? 'rgba(123,92,240,0.3)' : 'rgba(255,255,255,0.04)',
                  color: studioDuration === d ? 'var(--accent)' : 'rgba(255,255,255,0.35)',
                  border: studioDuration === d ? '1px solid rgba(123,92,240,0.5)' : '1px solid transparent',
                }}
              >
                {d}с
              </button>
            ))}
          </div>
        )}

        {/* Suno options */}
        {musicMode === 'suno' && (
          <div className="flex flex-col gap-2 mt-2">
            <input
              value={sunoStyle}
              onChange={(e) => setSunoStyle(e.target.value)}
              placeholder="Стиль (напр. Jazz, Electronic)"
              maxLength={200}
              className="w-full rounded-xl px-3 py-2 text-[13px] outline-none bg-transparent placeholder:opacity-30"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
            <input
              value={sunoTitle}
              onChange={(e) => setSunoTitle(e.target.value)}
              placeholder="Название трека (необязательно)"
              maxLength={100}
              className="w-full rounded-xl px-3 py-2 text-[13px] outline-none bg-transparent placeholder:opacity-30"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
            <button
              onClick={() => setSunoInstrumental((v) => !v)}
              className="flex items-center gap-2 text-[12px] transition-opacity"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              <div
                className="w-9 h-5 rounded-full flex items-center transition-all"
                style={{ background: sunoInstrumental ? 'var(--accent)' : 'rgba(255,255,255,0.12)', padding: '2px' }}
              >
                <div
                  className="w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ transform: sunoInstrumental ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </div>
              Инструментал (без вокала)
            </button>
          </div>
        )}

        <p className="text-[11px] mt-2 px-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Подсказки: «спокойный джаз для работы», «электронный бит для спорта»
        </p>
      </div>

      {/* Tracks list */}
      <div className="flex-1 px-4 pb-28 space-y-3 overflow-y-auto">
        <AnimatePresence>
          {tracks.length === 0 && !generating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 gap-3"
            >
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)"
                strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13"/>
                <circle cx="6" cy="18" r="3"/>
                <circle cx="18" cy="16" r="3"/>
              </svg>
              <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Треки появятся здесь
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {tracks.map((track) => (
          <TrackCard key={track.id} track={track} />
        ))}
      </div>

      <BottomNav />
    </div>
  );
}

export default function MusicPage() {
  return (
    <TelegramProvider>
      <MusicPageInner />
    </TelegramProvider>
  );
}
