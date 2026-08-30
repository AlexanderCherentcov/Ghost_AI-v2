import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'audio');

/** Сохраняет data:audio/... URI на диск, возвращает публичный URL. */
export function saveAudioDataUri(dataUri: string): string {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const [header, base64] = dataUri.split(',');
  const ext = header.includes('mp3') || header.includes('mpeg') ? 'mp3' : header.includes('wav') ? 'wav' : 'mp3';
  const filename = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(base64, 'base64'));
  return `${process.env.API_URL ?? 'http://localhost:4000'}/audio/${filename}`;
}
