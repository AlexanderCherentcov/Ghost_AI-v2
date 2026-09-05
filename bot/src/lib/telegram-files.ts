import axios from 'axios';
import FormData from 'form-data';
import type { UserSession } from './session.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? 'http://backend:4000';

// Собственный API Telegram не блокируется по гео (бот и так опрашивает его напрямую
// через long polling), поэтому эти запросы идут через обычный HTTPS_PROXY, как и другие
// внешние вызовы — в отличие от внутренних вызовов backend:4000 в api-client.ts/session.ts,
// которым нужен proxy:false.

async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; filename: string }> {
  const { data } = await axios.get(`${TELEGRAM_API}/getFile`, { params: { file_id: fileId } });
  const filePath: string = data.result.file_path;
  const res = await axios.get(`${TELEGRAM_FILE_API}/${filePath}`, { responseType: 'arraybuffer' });
  return { buffer: Buffer.from(res.data), filename: filePath.split('/').pop() ?? 'file' };
}

/** Скачивает фото из Telegram и загружает его в хранилище GhostLine, возвращая публичный URL. */
export async function uploadTelegramImage(session: UserSession, fileId: string): Promise<string> {
  const { buffer, filename } = await downloadTelegramFile(fileId);
  const form = new FormData();
  form.append('file', buffer, { filename });
  const res = await axios.post(`${INTERNAL_API_URL}/api/upload/image`, form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${session.accessToken}` },
    proxy: false,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return res.data.url as string;
}

export interface ExtractedDocument {
  text: string;
  fileName: string;
  lang: string;
}

/** Скачивает документ из Telegram и извлекает его текстовое содержимое через бэкенд. */
export async function extractTelegramDocument(session: UserSession, fileId: string): Promise<ExtractedDocument> {
  const { buffer, filename } = await downloadTelegramFile(fileId);
  const form = new FormData();
  form.append('file', buffer, { filename });
  const res = await axios.post(`${INTERNAL_API_URL}/api/upload/extract`, form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${session.accessToken}` },
    proxy: false,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return res.data as ExtractedDocument;
}
