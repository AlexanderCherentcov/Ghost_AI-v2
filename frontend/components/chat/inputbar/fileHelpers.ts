// Хелперы для вложений в InputBar — какие расширения к какой категории относятся,
// иконка и форматирование размера файла. Чистые функции, вынесены из InputBar.tsx.

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

export function fileIcon(file: File): string {
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

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
