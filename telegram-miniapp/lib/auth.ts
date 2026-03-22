const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let accessToken: string | null = null;

export function getToken(): string | null {
  return accessToken;
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
  accessToken = data.accessToken;
  return data;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_URL}/api${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw Object.assign(new Error(err.error), { status: res.status, code: err.code });
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}
