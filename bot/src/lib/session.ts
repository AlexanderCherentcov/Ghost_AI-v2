import axios from 'axios';

const API_URL = process.env.INTERNAL_API_URL ?? 'http://backend:4000';
const BOT_SECRET = process.env.BOT_SECRET ?? '';

// proxy: false — HTTPS_PROXY/HTTP_PROXY в .env направляют трафик к внешним
// AI-провайдерам через не-RU выход; внутренний Docker-хост backend:4000
// через него недостижим, без этой опции каждый запрос здесь падал бы с 500.
const http = axios.create({ proxy: false });

// JWT живёт 15 минут (см. backend), обновляем за минуту до истечения — с запасом.
const SESSION_TOKEN_TTL_MS = 14 * 60 * 1000;

export type Mode = 'chat' | 'think' | 'vision' | 'sound' | 'reel';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export interface UserSession {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number; // ms epoch, обновляем токен за минуту до этого момента
  activeChatId: string | null;
  mode: Mode;
  /** Недавняя история активного чата, синхронизирована, чтобы у /chat/stream был контекст. */
  history: ChatMsg[];
}

const sessions = new Map<number, UserSession>();

interface TgFrom {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

async function mintTokens(from: TgFrom): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await http.post(`${API_URL}/api/auth/telegram-bot`, {
    id: from.id,
    first_name: from.first_name,
    last_name: from.last_name,
    username: from.username,
    photo_url: undefined,
  }, { headers: { 'x-bot-secret': BOT_SECRET } });
  return { accessToken: res.data.accessToken, refreshToken: res.data.refreshToken };
}

/** Возвращает сессию с действующим (не истёкшим) access-токеном, при необходимости выпуская/обновляя его. */
export async function ensureSession(from: TgFrom): Promise<UserSession> {
  let session = sessions.get(from.id);

  if (!session) {
    const { accessToken, refreshToken } = await mintTokens(from);
    session = {
      accessToken,
      refreshToken,
      tokenExpiresAt: Date.now() + SESSION_TOKEN_TTL_MS,
      activeChatId: null,
      mode: 'chat',
      history: [],
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
      const { accessToken, refreshToken } = await mintTokens(from);
      session.accessToken = accessToken;
      session.refreshToken = refreshToken;
      session.tokenExpiresAt = Date.now() + SESSION_TOKEN_TTL_MS;
    }
  }

  return session;
}

