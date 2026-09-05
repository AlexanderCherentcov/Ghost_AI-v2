const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let accessToken: string | null = null;
let refreshTokenValue: string | null = null;
// auth.store.ts подписывается сюда, чтобы после тихого обновления токена (см. request()
// ниже) новая пара тоже осела в persisted Zustand-сторе — иначе после reload юзер снова
// получит протухший refreshToken из localStorage. Регистрация через колбэк, а не прямой
// импорт стора — auth.store.ts уже импортирует этот модуль, обратный импорт дал бы цикл.
let onTokensRefreshed: ((accessToken: string, refreshToken: string) => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setRefreshToken(token: string | null) {
  refreshTokenValue = token;
}

export function getRefreshToken(): string | null {
  return refreshTokenValue;
}

export function registerTokenRefreshHandler(fn: (accessToken: string, refreshToken: string) => void) {
  onTokensRefreshed = fn;
}

// accessToken живёт всего 15 минут (backend/src/routes/auth.ts) — без этого пользователя,
// оставившего вкладку открытой активно печатать дольше 15 минут, начинают сыпаться 401 на
// каждый запрос без единого способа восстановиться, кроме ручного перелогина. Общий promise
// не даёт параллельным запросам, поймавшим 401 одновременно, устроить N обращений к /auth/refresh.
let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  const rt = refreshTokenValue;
  if (!rt) throw new Error('No refresh token');
  refreshPromise = (async () => {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Refresh failed');
    const tokens = await res.json() as { accessToken: string; refreshToken: string };
    accessToken = tokens.accessToken;
    refreshTokenValue = tokens.refreshToken;
    onTokensRefreshed?.(tokens.accessToken, tokens.refreshToken);
  })();
  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  _isRetry = false
): Promise<T> {
  const hasBody = options.body != null;
  const headers: Record<string, string> = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  // [H-16] Прерываем запрос через 30 секунд, чтобы не зависал
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      ...options,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Запрос превысил время ожидания');
    // [M-23] Один повтор при сетевой ошибке для GET-запросов
    const isGet = !options.method || options.method === 'GET';
    if (isGet && !_isRetry) {
      await new Promise(r => setTimeout(r, 1000));
      return request<T>(path, options, true);
    }
    throw err;
  }

  // Протухший access-токен — тихо обновляем и повторяем запрос один раз. /auth/refresh
  // и /auth/me не трогаем: первый сам не может истечь по 401-логике (это сам обмен
  // токена), второй участвует в начальном /auth/refresh→/me и не должен плодить
  // рекурсию, если протух и refresh-токен тоже — тогда просто выйдет обычная 401-ошибка.
  if (res.status === 401 && !_isRetry && path !== '/auth/refresh' && refreshTokenValue) {
    try {
      await refreshAccessToken();
      return request<T>(path, options, true);
    } catch {
      // Refresh-токен тоже мёртв — сбрасываем сессию, дальше отработает обычная 401 ниже
      accessToken = null;
      refreshTokenValue = null;
    }
  }

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

// ─── Авторизация ────────────────────────────────────────────────────────────
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
    autoTitle: (chatId: string, prompt: string) =>
      request<{ title: string }>(`/chats/${chatId}/auto-title`, { method: 'POST', body: JSON.stringify({ prompt }) }),
  },

  payments: {
    plans: () => request<PlansResponse>('/plans'),
    create: (data: { plan: string; billing?: 'monthly' | 'yearly'; promoCode?: string }) =>
      request<{ paymentId: string; paymentUrl: string; discountPercent: number }>('/payments/create', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    createCaspers: (data: { amount: number }) =>
      request<{ paymentId: string; paymentUrl: string; totalPrice: number }>('/payments/caspers/create', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    history: (page = 1) => request<PaymentsResponse>(`/payments?page=${page}`),
    casperHistory: (page = 1) => request<CasperHistoryResponse>(`/payments/caspers/history?page=${page}`),
    status: (yokassaId: string) =>
      request<{ status: string; plan: string | null }>(
        `/payments/status/${yokassaId}`
      ),
  },

  promo: {
    /** Активировать промокод типа CASPERS — начисляет Caspers сразу. */
    redeem: (code: string) =>
      request<{ ok: true; casperAmount: number }>('/promo/redeem', {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    /** Предпросмотр промокода типа DISCOUNT_PERCENT для тарифа перед оплатой — без побочных эффектов. */
    preview: (code: string, plan: string) =>
      request<{ ok: true; discountPercent: number; code: string }>('/promo/preview', {
        method: 'POST',
        body: JSON.stringify({ code, plan }),
      }),
  },

  upload: {
    /** Загрузить изображение. Возвращает публичный URL для использования в image-to-video. */
    image: async (file: File): Promise<{ url: string; fileName: string }> => {
      const form = new FormData();
      form.append('file', file);
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch(`${API_URL}/api/upload/image`, {
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
    /** Загрузить файл для извлечения текста. Возвращает текст и метаданные. */
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

  dispatch: (prompt: string, context?: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    request<{ category: 'chat' | 'music' | 'video' | 'image' | 'search'; autoFill: Record<string, unknown> }>('/dispatch', {
      method: 'POST',
      body: JSON.stringify({ prompt, context }),
    }),

  support: {
    send: (data: { message: string; email?: string }) =>
      request<{ ok: boolean }>('/support/message', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  generate: {
    vision: (data: { prompt: string; chatId?: string; sourceImageUrl?: string; model?: string; imageAspectRatio?: string }) =>
      request<{ jobId: string }>('/generate/vision', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    sound: (data: { prompt: string; chatId?: string; musicMode?: 'short' | 'long' | 'quality' | 'suno'; musicDuration?: number; lyrics?: string; styleAudio?: string; sunoStyle?: string; sunoTitle?: string; sunoInstrumental?: boolean }) =>
      request<{ jobId: string }>('/generate/sound', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    // id модели из реестра (backend/src/config/models.ts), напр. 'kling-v2.5' / 'veo-3.1-pro' / 'sora-2'.
    reel: (data: { prompt: string; chatId?: string; model?: string; videoDuration?: '4s' | '8s'; videoAspectRatio?: string; videoEnableAudio?: boolean; videoResolution?: string; videoImageUrl?: string; negativePrompt?: string; videoCameraPreset?: string }) =>
      request<{ jobId: string }>('/generate/reel', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    lyrics: (data: { topic: string; style?: string; instrumental?: boolean }) =>
      request<{ lyrics: string }>('/generate/lyrics', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    status: (jobId: string) => request<GenerateJob>(`/generate/${jobId}`),
    list: (mode?: string, page = 1) =>
      request<{ jobs: GenerateJob[] }>(`/generate?${mode ? `mode=${mode}&` : ''}page=${page}`),
  },

  gallery: {
    share: (data: { jobId: string }) =>
      request<{ id: string; status: string }>('/gallery/share', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    // Публичный список — request() сам не шлёт Authorization без токена, гостю доступен так же.
    list: (params: { sort?: 'top' | 'new'; page?: number; limit?: number; domain?: 'image' | 'video' } = {}) => {
      const query = new URLSearchParams();
      if (params.sort) query.set('sort', params.sort);
      if (params.page) query.set('page', String(params.page));
      if (params.limit) query.set('limit', String(params.limit));
      if (params.domain) query.set('domain', params.domain);
      const qs = query.toString();
      return request<GalleryResponse>(`/gallery${qs ? `?${qs}` : ''}`);
    },
    like: (id: string) =>
      request<{ liked: boolean; likesCount: number }>(`/gallery/${id}/like`, { method: 'POST' }),
    // Витрина для главной — топ по лайкам, добор случайными если лайкнутых меньше limit.
    featured: (limit = 10) =>
      request<{ items: GalleryItem[] }>(`/gallery/featured?limit=${limit}`),
  },
};

// ─── Типы ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  birthDate: string | null;
  plan: 'FREE' | 'START' | 'BASIC' | 'PRO' | 'PRO_PLUS' | 'VIP' | 'ULTRA';
  planExpiresAt: string | null;
  billing: 'MONTHLY' | 'YEARLY';
  // Caspers
  caspers_balance:    number;
  caspers_monthly:    number;
  // Дневные счётчики
  std_messages_today: number;
  pro_messages_today: number;
  // Недельные/месячные счётчики FREE-тарифа
  images_this_week:   number;
  music_this_week:    number;
  videos_this_month:  number;
  // Метки начала периодов
  day_start:    string;
  week_start:   string;
  period_start: string;
  // Профиль
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
  fileName?: string | null; // для оптимистичного отображения имени прикреплённого файла
  // Id модели из реестра (backend/src/config/models.ts), которая реально ответила —
  // для аватар-анимации конкретной модели (см. MessageAvatar/modelParticleShape).
  provider?: string | null;
  createdAt: string;
  // На Message в БД такого поля нет — GET /chats/:id/messages подставляет его сам,
  // join-ом GenerateJob по mediaUrl (см. routes/chat.ts), поэтому работает и для
  // сообщений из истории, не только для только что сгенерированных в этой сессии.
  jobId?: string;
}

export interface GalleryItem {
  id: string;
  domain: string; // 'image' | 'video'
  modelId: string;
  modelLabel: string;
  prompt: string;
  mediaUrl: string;
  likesCount: number;
  likedByMe: boolean;
  authorName: string;
  createdAt: string;
}

export interface GalleryResponse {
  items: GalleryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface GenerateJob {
  id: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  mode: string;
  prompt: string;
  mediaUrl: string | null;
  // Id модели из реестра, которой сделана работа (vision/reel — у sound null).
  // Нужно для MessageAvatar сразу после генерации, до перезагрузки истории.
  modelId?: string | null;
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

export interface CasperTransaction {
  id: string;
  amount: number; // положительное = начисление, отрицательное = списание
  reason: string; // id модели из реестра ('gemini-2.5-flash' и т.п.) либо системный код ('topup', 'welcome_bonus', 'refund_<reason>' и т.п.)
  createdAt: string;
}

export interface CasperHistoryResponse {
  transactions: CasperTransaction[];
  total: number;
  page: number;
  limit: number;
}

export interface PlanInfo {
  key: string;
  label: string;
  description: string;
  price: number;
  price_yearly: number;
  caspers_monthly: number;
  badge: string | null;
  popular: boolean;
  features: string[];
}
export interface FreeLimits {
  images_weekly: number;
  music_weekly: number;
  videos_monthly: number;
  chat_daily: number;
}
export interface CasperPriceTier {
  max: number;
  price: number;
}

export interface ModelCapabilities {
  vision?: boolean;
  search?: boolean;
  edit?: boolean;
  imageToVideo?: boolean;
  audio?: boolean;
  /** Модель работает только по фото (Framepack) — чистого text-to-video у неё нет. */
  imageRequired?: boolean;
  /** Генерация заметно дольше обычной (сейчас только Framepack) — показать предупреждение в UI. */
  slowGeneration?: boolean;
}
export interface ChatModelOption {
  id: string;
  label: string;
  blurb?: string;
  cost: number;
  minPlan: string;
  capabilities: ModelCapabilities;
}
export interface ImageModelUiParams {
  aspectRatios: string[];
}
export interface VideoModelUiParams {
  durationLabels: { '4s': string; '8s': string } | null;
  aspectRatios: string[];
  resolutions: string[];
  supportsNegativePrompt: boolean;
  cameraPresets: string[];
}
export interface ImageModelOption {
  id: string;
  label: string;
  blurb?: string;
  cost: number;
  minPlan: string;
  capabilities: ModelCapabilities;
  /** Единый источник реальных настраиваемых параметров — см. backend/src/config/models.ts. */
  ui?: ImageModelUiParams;
  previewImageUrl?: string;
}
export interface VideoModelOption {
  id: string;
  label: string;
  blurb?: string;
  minPlan: string;
  capabilities: ModelCapabilities;
  cost: { '4s': number; '8s': number };
  /** Во сколько раз дороже с включённым звуком — см. комментарий у VideoModelSpec.audioCostMultiplier в бэкенде. Отсутствует/1 — звук цену не меняет. */
  audioCostMultiplier?: number;
  /** Единый источник реальных настраиваемых параметров — см. backend/src/config/models.ts. */
  ui: VideoModelUiParams;
  previewVideoUrl?: string;
}

export interface PlansResponse {
  plans: PlanInfo[];
  free: PlanInfo & { limits: FreeLimits; welcome_caspers: number };
  casper_costs: Record<string, number>;
  casper_price_tiers: CasperPriceTier[];
  models: {
    chat: ChatModelOption[];
    image: ImageModelOption[];
    video: VideoModelOption[];
  };
}
