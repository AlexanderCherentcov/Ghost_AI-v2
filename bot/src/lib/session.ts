import axios from 'axios';

const API_URL = process.env.INTERNAL_API_URL ?? 'http://backend:4000';
const BOT_SECRET = process.env.BOT_SECRET ?? '';

// proxy: false — HTTPS_PROXY/HTTP_PROXY в .env направляют трафик к внешним
// AI-провайдерам через не-RU выход; внутренний Docker-хост backend:4000
// через него недостижим, без этой опции каждый запрос здесь падал бы с 500.
const http = axios.create({ proxy: false });

// JWT живёт 15 минут (см. backend), обновляем за минуту до истечения — с запасом.
const SESSION_TOKEN_TTL_MS = 14 * 60 * 1000;

// 'think' убран — раньше это была отдельная кнопка "🧠 Про чат", по факту всегда
// жёстко выбиравшая DeepSeek. Теперь платность/глубина ответа определяется РЕАЛЬНОЙ
// выбранной моделью (session.chatModel), а не отдельным полем режима — как на сайте.
export type Mode = 'chat' | 'vision' | 'sound' | 'reel';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

// Id модели из реестра backend/src/config/models.ts — единственный источник правды.
// Дефолты ниже совпадают с DEFAULT_VIDEO_MODEL_ID/DEFAULT_IMAGE_MODEL_ID/AUTO_MODEL_ID
// там же; используются только пока GET /plans не загрузился (см. lib/api-client.ts:getModels).
export const FALLBACK_CHAT_MODEL_ID = 'auto';
export const FALLBACK_VIDEO_MODEL_ID = 'kling-v2.5';
export const FALLBACK_IMAGE_MODEL_ID = 'gemini-flash-image';

export type VideoResolution = '720p' | '1080p';
export type VideoDuration = '4s' | '8s';
export type VideoAspectRatio = '16:9' | '9:16';

export interface VideoOptions {
  videoModel: string;
  resolution: VideoResolution;
  duration: VideoDuration;
  aspectRatio: VideoAspectRatio;
  enableAudio: boolean;
  negativePrompt: string;
}

export const DEFAULT_VIDEO_OPTIONS: VideoOptions = {
  videoModel: FALLBACK_VIDEO_MODEL_ID,
  resolution: '720p',
  duration: '8s',
  aspectRatio: '16:9',
  enableAudio: false,
  negativePrompt: '',
};

export interface MusicOptions {
  title: string;
  style: string;
  instrumental: boolean;
  lyrics: string;
}

export const DEFAULT_MUSIC_OPTIONS: MusicOptions = {
  title: '',
  style: '',
  instrumental: false,
  lyrics: '',
};

// Когда пользователь нажал кнопку "ввести текстом" (negative prompt / название /
// стиль / текст песни) — следующее текстовое сообщение уходит не в AI-промпт,
// а в это поле настроек. Сбрасывается после применения.
export type AwaitingInput = 'video_negative_prompt' | 'music_title' | 'music_style' | 'music_lyrics' | null;

export interface UserSession {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number; // ms epoch, обновляем токен за минуту до этого момента
  activeChatId: string | null;
  mode: Mode;
  /** Недавняя история активного чата, синхронизирована, чтобы у /chat/stream был контекст. */
  history: ChatMsg[];
  /** Id выбранной модели чата из реестра ('auto' по умолчанию) — аналог ModelPill на сайте. */
  chatModel: string;
  /** Id выбранной модели изображений из реестра — аналог пикера в ImageWidget на сайте. */
  imageModel: string;
  videoOptions: VideoOptions;
  musicOptions: MusicOptions;
  awaitingInput: AwaitingInput;
  /** Согласие с условиями/политикой (см. /bot/accept-terms). Гейтится в bot.ts. */
  termsAccepted: boolean;
}

const sessions = new Map<number, UserSession>();

interface TgFrom {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

async function mintTokens(from: TgFrom): Promise<{ accessToken: string; refreshToken: string; termsAccepted: boolean }> {
  const res = await http.post(`${API_URL}/api/auth/telegram-bot`, {
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name,
    username: from.username,
    photo_url: undefined,
  }, { headers: { 'x-bot-secret': BOT_SECRET } });
  return { accessToken: res.data.accessToken, refreshToken: res.data.refreshToken, termsAccepted: !!res.data.termsAccepted };
}

/** Возвращает сессию с действующим (не истёкшим) access-токеном, при необходимости выпуская/обновляя его. */
export async function ensureSession(from: TgFrom): Promise<UserSession> {
  let session = sessions.get(from.id);

  if (!session) {
    const { accessToken, refreshToken, termsAccepted } = await mintTokens(from);
    session = {
      accessToken,
      refreshToken,
      tokenExpiresAt: Date.now() + SESSION_TOKEN_TTL_MS,
      activeChatId: null,
      mode: 'chat',
      history: [],
      chatModel: FALLBACK_CHAT_MODEL_ID,
      imageModel: FALLBACK_IMAGE_MODEL_ID,
      videoOptions: { ...DEFAULT_VIDEO_OPTIONS },
      musicOptions: { ...DEFAULT_MUSIC_OPTIONS },
      awaitingInput: null,
      termsAccepted,
    };
    sessions.set(from.id, session);
    return session;
  }

  if (Date.now() > session.tokenExpiresAt - 60_000) {
    try {
      const res = await http.post(`${API_URL}/api/auth/refresh`, { refreshToken: session.refreshToken });
      session.accessToken = res.data.accessToken;
      session.refreshToken = res.data.refreshToken;
      session.tokenExpiresAt = Date.now() + SESSION_TOKEN_TTL_MS;
    } catch {
      // Refresh-токен истёк/невалиден — выпускаем новую пару
      const { accessToken, refreshToken, termsAccepted } = await mintTokens(from);
      session.accessToken = accessToken;
      session.refreshToken = refreshToken;
      session.tokenExpiresAt = Date.now() + SESSION_TOKEN_TTL_MS;
      session.termsAccepted = session.termsAccepted || termsAccepted;
    }
  }

  return session;
}

