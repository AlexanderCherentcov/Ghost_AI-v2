'use client';

import { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SendIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { VideoSettingsMenu } from './VideoSettingsMenu';

// ─── Accepted file types ──────────────────────────────────────────────────────

const ACCEPT = [
  'image/*',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods',
  '.txt', '.md', '.markdown', '.mdx', '.rst', '.log', '.csv', '.tsv',
  '.html', '.htm', '.xhtml', '.xml', '.svg', '.css', '.scss', '.less', '.styl',
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
  '.json', '.jsonc', '.json5', '.yaml', '.yml', '.toml', '.ini', '.env',
  '.conf', '.cfg', '.config', '.gitignore', '.gitattributes', '.editorconfig',
  '.py', '.pyw', '.java', '.kt', '.kts', '.swift', '.dart',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
  '.go', '.rs', '.rb', '.php', '.pl', '.pm', '.r',
  '.lua', '.ex', '.exs', '.erl', '.hs', '.scala', '.clj',
  '.vue', '.svelte',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.sql', '.tf', '.hcl', '.dockerfile', '.makefile', '.cmake',
  '.proto', '.graphql', '.gql', '.thrift',
].join(',');

const TEXT_EXTS = new Set([
  'txt','md','markdown','mdx','rst','log','csv','tsv',
  'html','htm','xhtml','xml','svg',
  'css','scss','less','styl','stylus',
  'js','jsx','mjs','cjs','ts','tsx','mts','cts',
  'json','jsonc','json5','yaml','yml','toml','ini','env','conf','cfg','config',
  'gitignore','gitattributes','editorconfig',
  'py','pyw','java','kt','kts','swift','dart',
  'c','cpp','cc','cxx','h','hpp','hxx',
  'go','rs','rb','php','pl','pm','r',
  'lua','ex','exs','erl','hs','scala','clj',
  'vue','svelte',
  'sh','bash','zsh','fish','ps1','bat','cmd',
  'sql','tf','hcl','dockerfile','makefile','cmake',
  'proto','graphql','gql','thrift',
]);
const BINARY_EXTS = new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods']);
const IMAGE_EXTS  = new Set(['jpg','jpeg','png','gif','webp','bmp','avif','tiff','svg','ico']);

export type FileCategory = 'image' | 'text' | 'binary';
export function getFileCategory(file: File): FileCategory {
  if (file.type.startsWith('image/')) return 'image';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (BINARY_EXTS.has(ext)) return 'binary';
  if (TEXT_EXTS.has(ext) || file.type.startsWith('text/')) return 'text';
  return 'text';
}

function fileIcon(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTS.has(ext) || file.type.startsWith('image/')) return '🖼️';
  if (ext === 'pdf') return '📄';
  if (['doc','docx','odt'].includes(ext)) return '📝';
  if (['xls','xlsx','ods','csv','tsv'].includes(ext)) return '📊';
  if (['ppt','pptx'].includes(ext)) return '📑';
  if (['js','jsx','ts','tsx','mjs','cjs'].includes(ext)) return '⚡';
  if (['py','pyw'].includes(ext)) return '🐍';
  if (['html','htm','xhtml','xml','svg'].includes(ext)) return '🌐';
  if (['json','yaml','yml','toml'].includes(ext)) return '⚙️';
  if (['sql'].includes(ext)) return '🗄️';
  if (['sh','bash','zsh','fish','ps1'].includes(ext)) return '💻';
  if (['md','markdown','rst'].includes(ext)) return '📋';
  return '📎';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Video options ────────────────────────────────────────────────────────────

export type VideoModel = 'standard' | 'pro';

export interface VideoOptions {
  videoModel: VideoModel;
  duration: '4s' | '8s';
  aspectRatio: '16:9' | '9:16';
  enableAudio: boolean;
  resolution: '720p' | '1080p';
  imageUrl?: string;
  negativePrompt: string;
}

// ─── Model selector (inline in toolbar) ───────────────────────────────────────

const MODEL_OPTIONS: { key: 'haiku' | 'deepseek' | undefined; label: string }[] = [
  { key: undefined,  label: 'Авто' },
  { key: 'haiku',    label: 'Стандарт' },
  { key: 'deepseek', label: 'Про' },
];

function ModelPill({
  preferredModel,
  setPreferredModel,
  userPlan,
  onUpgradeRequired,
}: {
  preferredModel: 'haiku' | 'deepseek' | undefined;
  setPreferredModel: (m: 'haiku' | 'deepseek' | undefined) => void;
  userPlan?: string;
  onUpgradeRequired?: () => void;
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

  const current = MODEL_OPTIONS.find(o => o.key === preferredModel) ?? MODEL_OPTIONS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
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
            style={{ minWidth: '130px' }}
          >
            {MODEL_OPTIONS.map(opt => {
              const isProLocked = opt.key === 'deepseek' && userPlan === 'FREE';
              return (
                <button
                  key={String(opt.key)}
                  type="button"
                  onClick={() => {
                    if (isProLocked) { onUpgradeRequired?.(); setOpen(false); return; }
                    setPreferredModel(opt.key);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-[12px] transition-colors flex items-center justify-between hover:bg-[var(--bg-void)]',
                    preferredModel === opt.key
                      ? 'text-accent'
                      : ''
                  )}
                  style={preferredModel !== opt.key ? { color: 'var(--text-primary)' } : {}}
                >
                  {opt.label}
                  {isProLocked && (
                    <span className="text-[10px] text-[rgba(123,92,240,0.7)] ml-2">PRO</span>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export type ChatMode = 'chat' | 'images' | 'video' | 'music';
export type MusicMode = 'short' | 'long' | 'quality' | 'suno';

const CHAT_MODES: { key: ChatMode; label: string }[] = [
  { key: 'chat',   label: 'Чат' },
  { key: 'images', label: 'Картинки' },
  { key: 'video',  label: 'Видео' },
  { key: 'music',  label: 'Музыка' },
];

const MUSIC_DURATIONS = [15, 30, 45, 60] as const;

interface InputBarProps {
  onSend: (prompt: string, file?: File, videoOptions?: VideoOptions, musicMode?: MusicMode, musicDuration?: number, sunoStyle?: string, sunoTitle?: string, sunoInstrumental?: boolean, lyrics?: string) => void;
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
}

const MUSIC_MODES: { key: MusicMode; label: string }[] = [
  { key: 'short',   label: 'Короткий' },
  { key: 'long',    label: 'Длинный'  },
  { key: 'quality', label: 'Студия'   },
  { key: 'suno',    label: 'Suno'     },
];

export function InputBar({
  onSend, onStop, disabled = false, isStreaming = false,
  placeholder, preferredModel, setPreferredModel, userPlan, onUpgradeRequired,
  chatMode, setChatMode,
}: InputBarProps) {
  const [value, setValue] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [musicMode, setMusicMode] = useState<MusicMode>('short');
  const [musicDuration, setMusicDuration] = useState(30);
  const [sunoStyle, setSunoStyle] = useState('');
  const [sunoTitle, setSunoTitle] = useState('');
  const [sunoInstrumental, setSunoInstrumental] = useState(false);
  const [lyrics, setLyrics] = useState('');
  const [showLyrics, setShowLyrics] = useState(false);
  const [videoOptions, setVideoOptions] = useState<VideoOptions>({
    videoModel: 'standard',
    duration: '8s',
    aspectRatio: '16:9',
    enableAudio: false,
    resolution: '720p',
    negativePrompt: '',
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false); // L-08: защита от повторной отправки до обновления isStreaming

  function handleSend() {
    const trimmed = value.trim();
    if ((!trimmed && !attachedFile) || disabled) return;
    if (sendingRef.current) return;
    sendingRef.current = true;
    const opts = chatMode === 'video' ? videoOptions : undefined;
    const mMode = chatMode === 'music' ? musicMode : undefined;
    const mDur = (chatMode === 'music' && musicMode === 'quality') ? musicDuration : undefined;
    const sStyle = (chatMode === 'music' && musicMode === 'suno') ? sunoStyle.trim() || undefined : undefined;
    const sTitle = (chatMode === 'music' && musicMode === 'suno') ? sunoTitle.trim() || undefined : undefined;
    const sInstr = (chatMode === 'music' && musicMode === 'suno') ? sunoInstrumental : undefined;
    const lyr = (chatMode === 'music' && (musicMode === 'short' || musicMode === 'long')) ? lyrics.trim() || undefined : undefined;
    onSend(trimmed, attachedFile ?? undefined, opts, mMode, mDur, sStyle, sTitle, sInstr, lyr);
    setValue('');
    setAttachedFile(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setTimeout(() => { sendingRef.current = false; }, 500);
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setAttachedFile(file);
    e.target.value = '';
  }

  const hasContent = value.trim() || attachedFile;
  const category = attachedFile ? getFileCategory(attachedFile) : null;

  return (
    <div className="flex-shrink-0 px-4 pt-2 pb-0 lg:pb-4">
      <div className="max-w-[720px] mx-auto">

        {/* Music mode panel */}
        {chatMode === 'music' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-center gap-2 mb-2"
          >
            {MUSIC_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMusicMode(m.key)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border',
                  musicMode === m.key
                    ? 'bg-[rgba(123,92,240,0.2)] text-accent border-[rgba(123,92,240,0.4)]'
                    : 'text-[rgba(255,255,255,0.38)] border-[var(--border)] hover:text-[rgba(255,255,255,0.65)]'
                )}
              >
                {m.label}
              </button>
            ))}

            {/* Duration selector — only for Студия (Udio) */}
            {musicMode === 'quality' && (
              <>
                <span className="text-[rgba(255,255,255,0.15)] text-[11px]">|</span>
                {MUSIC_DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setMusicDuration(d)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border',
                      musicDuration === d
                        ? 'bg-[rgba(123,92,240,0.2)] text-accent border-[rgba(123,92,240,0.4)]'
                        : 'text-[rgba(255,255,255,0.38)] border-[var(--border)] hover:text-[rgba(255,255,255,0.65)]'
                    )}
                  >
                    {d}с
                  </button>
                ))}
              </>
            )}

            {/* Lyrics toggle — for short/long (DiffRhythm) modes */}
            {(musicMode === 'short' || musicMode === 'long') && (
              <>
                <span className="text-[rgba(255,255,255,0.15)] text-[11px]">|</span>
                <button
                  type="button"
                  onClick={() => setShowLyrics((v) => !v)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border',
                    showLyrics
                      ? 'bg-[rgba(123,92,240,0.2)] text-accent border-[rgba(123,92,240,0.4)]'
                      : 'text-[rgba(255,255,255,0.38)] border-[var(--border)] hover:text-[rgba(255,255,255,0.65)]'
                  )}
                >
                  🎤 Текст песни
                </button>
              </>
            )}

            {/* Suno options */}
            {musicMode === 'suno' && (
              <>
                <span className="text-[rgba(255,255,255,0.15)] text-[11px]">|</span>
                <input
                  value={sunoStyle}
                  onChange={(e) => setSunoStyle(e.target.value)}
                  placeholder="Стиль (Jazz, Electronic...)"
                  maxLength={200}
                  className="px-2.5 py-1 rounded-lg text-[11px] outline-none border"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border)',
                    width: '160px',
                  }}
                />
                <input
                  value={sunoTitle}
                  onChange={(e) => setSunoTitle(e.target.value)}
                  placeholder="Название (необяз.)"
                  maxLength={100}
                  className="px-2.5 py-1 rounded-lg text-[11px] outline-none border"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border)',
                    width: '140px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setSunoInstrumental((v) => !v)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border',
                    sunoInstrumental
                      ? 'bg-[rgba(123,92,240,0.2)] text-accent border-[rgba(123,92,240,0.4)]'
                      : 'text-[rgba(255,255,255,0.38)] border-[var(--border)] hover:text-[rgba(255,255,255,0.65)]'
                  )}
                >
                  {sunoInstrumental ? '🎹' : '🎤'} {sunoInstrumental ? 'Инструментал' : 'Вокал'}
                </button>
              </>
            )}
          </motion.div>
        )}

        {/* Lyrics textarea — for DiffRhythm short/long modes */}
        {chatMode === 'music' && (musicMode === 'short' || musicMode === 'long') && showLyrics && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-2"
          >
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder={'Текст песни (каждая строка — отдельная строфа)\n\nПример:\nWalking through the rain\nFeeling all the pain\nLooking for the light'}
              rows={5}
              maxLength={10000}
              className="w-full rounded-xl px-3 py-2 text-[13px] outline-none resize-none placeholder:opacity-30 leading-relaxed"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            />
            <p className="text-[10px] mt-1 px-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Временны́е метки расставятся автоматически. Секции [Chorus], [Verse] и т.д. будут пропущены.
            </p>
          </motion.div>
        )}

        {/* Video options panel */}
        {chatMode === 'video' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-center gap-2 mb-2"
          >
            {/* Duration */}
            <div className="flex items-center gap-1">
              {(['4s', '8s'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setVideoOptions(o => ({ ...o, duration: d }))}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border',
                    videoOptions.duration === d
                      ? 'bg-[rgba(123,92,240,0.2)] text-accent border-[rgba(123,92,240,0.4)]'
                      : 'text-[rgba(255,255,255,0.38)] border-[var(--border)] hover:text-[rgba(255,255,255,0.65)]'
                  )}
                >
                  {d}
                </button>
              ))}
            </div>

            <span className="text-[rgba(255,255,255,0.15)] text-[11px]">|</span>

            {/* Aspect ratio */}
            <div className="flex items-center gap-1">
              {(['16:9', '9:16'] as const).map((ar) => (
                <button
                  key={ar}
                  type="button"
                  onClick={() => setVideoOptions(o => ({ ...o, aspectRatio: ar }))}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border',
                    videoOptions.aspectRatio === ar
                      ? 'bg-[rgba(123,92,240,0.2)] text-accent border-[rgba(123,92,240,0.4)]'
                      : 'text-[rgba(255,255,255,0.38)] border-[var(--border)] hover:text-[rgba(255,255,255,0.65)]'
                  )}
                >
                  {ar}
                </button>
              ))}
            </div>

            <span className="text-[rgba(255,255,255,0.15)] text-[11px]">|</span>

            {/* Audio toggle */}
            <button
              type="button"
              onClick={() => setVideoOptions(o => ({ ...o, enableAudio: !o.enableAudio }))}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all border',
                videoOptions.enableAudio
                  ? 'bg-[rgba(123,92,240,0.2)] text-accent border-[rgba(123,92,240,0.4)]'
                  : 'text-[rgba(255,255,255,0.38)] border-[var(--border)] hover:text-[rgba(255,255,255,0.65)]'
              )}
            >
              {videoOptions.enableAudio ? '🔊' : '🔇'} Звук
            </button>
          </motion.div>
        )}

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
                <span className="text-xs truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                  {attachedFile.name}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  {formatSize(attachedFile.size)}
                  {category === 'binary' && ' · будет извлечён текст'}
                  {category === 'image' && ' · изображение'}
                  {category === 'text' && ' · текст / код'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setAttachedFile(null)}
              className="text-sm focus:outline-none flex-shrink-0 opacity-40 hover:opacity-80 transition-opacity"
              style={{ color: 'var(--text-primary)' }}
              type="button"
              aria-label="Удалить файл"
            >
              ✕
            </button>
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
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={chatMode === 'video' ? 'image/*' : chatMode === 'music' ? '' : ACCEPT}
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); handleInput(); }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? 'Напишите что-нибудь...'}
            disabled={disabled}
            rows={1}
            spellCheck={true}
            style={{ fontSize: '16px', minHeight: '36px', color: 'var(--text-primary)' }}
            className={cn(
              'w-full bg-transparent resize-none outline-none leading-[1.75] max-h-[200px] placeholder:opacity-30',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />

          {/* Bottom toolbar */}
          <div className="flex items-center gap-1 mt-2 min-w-0">
            {/* Attach / plus button — fixed left, hidden in music mode */}
            {chatMode !== 'music' && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center transition-colors focus:outline-none rounded-md hover:bg-[var(--bg-elevated)] opacity-40 hover:opacity-80"
                style={{ color: 'var(--text-primary)' }}
                title="Прикрепить файл"
                type="button"
                aria-label="Прикрепить файл"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}

            {/* Chat mode tabs — scrollable on mobile */}
            {chatMode !== undefined && setChatMode && (
              <div className="flex-1 overflow-x-auto scrollbar-none min-w-0">
                <div className="flex items-center gap-0.5 w-max px-0.5">
                  {CHAT_MODES.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setChatMode(m.key)}
                      className={cn(
                        'px-2 py-0.5 rounded-md text-[12px] transition-colors whitespace-nowrap',
                        chatMode === m.key
                          ? 'bg-[var(--accent-dim)] text-accent font-medium'
                          : 'hover:opacity-80 opacity-40'
                      )}
                      style={chatMode !== m.key ? { color: 'var(--text-primary)' } : {}}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Model selector — only in chat mode */}
            {setPreferredModel && (!chatMode || chatMode === 'chat') && (
              <div className="flex-shrink-0">
                <ModelPill
                  preferredModel={preferredModel}
                  setPreferredModel={setPreferredModel}
                  userPlan={userPlan}
                  onUpgradeRequired={onUpgradeRequired}
                />
              </div>
            )}

            {/* Video settings — only in video mode */}
            {chatMode === 'video' && (
              <div className="flex-shrink-0">
                <VideoSettingsMenu
                  options={videoOptions}
                  onChange={setVideoOptions}
                />
              </div>
            )}

            {/* Stop / Send — fixed right */}
            {isStreaming ? (
              <motion.button
                onClick={onStop}
                whileTap={{ scale: 0.92 }}
                type="button"
                title="Остановить"
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

        <p className="text-center text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
          GhostLine может ошибаться. Проверяйте важную информацию.
        </p>
      </div>
    </div>
  );
}
