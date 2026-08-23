// Хелперы для вложений в InputBar — какие расширения к какой категории относятся,
// иконка и форматирование размера файла. Чистые функции, вынесены из InputBar.tsx.
// Карта "расширение → иконка" — единственный источник правды, используется и здесь
// (превью вложения в InputBar), и в MessageBubble (чип файла в сообщении).

import type { ComponentType } from 'react';
import { ImageIcon, DocumentIcon, TableIcon, CodeIcon, AttachIcon } from '@/components/icons';

export const ACCEPT = [
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

const DOCUMENT_EXTS = new Set(['pdf','doc','docx','odt','ppt','pptx','md','markdown','mdx','rst','txt','log']);
const TABLE_EXTS = new Set(['xls','xlsx','ods','csv','tsv']);
const CODE_EXTS = new Set(['js','jsx','ts','tsx','mjs','py','pyw','java','go','rs','rb','php','sql','sh','bash','zsh','ps1','json','yaml','yml','toml','ini','env','html','htm','xml','css','scss','graphql']);

type IconComponent = ComponentType<{ size?: number; className?: string }>;

/** Иконка по расширению файла (или имени файла целиком) — общая карта для InputBar и MessageBubble. */
export function fileExtIcon(nameOrExt: string): IconComponent {
  const ext = nameOrExt.includes('.') ? (nameOrExt.split('.').pop()?.toLowerCase() ?? '') : nameOrExt.toLowerCase();
  if (IMAGE_EXTS.has(ext)) return ImageIcon;
  if (DOCUMENT_EXTS.has(ext)) return DocumentIcon;
  if (TABLE_EXTS.has(ext)) return TableIcon;
  if (CODE_EXTS.has(ext)) return CodeIcon;
  return AttachIcon;
}

/** Иконка по объекту File — учитывает ещё и MIME-тип для изображений. */
export function fileIconFor(file: File): IconComponent {
  if (file.type.startsWith('image/')) return ImageIcon;
  return fileExtIcon(file.name);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
