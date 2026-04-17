import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.js';

// ─── MIME → language mapping for markdown code blocks ─────────────────────────

const MIME_TO_LANG: Record<string, string> = {
  'application/json': 'json',
  'application/xml': 'xml',
  'application/javascript': 'javascript',
  'application/x-javascript': 'javascript',
  'application/typescript': 'typescript',
  'application/x-sh': 'bash',
  'application/x-python': 'python',
  'application/x-ruby': 'ruby',
  'application/x-php': 'php',
  'application/sql': 'sql',
  'text/html': 'html',
  'text/css': 'css',
  'text/javascript': 'javascript',
  'text/typescript': 'typescript',
  'text/x-python': 'python',
  'text/x-java-source': 'java',
  'text/x-c': 'c',
  'text/x-c++': 'cpp',
  'text/x-go': 'go',
  'text/x-rust': 'rust',
  'text/x-ruby': 'ruby',
  'text/x-php': 'php',
  'text/x-sql': 'sql',
  'text/x-sh': 'bash',
  'text/markdown': 'markdown',
  'text/csv': 'csv',
  'text/xml': 'xml',
};

function extToLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    html: 'html', htm: 'html', xhtml: 'html',
    css: 'css', scss: 'scss', less: 'less', styl: 'stylus',
    json: 'json', jsonc: 'json', json5: 'json',
    yaml: 'yaml', yml: 'yaml',
    toml: 'toml', ini: 'ini', conf: 'conf', cfg: 'ini', env: 'bash',
    xml: 'xml', svg: 'xml', graphql: 'graphql', gql: 'graphql',
    md: 'markdown', markdown: 'markdown', mdx: 'markdown',
    txt: 'text', log: 'text', rst: 'text',
    py: 'python', pyw: 'python',
    java: 'java', kt: 'kotlin', kts: 'kotlin',
    c: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'c', hpp: 'cpp',
    go: 'go', rs: 'rust', rb: 'ruby', php: 'php', swift: 'swift',
    dart: 'dart', r: 'r', lua: 'lua', pl: 'perl', pm: 'perl',
    ex: 'elixir', exs: 'elixir', erl: 'erlang', hs: 'haskell',
    sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash', ps1: 'powershell',
    tf: 'hcl', hcl: 'hcl', dockerfile: 'dockerfile',
    csv: 'csv', tsv: 'csv', proto: 'protobuf',
    vue: 'vue', svelte: 'svelte',
  };
  return map[ext] ?? 'text';
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default async function uploadRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/upload/extract
   * Accepts a single file (multipart), extracts text content.
   * Returns { text, fileName, lang } ready for the AI context.
   *
   * Supports:
   *   - PDF  → pdf-parse
   *   - DOCX → mammoth
   *   - XLSX / XLS → xlsx (SheetJS)
   *   - All text-based files → raw UTF-8
   */
  fastify.post('/upload/extract', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No file provided' });
      }

      const buffer = await data.toBuffer();
      const fileName = data.filename ?? 'file';
      const mime = data.mimetype ?? '';
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

      const MAX_CHARS = 60_000; // ~15k tokens
      let text = '';
      let lang = extToLang(fileName);

      try {
        // ── PDF ────────────────────────────────────────────────────────────────
        if (mime === 'application/pdf' || ext === 'pdf') {
          const pdfParse = (await import('pdf-parse')).default;
          const result = await pdfParse(buffer);
          text = result.text?.trim() ?? '';
          lang = 'text';
        }

        // ── DOCX ──────────────────────────────────────────────────────────────
        else if (
          mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          ext === 'docx'
        ) {
          const mammoth = await import('mammoth');
          const result = await mammoth.extractRawText({ buffer });
          text = result.value?.trim() ?? '';
          lang = 'text';
        }

        // ── DOC (legacy Word) — try mammoth anyway ─────────────────────────
        else if (mime === 'application/msword' || ext === 'doc') {
          try {
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            text = result.value?.trim() ?? '';
          } catch {
            text = '[Не удалось извлечь текст из .doc файла]';
          }
          lang = 'text';
        }

        // ── XLSX / XLS ────────────────────────────────────────────────────────
        else if (
          mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          mime === 'application/vnd.ms-excel' ||
          ext === 'xlsx' || ext === 'xls'
        ) {
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          const parts: string[] = [];
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            if (csv.trim()) parts.push(`### Лист: ${sheetName}\n${csv}`);
          }
          text = parts.join('\n\n');
          lang = 'csv';
        }

        // ── PPTX (PowerPoint) — extract text via raw XML scan ─────────────
        else if (
          mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
          ext === 'pptx'
        ) {
          // PPTX is a ZIP; scan the raw buffer for DrawingML <a:t> text runs
          // without adding a ZIP dependency — good enough for most slides.
          const text_parts: string[] = [];
          try {
            const raw = buffer.toString('latin1'); // lossless binary→string
            const matches = raw.match(/<a:t(?:\s[^>]*)?>([^<]+)<\/a:t>/g) ?? [];
            for (const m of matches) {
              const t = m.replace(/<[^>]+>/g, '').trim();
              if (t) text_parts.push(t);
            }
          } catch {
            // fall through
          }
          text = text_parts.join(' ') || `[PowerPoint файл: ${fileName} — текст не извлечён]`;
          lang = 'text';
        }

        // ── All other files — try as UTF-8 text ───────────────────────────
        else {
          text = buffer.toString('utf-8');
          // Quick binary check: if > 5% non-printable chars → not a text file
          const nonPrintable = (text.match(/[\x00-\x08\x0e-\x1f\x7f]/g) ?? []).length;
          if (nonPrintable / text.length > 0.05) {
            return reply.code(422).send({ error: 'Файл является бинарным и не может быть прочитан' });
          }
        }
      } catch (err: any) {
        // [M-24] Log full error server-side, return safe message to client
        fastify.log.error(err, '[upload/extract] parse error');
        return reply.code(500).send({ error: 'Не удалось обработать файл' });
      }

      // Trim + truncate
      text = text.trim();
      const truncated = text.length > MAX_CHARS;
      if (truncated) text = text.slice(0, MAX_CHARS) + '\n\n[... файл обрезан до 60 000 символов]';

      return { text, fileName, lang, truncated, chars: text.length };
    },
  });
}
