const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'tg_access_token';

let _accessToken: string | null = null;
let _initData: string | null = null; // cached for auto re-auth on token expiry

function loadToken(): string | null {
  if (_accessToken) return _accessToken;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

function saveToken(token: string) {
  _accessToken = token;
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

export function getToken(): string | null {
  return loadToken();
}

/** Cache Telegram initData so apiRequest can silently re-auth on 401 */
export function setInitData(data: string) {
  _initData = data;
}

export async function initAuth(initData: string): Promise<{
  accessToken: string;
  user: {
    id: string;
    name: string | null;
    tokenBalance: number;
    plan: string;
    onboardingDone: boolean;
  };
  isNew: boolean;
}> {
  const res = await fetch(`${API_URL}/api/auth/telegram-webapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });

  if (!res.ok) throw new Error('Auth failed');

  const data = await res.json();
  saveToken(data.accessToken);
  return data;
}

async function fetchWithAuth<T>(path: string, options: RequestInit): Promise<T> {
  const token = loadToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/api${path}`, { ...options, headers });
  if (res.status === 204) return undefined as unknown as T;

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw Object.assign(new Error(err.error ?? 'Request failed'), { status: res.status, code: err.code });
  }

  return res.json();
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return await fetchWithAuth<T>(path, options);
  } catch (err: any) {
    // JWT expired — silently re-authenticate with cached Telegram initData and retry once
    if (err?.status === 401 && _initData) {
      try {
        await initAuth(_initData);
        return await fetchWithAuth<T>(path, options); // retry with new token
      } catch {
        throw err; // re-auth failed — bubble original 401
      }
    }
    throw err;
  }
}
