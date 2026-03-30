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
    create: (data: { plan: string; billing?: 'monthly' | 'yearly' }) =>
      request<{ paymentId: string; paymentUrl: string }>('/payments/create', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    history: (page = 1) => request<PaymentsResponse>(`/payments?page=${page}`),
    status: (yokassaId: string) =>
      request<{ status: string; plan: string | null }>(
        `/payments/status/${yokassaId}`
      ),
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

  support: {
    send: (data: { message: string; email?: string }) =>
      request<{ ok: boolean }>('/support/message', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  generate: {
    vision: (data: { prompt: string; size?: string; chatId?: string; sourceImageUrl?: string }) =>
      request<{ jobId: string }>('/generate/vision', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    sound: (data: { prompt: string; duration?: number }) =>
      request<{ jobId: string }>('/generate/sound', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    reel: (data: { prompt: string; videoDuration?: 5 | 10; videoAspectRatio?: '16:9' | '9:16' | '1:1'; videoEnableAudio?: boolean; videoImageUrl?: string; cameraPreset?: string; negativePrompt?: string; cfgScale?: number }) =>
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
  plan: 'FREE' | 'BASIC' | 'STANDARD' | 'PRO' | 'ULTRA' | 'TEAM';
  planExpiresAt: string | null;
  billing: 'MONTHLY' | 'YEARLY';
  // Daily counters
  std_messages_today:       number;
  pro_messages_today:       number;
  images_today:             number;
  videos_today:             number;
  files_used:               number;
  // Limits (-1 = unlimited)
  std_messages_daily_limit: number;
  pro_messages_daily_limit: number;
  images_daily_limit:       number;
  videos_daily_limit:       number;
  files_monthly_limit:      number;
  day_start:    string;
  period_start: string;
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

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  user: User;
  isNew: boolean;
}

export interface PaymentsResponse {
  payments: unknown[];
  total: number;
  page: number;
}

export interface PlanInfo {
  price: number;
  price_yearly: number;
  label: string;
  show_message_limit: boolean;
  std_messages_daily: number;
  pro_messages_daily: number;
  images_daily: number;
  videos_daily: number;
  files_monthly: number;
}
export interface PlansResponse {
  plans: Record<string, PlanInfo>;
}
