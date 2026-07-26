import axios from 'axios';
import type { UserSession, Mode } from './session.js';

const API_URL = process.env.INTERNAL_API_URL ?? 'http://backend:4000';

function client(session: UserSession) {
  return axios.create({
    baseURL: `${API_URL}/api`,
    headers: { Authorization: `Bearer ${session.accessToken}` },
    timeout: 20_000,
    // proxy: false — внутренний Docker-хост backend:4000 недостижим через
    // внешний HTTPS_PROXY/HTTP_PROXY, выставленный для вызовов AI-провайдеров.
    proxy: false,
  });
}

export interface ChatSummary {
  id: string;
  title: string;
  mode: string;
  updatedAt: string;
  _count: { messages: number };
}

export async function listChats(session: UserSession): Promise<ChatSummary[]> {
  const { data } = await client(session).get('/chats');
  return data.chats;
}

export async function createChat(session: UserSession, mode: Mode): Promise<ChatSummary> {
  // Chat.mode различает только чаты-генерации в списке; оба текстовых режима сводятся к 'chat'.
  const chatMode = mode === 'chat' || mode === 'think' ? 'chat' : mode;
  const { data } = await client(session).post('/chats', { mode: chatMode });
  return data;
}

export async function deleteChat(session: UserSession, chatId: string): Promise<void> {
  await client(session).delete(`/chats/${chatId}`);
}

export async function getChatMessages(session: UserSession, chatId: string, limit = 20) {
  const { data } = await client(session).get(`/chats/${chatId}/messages?limit=${limit}`);
  return data.messages as Array<{ role: string; content: string; mode: string; mediaUrl: string | null }>;
}

// ─── Задачи генерации ───────────────────────────────────────────────────────

export interface GenJobResult {
  status: 'pending' | 'processing' | 'done' | 'failed';
  mediaUrl: string | null;
  error: string | null;
}

export async function startVisionJob(session: UserSession, chatId: string, prompt: string, sourceImageUrl?: string): Promise<string> {
  const { data } = await client(session).post('/generate/vision', { prompt, chatId, ...(sourceImageUrl ? { sourceImageUrl } : {}) });
  return data.jobId;
}

export async function startSoundJob(session: UserSession, chatId: string, prompt: string): Promise<string> {
  const { data } = await client(session).post('/generate/sound', { prompt, chatId });
  return data.jobId;
}

export async function startReelJob(session: UserSession, chatId: string, prompt: string, videoImageUrl?: string): Promise<string> {
  const { data } = await client(session).post('/generate/reel', { prompt, chatId, ...(videoImageUrl ? { videoImageUrl } : {}) });
  return data.jobId;
}

// ─── Профиль и оплата ───────────────────────────────────────────────────────
// Тот же GET /me и POST /payments/*, которыми пользуется сайт — бот не дублирует
// логику тарифов/оплаты, только вызывает существующие эндпоинты от имени пользователя.

export interface MeInfo {
  plan: string;
  caspers_balance: number;
  caspers_monthly: number;
  std_messages_today: number;
  pro_messages_today: number;
  images_this_week: number;
  music_this_week: number;
  videos_this_month: number;
}

export async function getMe(session: UserSession): Promise<MeInfo> {
  const { data } = await client(session).get('/me');
  return data;
}

/** Создаёт платёж за тариф и возвращает прямую ссылку на оплату ЮKassa. */
export async function createPlanPayment(session: UserSession, plan: string, billing: 'monthly' | 'yearly' = 'monthly'): Promise<string> {
  const { data } = await client(session).post('/payments/create', { plan, billing });
  return data.paymentUrl;
}

/** Создаёт платёж на докупку Caspers и возвращает прямую ссылку на оплату ЮKassa. */
export async function createCasperPayment(session: UserSession, amount: number): Promise<string> {
  const { data } = await client(session).post('/payments/caspers/create', { amount });
  return data.paymentUrl;
}

export async function pollJob(
  session: UserSession,
  jobId: string,
  { intervalMs = 3000, timeoutMs = 6 * 60_000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<GenJobResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await client(session).get(`/generate/${jobId}`);
    if (data.status === 'done' || data.status === 'failed') return data;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { status: 'failed', mediaUrl: null, error: 'Превышено время ожидания генерации' };
}
