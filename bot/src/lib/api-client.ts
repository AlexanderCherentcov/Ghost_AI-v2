import axios from 'axios';
import type { UserSession, Mode, VideoOptions, MusicOptions } from './session.js';

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
  const { data } = await client(session).post('/chats', { mode });
  return data;
}

export async function deleteChat(session: UserSession, chatId: string): Promise<void> {
  await client(session).delete(`/chats/${chatId}`);
}

/** Публикация готовой генерации в галерею (модерация) — см. backend/src/services/gallery.ts. */
export async function shareToGallery(session: UserSession, jobId: string): Promise<void> {
  await client(session).post('/gallery/share', { jobId });
}

export async function getChatMessages(session: UserSession, chatId: string, limit = 20) {
  const { data } = await client(session).get(`/chats/${chatId}/messages?limit=${limit}`);
  return data.messages as Array<{ role: string; content: string; mode: string; mediaUrl: string | null }>;
}


// ─── Реестр моделей (GET /plans → models) ────────────────────────────────────
// Единственный источник правды — backend/src/config/models.ts. Бот не хранит
// свой список/цены/лейблы, только читает отсюда — так же, как frontend/lib/api.ts.

export interface ModelCapabilities {
  vision?: boolean;
  search?: boolean;
  edit?: boolean;
  imageToVideo?: boolean;
  audio?: boolean;
}
export interface ChatModelOption {
  id: string;
  label: string;
  blurb?: string;
  cost: number;
  minPlan: string;
  capabilities: ModelCapabilities;
}
export interface ImageModelOption {
  id: string;
  label: string;
  blurb?: string;
  cost: number;
  minPlan: string;
  capabilities: ModelCapabilities;
}
export interface VideoModelOption {
  id: string;
  label: string;
  blurb?: string;
  minPlan: string;
  capabilities: ModelCapabilities;
  cost: { '4s': number; '8s': number };
}
export interface ModelCatalog {
  chat: ChatModelOption[];
  image: ImageModelOption[];
  video: VideoModelOption[];
}

let modelsCache: { data: ModelCatalog; fetchedAt: number } | null = null;
const MODELS_CACHE_TTL_MS = 60_000;

/** /plans не требует авторизации и одинаков для всех пользователей — кэшируем на минуту, чтобы не дёргать бэкенд на каждый тап меню. */
export async function getModels(): Promise<ModelCatalog> {
  if (modelsCache && Date.now() - modelsCache.fetchedAt < MODELS_CACHE_TTL_MS) return modelsCache.data;
  const { data } = await axios.get(`${API_URL}/api/plans`, { proxy: false });
  const models = data.models as ModelCatalog;
  modelsCache = { data: models, fetchedAt: Date.now() };
  return models;
}

// ─── Задачи генерации ───────────────────────────────────────────────────────

export interface GenJobResult {
  status: 'pending' | 'processing' | 'done' | 'failed';
  mediaUrl: string | null;
  error: string | null;
}

export async function startVisionJob(session: UserSession, chatId: string, prompt: string, model: string, sourceImageUrl?: string): Promise<string> {
  const { data } = await client(session).post('/generate/vision', { prompt, chatId, model, ...(sourceImageUrl ? { sourceImageUrl } : {}) });
  return data.jobId;
}

/**
 * musicMode: 'suno' — как на сайте (frontend/components/chat/InputBar.tsx): только в
 * этом режиме бэкенд (sound.worker.ts) учитывает title/style/instrumental/lyrics,
 * иначе они молча игнорируются.
 */
export async function startSoundJob(session: UserSession, chatId: string, prompt: string, options: MusicOptions): Promise<string> {
  const effectivePrompt = prompt.trim() || options.style || options.title || 'создай трек';
  const { data } = await client(session).post('/generate/sound', {
    prompt: effectivePrompt,
    chatId,
    musicMode: 'suno',
    sunoStyle: options.style || undefined,
    sunoTitle: options.title || undefined,
    sunoInstrumental: options.instrumental,
    lyrics: options.lyrics || undefined,
  });
  return data.jobId;
}

export async function generateLyrics(session: UserSession, topic: string, style: string, instrumental: boolean): Promise<string> {
  const { data } = await client(session).post('/generate/lyrics', {
    topic,
    style: style || undefined,
    instrumental,
  });
  return data.lyrics as string;
}

/** Транскрипт пользователя неизвестен заранее — voice.worker.ts пишет его в job.prompt после распознавания речи. */
export async function startVoiceJob(session: UserSession, chatId: string, audioUrl: string): Promise<string> {
  const { data } = await client(session).post('/generate/voice', { chatId, audioUrl });
  return data.jobId;
}

export async function startReelJob(
  session: UserSession, chatId: string, prompt: string, options: VideoOptions, videoImageUrl?: string,
): Promise<string> {
  const { data } = await client(session).post('/generate/reel', {
    prompt,
    chatId,
    model: options.videoModel,
    videoDuration: options.duration,
    videoAspectRatio: options.aspectRatio,
    videoEnableAudio: options.enableAudio,
    videoResolution: options.resolution,
    ...(options.negativePrompt ? { negativePrompt: options.negativePrompt } : {}),
    ...(videoImageUrl ? { videoImageUrl } : {}),
  });
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

// ─── История списания/начисления Caspers (GET /payments/caspers/history) ────
// Тот же эндпоинт, что и у сайта (frontend/lib/api.ts:casperHistory) — единая
// история, единая пагинация.

export interface CasperTransaction {
  id: string;
  amount: number; // положительное = начисление, отрицательное = списание
  reason: string; // id модели из реестра либо системный код (topup/welcome_bonus/refund_<reason> и т.п.)
  createdAt: string;
}

export interface CasperHistoryPage {
  transactions: CasperTransaction[];
  total: number;
  page: number;
  limit: number;
}

export async function getCasperHistory(session: UserSession, page = 1): Promise<CasperHistoryPage> {
  const { data } = await client(session).get(`/payments/caspers/history?page=${page}`);
  return data;
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
