'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { SendIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

// ─── Accepted file types ──────────────────────────────────────────────────────

// Every mime / extension we let through
const ACCEPT = [
  // Images
  'image/*',
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods',
  // Text / config
  '.txt', '.md', '.markdown', '.mdx', '.rst', '.log', '.csv', '.tsv',
  // Web
  '.html', '.htm', '.xhtml', '.xml', '.svg', '.css', '.scss', '.less', '.styl',
  // JavaScript / TypeScript
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
  // Data
  '.json', '.jsonc', '.json5', '.yaml', '.yml', '.toml', '.ini', '.env',
  '.conf', '.cfg', '.config', '.gitignore', '.gitattributes', '.editorconfig',
  // Programming languages
  '.py', '.pyw', '.java', '.kt', '.kts', '.swift', '.dart',
  '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
  '.go', '.rs', '.rb', '.php', '.pl', '.pm', '.r',
  '.lua', '.ex', '.exs', '.erl', '.hs', '.scala', '.clj',
  '.vue', '.svelte',
  // Shell
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  // Infrastructure / DB
  '.sql', '.tf', '.hcl', '.dockerfile', '.makefile', '.cmake',
  '.proto', '.graphql', '.gql', '.thrift',
].join(',');

// File-type category detection
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
  return 'text'; // default: try as text
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

// ─── Component ────────────────────────────────────────────────────────────────

interface InputBarProps {
  onSend: (prompt: string, file?: File) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
}

export function InputBar({ onSend, onStop, disabled = false, isStreaming = false, placeholder }: InputBarProps) {
  const [value, setValue] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if ((!trimmed && !attachedFile) || disabled) return;
    onSend(trimmed, attachedFile ?? undefined);
    setValue('');
    setAttachedFile(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
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
    <div className="px-4 pb-4 pt-2">
      <div className="max-w-[720px] mx-auto">

        {/* Attached file preview */}
        {attachedFile && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-2 px-1"
          >
            <div className="flex items-center gap-2 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg px-3 py-1.5 max-w-[340px]">
              <span className="text-base leading-none">{fileIcon(attachedFile)}</span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-[rgba(255,255,255,0.75)] truncate font-medium">
                  {attachedFile.name}
                </span>
                <span className="text-[10px] text-[rgba(255,255,255,0.3)]">
                  {formatSize(attachedFile.size)}
                  {category === 'binary' && ' · будет извлечён текст'}
                  {category === 'image' && ' · изображение'}
                  {category === 'text' && ' · текст / код'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setAttachedFile(null)}
              className="text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.7)] text-sm focus:outline-none flex-shrink-0"
              type="button"
              aria-label="Удалить файл"
            >
              ✕
            </button>
          </motion.div>
        )}

        <div
          className={cn(
            'flex items-end gap-3 bg-[var(--bg-input)] border rounded-2xl px-4 py-3 transition-all',
            hasContent
              ? 'border-[var(--accent-border)] shadow-[0_0_0_3px_var(--accent-glow)]'
              : 'border-[var(--border)] focus-within:border-[var(--accent-border)] focus-within:shadow-[0_0_0_3px_var(--accent-glow)]'
          )}
        >
          {/* Hidden file input — maximum file types */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-[rgba(255,255,255,0.25)] hover:text-[rgba(255,255,255,0.55)] transition-colors flex-shrink-0 mb-0.5 focus:outline-none"
            title="Прикрепить файл (изображение, PDF, Word, Excel, код и другие)"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 3.5V14.5M3.5 9H14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
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
            style={{ fontSize: '16px' }}
            className={cn(
              'flex-1 bg-transparent resize-none outline-none text-[rgba(255,255,255,0.88)] placeholder:text-[rgba(255,255,255,0.2)] leading-6 max-h-[200px]',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          />

          {/* Stop / Send button */}
          {isStreaming ? (
            <motion.button
              onClick={onStop}
              whileTap={{ scale: 0.92 }}
              type="button"
              title="Остановить"
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mb-0.5 bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.14)] transition-all"
            >
              <span className="w-3.5 h-3.5 rounded-sm bg-white block" />
            </motion.button>
          ) : (
            <motion.button
              onClick={handleSend}
              disabled={!hasContent || disabled}
              whileTap={{ scale: 0.92 }}
              type="button"
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all mb-0.5 focus:outline-none',
                hasContent && !disabled
                  ? 'bg-accent text-white hover:opacity-90'
                  : 'bg-[var(--bg-elevated)] text-[rgba(255,255,255,0.25)] cursor-not-allowed'
              )}
            >
              <SendIcon size={16} />
            </motion.button>
          )}
        </div>

        <p className="text-center text-[11px] text-[rgba(255,255,255,0.15)] mt-2">
          GhostLine может ошибаться. Проверяйте важную информацию.
        </p>
      </div>
    </div>
  );
}
