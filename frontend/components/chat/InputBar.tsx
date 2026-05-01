'use client';

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SendIcon, CasperCoin, ChatIcon, ImageIcon, VideoIcon, MusicIcon, AttachIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

// ─── FREE tier limits (must match backend/src/config/plans.ts) ───────────────
const FREE_IMAGES_WEEKLY  = 5;
const FREE_MUSIC_WEEKLY   = 5;
const FREE_VIDEOS_MONTHLY = 3;

// ─── File helpers ─────────────────────────────────────────────────────────────

const ACCEPT = [
  'image/*',
  '.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.odt','.ods',
  '.txt','.md','.markdown','.mdx','.rst','.log','.csv','.tsv',
  '.html','.htm','.xml','.css','.scss','.js','.jsx','.ts','.tsx',
  '.json','.yaml','.yml','.toml','.ini','.env','.py','.java','.go','.rs',
  '.rb','.php','.sql','.sh','.bash','.graphql',
].join(',');

const TEXT_EXTS = new Set(['txt','md','markdown','mdx','rst','log','csv','tsv','html','htm','xml','css','scss','js','jsx','ts','tsx','json','yaml','yml','toml','ini','env','py','java','go','rs','rb','php','sql','sh','bash','graphql']);
const BINARY_EXTS = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods']);
const IMAGE_EXTS  = new Set(['jpg','jpeg','png','gif','webp','bmp','avif','tiff','svg','ico']);

export type FileCategory = 'image' | 'text' | 'binary';
export function getFileCategory(file: File): FileCategory {
  if (file.type.startsWith('image/')) return 'image';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (BINARY_EXTS.has(ext)) return 'binary';
  return 'text';
}

function fileIcon(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTS.has(ext) || file.type.startsWith('image/')) return '🖼️';
  if (ext === 'pdf') return '📄';
  if (['doc','docx','odt'].includes(ext)) return '📝';
  if (['xls','xlsx','csv'].includes(ext)) return '📊';
  if (['js','jsx','ts','tsx'].includes(ext)) return '⚡';
  if (['py'].includes(ext)) return '🐍';
  if (['sql'].includes(ext)) return '🗄️';
  if (['md','markdown'].includes(ext)) return '📋';
  return '📎';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Video types ──────────────────────────────────────────────────────────────

export type VideoQuality = 'motion' | 'cinema' | 'reality';
// legacy compat
export type VideoModel = VideoQuality | 'standard' | 'pro';

export interface VideoOptions {
  videoModel: VideoQuality;
  duration: '4s' | '8s';
  aspectRatio: '16:9' | '9:16';
  enableAudio: boolean;
  resolution: '720p' | '1080p';
  imageUrl?: string;
  negativePrompt: string;
}

// ─── Music types ──────────────────────────────────────────────────────────────

export type MusicMode = 'short' | 'long' | 'quality' | 'suno'; // keep legacy

export interface MusicOptions {
  title: string;
  style: string;
  instrumental: boolean;
  lyrics: string;
}

// ─── Chat mode ────────────────────────────────────────────────────────────────

export type ChatMode = 'chat' | 'images' | 'video' | 'music';

// ─── Casper cost calculator ───────────────────────────────────────────────────

function calcCaspers(mode: ChatMode, videoOpts: VideoOptions): number {
  if (mode === 'music') return 5;
  if (mode === 'images') return 10;
  if (mode === 'video') {
    const isPro = videoOpts.videoModel === 'cinema';
    if (isPro) return videoOpts.duration === '4s' ? 50 : 90;
    return videoOpts.duration === '4s' ? 25 : 40;
  }
  return 0;
}

// ─── Plan-aware cost display ──────────────────────────────────────────────────
//
// Returns what to show next to a widget header or toolbar:
//   { type:'free', label:'3/5 нед.' }   → FREE user with remaining quota
//   { type:'caspers', amount: 10 }       → paid user OR FREE quota exhausted
//   null                                 → chat mode (no cost)

type CostDisplay =
  | { type: 'free'; label: string }
  | { type: 'caspers'; amount: number }
  | null;

function getCostDisplay(
  mode: ChatMode,
  videoOpts: VideoOptions,
  userPlan?: string,
  userImages?: number,
  userMusic?: number,
  userVideos?: number,
  preferredModel?: 'haiku' | 'deepseek' | undefined,
  userProFreeRemaining?: number,
): CostDisplay {
  if (mode === 'chat') {
    if (preferredModel !== 'deepseek') return null;
    if (!userPlan) return null; // still loading
    if (userPlan === 'ULTRA') return { type: 'free', label: 'безлимит' };
    if (userProFreeRemaining !== undefined && userProFreeRemaining > 0) {
      return { type: 'free', label: `${userProFreeRemaining} сегодня` };
    }
    if (!userProFreeRemaining && userPlan === 'FREE') return null; // FREE can't use pro
    return { type: 'caspers', amount: 1 };
  }
  const isFree = userPlan === 'FREE';

  if (mode === 'images') {
    if (isFree) {
      const left = Math.max(0, FREE_IMAGES_WEEKLY - (userImages ?? 0));
      if (left > 0) return { type: 'free', label: `${left}/${FREE_IMAGES_WEEKLY} нед.` };
    }
    return { type: 'caspers', amount: 10 };
  }

  if (mode === 'music') {
    if (isFree) {
      const left = Math.max(0, FREE_MUSIC_WEEKLY - (userMusic ?? 0));
      if (left > 0) return { type: 'free', label: `${left}/${FREE_MUSIC_WEEKLY} нед.` };
    }
    return { type: 'caspers', amount: 5 };
  }

  if (mode === 'video') {
    if (isFree) {
      const left = Math.max(0, FREE_VIDEOS_MONTHLY - (userVideos ?? 0));
      if (left > 0) return { type: 'free', label: `${left}/${FREE_VIDEOS_MONTHLY} мес.` };
    }
    return { type: 'caspers', amount: calcCaspers('video', videoOpts) };
  }

  return null;
}

// ─── Reusable cost badge ──────────────────────────────────────────────────────
function CostBadge({ cost, size = 12 }: { cost: CostDisplay; size?: number }) {
  if (!cost) return null;
  if (cost.type === 'free') {
    return (
      <span className="text-[11px] font-medium" style={{ color: '#4ade80' }}>
        {cost.label} бесплатно
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[12px] font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
      {cost.amount}
      <CasperCoin size={size} />
    </span>
  );
}

// ─── Video quality options ────────────────────────────────────────────────────

const VIDEO_QUALITIES: { key: VideoQuality; label: string; icon: React.ReactNode }[] = [
  { key: 'motion',  label: 'Standard', icon: <VideoIcon size={13} /> },
  { key: 'cinema',  label: 'Pro',      icon: <VideoIcon size={13} /> },
  { key: 'reality', label: 'Reality',  icon: <VideoIcon size={13} /> },
];

// ─── Custom select (styled dropdown, replaces native <select>) ────────────────

function CustomSelect<T extends string>({
  value, onChange, options, direction = 'up',
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  direction?: 'up' | 'down';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[12px] font-medium transition-all hover:border-[rgba(255,255,255,0.2)]"
        style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      >
        {current.icon && <span className="flex-shrink-0 opacity-70">{current.icon}</span>}
        <span>{current.label}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className="opacity-40 ml-0.5">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: direction === 'up' ? 4 : -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: direction === 'up' ? 4 : -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute left-0 z-50 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xl',
              direction === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            )}
            style={{ minWidth: '130px' }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={cn(
                  'w-full text-left px-3 py-2 text-[12px] flex items-center gap-2 transition-colors hover:bg-[var(--bg-void)]',
                  value === opt.value ? 'text-accent' : ''
                )}
                style={value !== opt.value ? { color: 'var(--text-primary)' } : {}}
              >
                {opt.icon && <span className="flex-shrink-0 opacity-70">{opt.icon}</span>}
                <span className="flex-1">{opt.label}</span>
                {value === opt.value && (
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M3.5 10.5l5 5L17 6"/>
                  </svg>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Widget panels ────────────────────────────────────────────────────────────

function VideoWidget({
  options, onChange, userPlan, userVideos,
}: {
  options: VideoOptions;
  onChange: (o: VideoOptions) => void;
  userPlan?: string;
  userVideos?: number;
}) {
  const cost = getCostDisplay('video', options, userPlan, undefined, undefined, userVideos);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border mb-2 overflow-hidden"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
    >
      <div className="px-4 py-2.5 flex items-center justify-end border-b" style={{ borderColor: 'var(--border)' }}>
        <CostBadge cost={cost} size={13} />
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
        {/* Model + Resolution row */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Модель</span>
            <CustomSelect<VideoQuality>
              value={options.videoModel}
              onChange={(v) => onChange({ ...options, videoModel: v })}
              options={VIDEO_QUALITIES.map((q) => ({ value: q.key, label: q.label, icon: q.icon }))}
              direction="down"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Разрешение</span>
            <CustomSelect<'720p' | '1080p'>
              value={options.resolution}
              onChange={(v) => onChange({ ...options, resolution: v })}
              options={[
                { value: '720p',  label: '720p' },
                { value: '1080p', label: '1080p' },
              ]}
              direction="down"
            />
          </div>
        </div>

        {/* Duration + Aspect + Audio */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {(['4s', '8s'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChange({ ...options, duration: d })}
                className={cn(
                  'px-3 py-1 rounded-lg text-[11px] font-medium border transition-all',
                  options.duration === d
                    ? 'bg-[rgba(123,92,240,0.15)] text-accent border-[rgba(123,92,240,0.4)]'
                    : 'border-[var(--border)] hover:border-[rgba(255,255,255,0.25)]'
                )}
                style={options.duration !== d ? { color: 'var(--text-secondary)' } : {}}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            {(['16:9', '9:16'] as const).map((ar) => (
              <button
                key={ar}
                type="button"
                onClick={() => onChange({ ...options, aspectRatio: ar })}
                className={cn(
                  'px-3 py-1 rounded-lg text-[11px] font-medium border transition-all',
                  options.aspectRatio === ar
                    ? 'bg-[rgba(123,92,240,0.15)] text-accent border-[rgba(123,92,240,0.4)]'
                    : 'border-[var(--border)] hover:border-[rgba(255,255,255,0.25)]'
                )}
                style={options.aspectRatio !== ar ? { color: 'var(--text-secondary)' } : {}}
              >
                {ar}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onChange({ ...options, enableAudio: !options.enableAudio })}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-medium border transition-all',
              options.enableAudio
                ? 'bg-[rgba(123,92,240,0.15)] text-accent border-[rgba(123,92,240,0.4)]'
                : 'border-[var(--border)] hover:border-[rgba(255,255,255,0.25)]'
            )}
            style={!options.enableAudio ? { color: 'var(--text-secondary)' } : {}}
          >
            {options.enableAudio ? '🔊' : '🔇'} Звук
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function MusicWidget({
  options, onChange, onGenerateLyrics, generatingLyrics, topic, userPlan, userMusic,
}: {
  options: MusicOptions;
  onChange: (o: MusicOptions) => void;
  onGenerateLyrics: () => void;
  generatingLyrics: boolean;
  topic: string;
  userPlan?: string;
  userMusic?: number;
}) {
  const cost = getCostDisplay('music', {} as VideoOptions, userPlan, undefined, userMusic, undefined);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border mb-2 overflow-hidden"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
    >
      <div className="px-4 py-2.5 flex items-center justify-end border-b" style={{ borderColor: 'var(--border)' }}>
        <CostBadge cost={cost} size={13} />
      </div>

      <div className="px-4 py-3 flex flex-col gap-2.5">
        {/* Title + Style */}
        <div className="flex gap-2">
          <input
            value={options.title}
            onChange={(e) => onChange({ ...options, title: e.target.value })}
            placeholder="Название трека"
            title="Введите название трека, например: «Ночной город» или «Летнее утро»"
            maxLength={100}
            className="flex-1 px-3 py-1.5 rounded-lg text-[12px] outline-none border"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
          />
          <input
            value={options.style}
            onChange={(e) => onChange({ ...options, style: e.target.value })}
            placeholder="Стиль / жанр"
            title="Укажите жанр или настроение, например: «lo-fi, грустный» или «поп, энергичный»"
            maxLength={100}
            className="flex-1 px-3 py-1.5 rounded-lg text-[12px] outline-none border"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
          />
        </div>

        {/* Instrumental toggle */}
        <button
          type="button"
          onClick={() => onChange({ ...options, instrumental: !options.instrumental, lyrics: options.instrumental ? options.lyrics : '' })}
          className={cn(
            'self-start flex items-center gap-2 px-3 py-1 rounded-lg text-[11px] font-medium border transition-all',
            options.instrumental
              ? 'bg-[rgba(123,92,240,0.15)] text-accent border-[rgba(123,92,240,0.4)]'
              : 'border-[var(--border)] hover:border-[rgba(255,255,255,0.25)]'
          )}
          style={!options.instrumental ? { color: 'var(--text-secondary)' } : {}}
        >
          {options.instrumental ? '🎹 Инструментал' : '🎤 С вокалом'}
        </button>

        {/* Lyrics area */}
        {!options.instrumental && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Текст песни (необязательно)</span>
              <button
                type="button"
                onClick={onGenerateLyrics}
                disabled={generatingLyrics || !topic.trim()}
                className={cn(
                  'text-[11px] px-2.5 py-0.5 rounded-md border transition-all',
                  generatingLyrics || !topic.trim()
                    ? 'opacity-40 cursor-not-allowed border-[var(--border)]'
                    : 'border-[rgba(123,92,240,0.4)] text-accent hover:bg-[rgba(123,92,240,0.1)]'
                )}
              >
                {generatingLyrics ? '✨ Генерирую...' : '✨ Сгенерировать текст'}
              </button>
            </div>
            <textarea
              value={options.lyrics}
              onChange={(e) => onChange({ ...options, lyrics: e.target.value })}
              placeholder={'Текст песни...\n\nИли нажмите «Сгенерировать текст» — Llama набросает стихи, которые вы сможете отредактировать.'}
              rows={4}
              maxLength={10000}
              className="w-full rounded-lg px-3 py-2 text-[12px] outline-none resize-none placeholder:opacity-30 leading-relaxed"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ImageWidget({ userPlan, userImages }: { userPlan?: string; userImages?: number }) {
  const cost = getCostDisplay('images', {} as VideoOptions, userPlan, userImages, undefined, undefined);
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border mb-2 px-4 py-3 flex items-center justify-between"
      style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
    >
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
        <ImageIcon size={13} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }} />
        Опишите изображение в строке ниже
      </p>
      <CostBadge cost={cost} size={13} />
    </motion.div>
  );
}


// ─── Main component ───────────────────────────────────────────────────────────

interface InputBarProps {
  onSend: (
    prompt: string,
    file?: File,
    videoOptions?: VideoOptions,
    musicMode?: MusicMode,
    musicDuration?: number,
    sunoStyle?: string,
    sunoTitle?: string,
    sunoInstrumental?: boolean,
    lyrics?: string,
  ) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  preferredModel?: 'haiku' | 'deepseek' | undefined;
  setPreferredModel?: (m: 'haiku' | 'deepseek' | undefined) => void;
  userPlan?: string;
  onUpgradeRequired?: () => void;
  chatMode?: ChatMode;
  setChatMode?: (m: ChatMode) => void;
  // Dispatcher pre-fill from parent
  dispatchResult?: { category: string; autoFill: Record<string, unknown> } | null;
  // Notify parent of input changes (for debounced dispatch)
  onInputChange?: (text: string) => void;
  // User's current usage counters (for FREE plan limit display)
  userImages?: number;            // images_this_week
  userMusic?: number;             // music_this_week
  userVideos?: number;            // videos_this_month
  userProFreeRemaining?: number;  // remaining free pro chat requests today
}

export function InputBar({
  onSend, onStop, disabled = false, isStreaming = false,
  placeholder, preferredModel, setPreferredModel, userPlan, onUpgradeRequired,
  chatMode = 'chat', setChatMode,
  dispatchResult,
  onInputChange,
  userImages, userMusic, userVideos, userProFreeRemaining,
}: InputBarProps) {
  const [value, setValue] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [generatingLyrics, setGeneratingLyrics] = useState(false);

  const [videoOptions, setVideoOptions] = useState<VideoOptions>({
    videoModel: 'motion',
    duration: '8s',
    aspectRatio: '16:9',
    enableAudio: false,
    resolution: '720p',
    negativePrompt: '',
  });

  const [musicOptions, setMusicOptions] = useState<MusicOptions>({
    title: '',
    style: '',
    instrumental: false,
    lyrics: '',
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);

  // Apply dispatcher pre-fill
  useEffect(() => {
    if (!dispatchResult) return;
    const { category, autoFill } = dispatchResult;

    if (category === 'music' && setChatMode) {
      setChatMode('music');
      setMusicOptions((prev) => ({
        ...prev,
        title: (autoFill.title as string) || prev.title,
        style: (autoFill.style as string) || prev.style,
        instrumental: typeof autoFill.instrumental === 'boolean' ? autoFill.instrumental : prev.instrumental,
      }));
    } else if (category === 'video' && setChatMode) {
      setChatMode('video');
      setVideoOptions((prev) => ({
        ...prev,
        videoModel: (['motion','cinema','reality'].includes(autoFill.quality as string)
          ? autoFill.quality as VideoQuality : prev.videoModel),
        duration: (['4s','8s'].includes(autoFill.duration as string)
          ? autoFill.duration as '4s' | '8s' : prev.duration),
      }));
    } else if (category === 'image' && setChatMode) {
      setChatMode('images');
    } else if (category === 'search' && setChatMode) {
      // Keep chat mode — search handled by backend routing
    }
  }, [dispatchResult]);

  function adjustHeight() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }

  function handleSend() {
    const trimmed = value.trim();
    if ((!trimmed && !attachedFile) || disabled || sendingRef.current) return;
    sendingRef.current = true;

    if (chatMode === 'video') {
      onSend(trimmed, undefined, videoOptions);
    } else if (chatMode === 'music') {
      // Map to legacy signature: prompt=style desc, sunoTitle, sunoStyle, sunoInstrumental, lyrics
      onSend(
        trimmed || musicOptions.style || musicOptions.title || 'создай трек',
        undefined, undefined,
        'suno', undefined,
        musicOptions.style || undefined,
        musicOptions.title || undefined,
        musicOptions.instrumental,
        musicOptions.lyrics || undefined,
      );
    } else {
      onSend(trimmed, attachedFile ?? undefined);
    }

    setValue('');
    setAttachedFile(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setTimeout(() => { sendingRef.current = false; }, 500);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setAttachedFile(file);
    e.target.value = '';
  }

  async function handleGenerateLyrics() {
    if (generatingLyrics) return;
    const topic = value.trim() || musicOptions.title || musicOptions.style;
    if (!topic) return;
    setGeneratingLyrics(true);
    try {
      const { lyrics } = await api.generate.lyrics({
        topic,
        style: musicOptions.style || undefined,
        instrumental: musicOptions.instrumental,
      });
      setMusicOptions((prev) => ({ ...prev, lyrics }));
    } catch {
      // silent fail
    } finally {
      setGeneratingLyrics(false);
    }
  }

  function toggleMode(mode: ChatMode) {
    if (!setChatMode) return;
    setChatMode(chatMode === mode ? 'chat' : mode);
  }

  const hasContent = value.trim() || attachedFile;
  const toolbarCost = getCostDisplay(chatMode, videoOptions, userPlan, userImages, userMusic, userVideos, preferredModel, userProFreeRemaining);
  const category = attachedFile ? getFileCategory(attachedFile) : null;

  const activePlaceholder = chatMode === 'images'
    ? 'Опишите изображение...'
    : chatMode === 'video'
      ? 'Опишите сцену для видео...'
      : chatMode === 'music'
        ? 'Опишите настроение или стиль...'
        : placeholder ?? 'Напишите что-нибудь...';

  return (
    <div className="flex-shrink-0 px-4 pt-2 pb-0 lg:pb-4">
      <div className="max-w-[720px] mx-auto">

        {/* Sliding widgets */}
        <AnimatePresence>
          {chatMode === 'video' && (
            <VideoWidget
              key="video-widget"
              options={videoOptions}
              onChange={setVideoOptions}
              userPlan={userPlan}
              userVideos={userVideos}
            />
          )}
          {chatMode === 'music' && (
            <MusicWidget
              key="music-widget"
              options={musicOptions}
              onChange={setMusicOptions}
              onGenerateLyrics={handleGenerateLyrics}
              generatingLyrics={generatingLyrics}
              topic={value.trim() || musicOptions.title || musicOptions.style}
              userPlan={userPlan}
              userMusic={userMusic}
            />
          )}
          {chatMode === 'images' && (
            <ImageWidget key="image-widget" userPlan={userPlan} userImages={userImages} />
          )}
        </AnimatePresence>

        {/* Attached file preview */}
        {attachedFile && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-2 px-1"
          >
            <div className="flex items-center gap-2 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-1.5 max-w-[340px] min-w-0">
              <span className="text-base leading-none flex-shrink-0">{fileIcon(attachedFile)}</span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs truncate font-medium" style={{ color: 'var(--text-primary)' }}>{attachedFile.name}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  {formatSize(attachedFile.size)}
                  {category === 'binary' && ' · будет извлечён текст'}
                  {category === 'image' && ' · изображение'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setAttachedFile(null)}
              className="text-sm focus:outline-none flex-shrink-0 opacity-40 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
              type="button"
            >✕</button>
          </motion.div>
        )}

        {/* Input container */}
        <div
          className={cn(
            'flex flex-col bg-[var(--bg-input)] border rounded-2xl px-4 pt-3.5 pb-2.5 transition-all',
            hasContent
              ? 'border-[var(--accent-border)] shadow-[0_0_0_3px_var(--accent-glow)]'
              : 'border-[var(--border)] focus-within:border-[var(--accent-border)] focus-within:shadow-[0_0_0_3px_var(--accent-glow)]'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={chatMode === 'video' ? 'image/*' : chatMode === 'music' ? '' : ACCEPT}
            className="hidden"
            onChange={handleFileChange}
          />

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); adjustHeight(); onInputChange?.(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder={activePlaceholder}
            disabled={disabled}
            rows={1}
            spellCheck={true}
            style={{ fontSize: '16px', minHeight: '36px', color: 'var(--text-primary)' }}
            className={cn(
              'w-full bg-transparent resize-none outline-none leading-[1.75] max-h-[200px] placeholder:opacity-30',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />

          {/* Toolbar */}
          <div className="flex items-center gap-1.5 mt-2">

            {/* Attach — hidden in music mode */}
            {chatMode !== 'music' && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--bg-elevated)] opacity-35 hover:opacity-80"
                style={{ color: 'var(--text-primary)' }}
                type="button"
                title="Прикрепить файл"
              >
                <AttachIcon size={16} />
              </button>
            )}

            {/* Mode selector */}
            <CustomSelect<ChatMode>
              value={chatMode}
              onChange={(m) => { if (m === 'chat') setChatMode?.('chat'); else toggleMode(m); }}
              options={[
                { value: 'chat',   label: 'Чат',      icon: <ChatIcon  size={13}/> },
                { value: 'images', label: 'Картинка', icon: <ImageIcon size={13}/> },
                { value: 'video',  label: 'Видео',    icon: <VideoIcon size={13}/> },
                { value: 'music',  label: 'Музыка',   icon: <MusicIcon size={13}/> },
              ]}
            />

            {/* Model pill — chat mode only */}
            {chatMode === 'chat' && setPreferredModel && (
              <ModelPill
                preferredModel={preferredModel}
                setPreferredModel={setPreferredModel}
                userPlan={userPlan}
                onUpgradeRequired={onUpgradeRequired}
                userProFreeRemaining={userProFreeRemaining}
              />
            )}

            {/* Push send to the right */}
            <div className="flex-1" />

            {/* Cost + Send */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {toolbarCost && <CostBadge cost={toolbarCost} size={13} />}

              {isStreaming ? (
                <motion.button
                  onClick={onStop}
                  whileTap={{ scale: 0.92 }}
                  type="button"
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.14)] transition-all"
                >
                  <span className="w-3 h-3 rounded-sm bg-white block" />
                </motion.button>
              ) : (
                <motion.button
                  onClick={handleSend}
                  disabled={!hasContent || disabled}
                  whileTap={{ scale: 0.92 }}
                  type="button"
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all focus:outline-none',
                    hasContent && !disabled
                      ? 'bg-accent text-white hover:opacity-90'
                      : 'bg-[var(--bg-elevated)] cursor-not-allowed opacity-40'
                  )}
                  style={!(hasContent && !disabled) ? { color: 'var(--text-secondary)' } : {}}
                >
                  <SendIcon size={15} />
                </motion.button>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
          GhostLine может ошибаться. Проверяйте важную информацию.
        </p>
      </div>
    </div>
  );
}

// ─── Model pill (chat mode) ────────────────────────────────────────────────────

const MODEL_OPTIONS: { key: 'haiku' | 'deepseek'; label: string }[] = [
  { key: 'haiku',    label: 'Стандарт' },
  { key: 'deepseek', label: 'Про' },
];

function ModelPill({
  preferredModel, setPreferredModel, userPlan, onUpgradeRequired, userProFreeRemaining,
}: {
  preferredModel?: 'haiku' | 'deepseek' | undefined;
  setPreferredModel: (m: 'haiku' | 'deepseek' | undefined) => void;
  userPlan?: string;
  onUpgradeRequired?: () => void;
  userProFreeRemaining?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // default to 'haiku' if undefined
  const currentKey = preferredModel ?? 'haiku';
  const current = MODEL_OPTIONS.find((o) => o.key === currentKey) ?? MODEL_OPTIONS[0];

  function proLabel(): React.ReactNode {
    if (!userPlan) return null; // still loading
    if (userPlan === 'ULTRA') return <span className="text-[10px] opacity-50 ml-1">∞</span>;
    if (userProFreeRemaining !== undefined && userProFreeRemaining > 0) {
      return (
        <span className="text-[10px] ml-1" style={{ color: '#4ade80' }}>
          {userProFreeRemaining} бесп.
        </span>
      );
    }
    if (userPlan === 'FREE') return null;
    return (
      <span className="flex items-center gap-0.5 text-[10px] ml-1" style={{ color: 'var(--accent)' }}>
        1<CasperCoin size={10} />
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[12px] transition-colors rounded-md px-1.5 py-0.5"
        style={{ color: 'var(--text-secondary)' }}
      >
        {current.label}
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute bottom-full mb-2 left-0 z-50 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xl"
            style={{ minWidth: '150px' }}
          >
            {MODEL_OPTIONS.map((opt) => {
              const locked = opt.key === 'deepseek' && userPlan === 'FREE';
              const isPro = opt.key === 'deepseek';
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    if (locked) { onUpgradeRequired?.(); setOpen(false); return; }
                    setPreferredModel(opt.key);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-[12px] transition-colors flex items-center justify-between hover:bg-[var(--bg-void)]',
                    currentKey === opt.key ? 'text-accent' : ''
                  )}
                  style={currentKey !== opt.key ? { color: 'var(--text-primary)' } : {}}
                >
                  <span>{opt.label}</span>
                  {locked ? (
                    <span className="text-[10px] text-[rgba(123,92,240,0.7)] ml-2">PRO</span>
                  ) : isPro ? proLabel() : null}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
