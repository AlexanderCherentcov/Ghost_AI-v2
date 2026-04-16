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

export type CameraPreset = 'static' | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down' | 'orbit';

export interface VideoOptions {
  duration: 5 | 10;
  aspectRatio: '16:9' | '9:16' | '1:1';
  enableAudio: boolean;
  cameraPreset: CameraPreset;
  negativePrompt: string;
  cfgScale: number;
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

export type ChatMode = 'chat' | 'images' | 'video';

const CHAT_MODES: { key: ChatMode; label: string }[] = [
  { key: 'chat',   label: 'Чат' },
  { key: 'images', label: 'Картинки' },
  { key: 'video',  label: 'Видео' },
];

interface InputBarProps {
  onSend: (prompt: string, file?: File, videoOptions?: VideoOptions) => void;
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

export function InputBar({
  onSend, onStop, disabled = false, isStreaming = false,
  placeholder, preferredModel, setPreferredModel, userPlan, onUpgradeRequired,
  chatMode, setChatMode,
}: InputBarProps) {
  const [value, setValue] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [videoOptions, setVideoOptions] = useState<VideoOptions>({
    duration: 5,
    aspectRatio: '16:9',
    enableAudio: false,
    cameraPreset: 'static',
    negativePrompt: '',
    cfgScale: 0.5,
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if ((!trimmed && !attachedFile) || disabled) return;
    const opts = chatMode === 'video' ? videoOptions : undefined;
    onSend(trimmed, attachedFile ?? undefined, opts);
    setValue('');
    setAttachedFile(null);
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setAttachedFile(file);
    e.target.value = '';
  }

  const hasContent = value.trim() || attachedFile;
  const category = attachedFile ? getFileCategory(attachedFile) : null;

  return (
    <div className="flex-shrink-0 px-4 pb-2 pt-2 lg:pb-4">
      <div className="max-w-[720px] mx-auto">

        {/* Video options panel */}
        {chatMode === 'video' && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap items-center gap-2 mb-2"
          >
            {/* Duration */}
            <div className="flex items-center gap-1">
              {([5, 10] as const).map((d) => (
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
                  {d}с
                </button>
              ))}
            </div>

            <span className="text-[rgba(255,255,255,0.15)] text-[11px]">|</span>

            {/* Aspect ratio */}
            <div className="flex items-center gap-1">
              {(['16:9', '9:16', '1:1'] as const).map((ar) => (
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

            {/* 10s warning */}
            {videoOptions.duration === 10 && (
              <span className="text-[10px]" style={{ color: 'rgba(255,200,80,0.7)' }}>
                10с = 2 генерации видео
              </span>
            )}
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
            accept={chatMode === 'video' ? 'image/*' : ACCEPT}
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
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1">
              {/* Attach / plus button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-7 h-7 flex items-center justify-center transition-colors focus:outline-none rounded-md hover:bg-[var(--bg-elevated)] opacity-40 hover:opacity-80"
                style={{ color: 'var(--text-primary)' }}
                title="Прикрепить файл"
                type="button"
                aria-label="Прикрепить файл"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>

              {/* Chat mode tabs */}
              {chatMode !== undefined && setChatMode && (
                <div className="flex items-center gap-0.5 ml-1">
                  {CHAT_MODES.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setChatMode(m.key)}
                      className={cn(
                        'px-2 py-0.5 rounded-md text-[12px] transition-colors',
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
              )}

              {/* Model selector — only in chat mode */}
              {setPreferredModel && (!chatMode || chatMode === 'chat') && (
                <ModelPill
                  preferredModel={preferredModel}
                  setPreferredModel={setPreferredModel}
                  userPlan={userPlan}
                  onUpgradeRequired={onUpgradeRequired}
                />
              )}

              {/* Video settings — only in video mode */}
              {chatMode === 'video' && (
                <VideoSettingsMenu
                  options={videoOptions}
                  onChange={setVideoOptions}
                />
              )}
            </div>

            {/* Stop / Send */}
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
