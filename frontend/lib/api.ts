const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(error.error ?? 'Request failed'), {
      status: res.status,
      code: error.code,
    });
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const api = {
  auth: {
    me: () => request<User>('/me'),
    updateMe: (data: Partial<User>) =>
      request<User>('/me', { method: 'PATCH', body: JSON.stringify(data) }),
    transactions: (page = 1) => request<TransactionsResponse>(`/me/transactions?page=${page}`),
    refreshToken: (refreshToken: string) =>
      request<TokenPair>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }),
    telegramWebApp: (initData: string) =>
      request<AuthResponse>('/auth/telegram-webapp', {
        method: 'POST',
        body: JSON.stringify({ initData }),
      }),
    telegramVerify: (data: Record<string, string>) =>
      request<AuthResponse>('/auth/telegram/verify', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  chats: {
    list: () => request<{ chats: Chat[] }>('/chats'),
    create: (data?: { title?: string; mode?: string }) =>
      request<Chat>('/chats', { method: 'POST', body: JSON.stringify(data ?? {}) }),
    messages: (chatId: string, before?: string) =>
      request<{ messages: Message[] }>(`/chats/${chatId}/messages${before ? `?before=${before}` : ''}`),
    update: (chatId: string, data: { title?: string }) =>
      request<Chat>(`/chats/${chatId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (chatId: string) =>
      request<void>(`/chats/${chatId}`, { method: 'DELETE' }),
  },

  payments: {
    plans: () => request<PlansResponse>('/plans'),
    create: (data: { type: 'SUBSCRIPTION' | 'ADDON' | 'TOKEN_PACK'; key: string }) =>
      request<{ paymentId: string; paymentUrl: string }>('/payments/create', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    history: (page = 1) => request<PaymentsResponse>(`/payments?page=${page}`),
  },

  upload: {
    /** Upload a file for text extraction. Returns extracted text + metadata. */
    extract: async (file: File): Promise<{ text: string; fileName: string; lang: string; truncated: boolean }> => {
      const form = new FormData();
      form.append('file', file);
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch(`${API_URL}/api/upload/extract`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw Object.assign(new Error(err.error ?? 'Upload failed'), { status: res.status });
      }
      return res.json();
    },
  },

  generate: {
    vision: (data: { prompt: string; size?: string }) =>
      request<{ jobId: string }>('/generate/vision', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    sound: (data: { prompt: string; duration?: number }) =>
      request<{ jobId: string }>('/generate/sound', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    reel: (data: { prompt: string; duration?: number }) =>
      request<{ jobId: string }>('/generate/reel', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    status: (jobId: string) => request<GenerateJob>(`/generate/${jobId}`),
    list: (mode?: string, page = 1) =>
      request<{ jobs: GenerateJob[] }>(`/generate?${mode ? `mode=${mode}&` : ''}page=${page}`),
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  birthDate: string | null;
  // Per-type main balances (plan allocation)
  balanceChat:   number;
  balanceImages: number;
  balanceDocs:   number;
  balanceCode:   number;
  // Addons (never expire)
  addonChat:     number;
  addonImages:   number;
  addonDocs:     number;
  addonCode:     number;
  plan: 'FREE' | 'BASIC' | 'STANDARD' | 'PRO' | 'ULTRA' | 'TEAM';
  planExpiresAt: string | null;
  purposes: string[];
  responseStyle: string;
  onboardingDone: boolean;
  createdAt: string;
}

export interface Chat {
  id: string;
  title: string;
  mode: string;
  updatedAt: string;
  _count?: { messages: number };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode: string;
  tokensCost: number;
  cacheHit: boolean;
  mediaUrl: string | null;
  fileName?: string | null; // for optimistic display of attached file name
  createdAt: string;
}

export interface GenerateJob {
  id: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  mode: string;
  prompt: string;
  mediaUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TokenTransaction {
  id: string;
  amount: number;
  type: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  user: User;
  isNew: boolean;
}

export interface TransactionsResponse {
  transactions: TokenTransaction[];
  total: number;
  page: number;
}

export interface PaymentsResponse {
  payments: unknown[];
  total: number;
  page: number;
}

export interface PlanInfo {
  price: number;
  label: string;
  balances: { chat: number; images: number; docs: number; code: number };
}
export interface AddonInfo {
  price: number;
  label: string;
  type: 'chat' | 'images' | 'docs' | 'code';
  amount: number;
}
export interface PlansResponse {
  plans:  Record<string, PlanInfo>;
  addons: Record<string, AddonInfo>;
}
