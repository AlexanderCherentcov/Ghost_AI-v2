import axios from 'axios';

const API_URL = process.env.INTERNAL_API_URL ?? 'http://backend:4000';
const BOT_SECRET = process.env.BOT_SECRET ?? '';

// proxy: false — HTTPS_PROXY/HTTP_PROXY in .env route external AI-provider
// traffic through a non-RU exit; the internal backend:4000 Docker hostname
// isn't reachable through it and every call here would otherwise 500.
const http = axios.create({ proxy: false });

export type Mode = 'chat' | 'think' | 'vision' | 'sound' | 'reel';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export interface UserSession {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number; // ms epoch, refresh a minute before this
  activeChatId: string | null;
  mode: Mode;
  /** Recent history for the active chat, kept in sync so /chat/stream has context. */
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

/** Returns a session with a valid (non-expired) access token, minting/refreshing as needed. */
export async function ensureSession(from: TgFrom): Promise<UserSession> {
  let session = sessions.get(from.id);

  if (!session) {
    const { accessToken, refreshToken } = await mintTokens(from);
    session = {
      accessToken,
      refreshToken,
      tokenExpiresAt: Date.now() + 14 * 60 * 1000,
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
      session.tokenExpiresAt = Date.now() + 14 * 60 * 1000;
    } catch {
      // Refresh token expired/invalid — mint a fresh pair
      const { accessToken, refreshToken } = await mintTokens(from);
      session.accessToken = accessToken;
      session.refreshToken = refreshToken;
      session.tokenExpiresAt = Date.now() + 14 * 60 * 1000;
    }
  }

  return session;
}

