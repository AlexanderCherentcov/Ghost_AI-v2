import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// ─── Исходящий прокси ───────────────────────────────────────────────────────────
// OpenAI SDK использует node-fetch в Node, который ИГНОРИРУЕТ глобальный диспетчер
// undici (прокси, настроенный в lib/proxy.ts). Поэтому без явной настройки запросы
// к OpenRouter уходили бы с нашего настоящего IP и попадали под гео/abuse-блокировку.
// Приходится явно передавать http.Agent-совместимый прокси-агент через `httpAgent`.
// Создаётся один раз и переиспользуется для keep-alive.
let proxyAgent: HttpsProxyAgent<string> | null | undefined;
function getProxyAgent(): HttpsProxyAgent<string> | undefined {
  if (proxyAgent !== undefined) return proxyAgent ?? undefined;
  const url = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  if (url && !url.startsWith('socks')) {
    proxyAgent = new HttpsProxyAgent(url);
    const masked = url.replace(/:[^:@]*@/, ':***@');
    console.log(`[OpenRouter] Routing via proxy → ${masked}`);
  } else {
    if (url?.startsWith('socks')) {
      console.warn('[OpenRouter] SOCKS proxy not supported — set an http:// proxy. Calls will go DIRECT.');
    } else {
      console.warn('[OpenRouter] No HTTPS_PROXY set — OpenRouter calls go DIRECT (risk of block).');
    }
    proxyAgent = null;
  }
  return proxyAgent ?? undefined;
}

// Модели, доступные через OpenRouter
export const OR_MODELS = {
  haiku:      'google/gemini-2.5-flash',
  deepseek:   'deepseek/deepseek-v3.2',
  gpt4oMini:  'openai/gpt-4o-mini',
  sonar:      'perplexity/sonar',          // модель веб-поиска, только PRO/ULTRA
  llama:      'meta-llama/llama-3.1-8b-instruct', // резерв для Cloudflare
  flux:       'google/gemini-3.1-flash-image-preview',
  fluxFill:   'black-forest-labs/flux.2-pro',
} as const;

function getClient() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    baseURL: OPENROUTER_BASE,
    httpAgent: getProxyAgent(),
    defaultHeaders: {
      'HTTP-Referer': process.env.FRONTEND_URL ?? 'https://ghostline.ai',
      'X-Title': 'GhostLine AI',
    },
  });
}

// ─── Типы ──────────────────────────────────────────────────────────────────────

export type MessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }
    >;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: MessageContent;
}

// ─── Разовый JSON-вызов (резерв для диспетчера) ────────────────────────────────

export async function callOpenRouterJSON(
  messages: ChatMessage[],
  model: string,
  maxTokens = 512,
): Promise<string> {
  const client = getClient();
  const resp = await client.chat.completions.create({
    model,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
    stream: false,
    max_tokens: maxTokens,
  });
  return resp.choices[0]?.message?.content ?? '';
}

// ─── Стриминг текста ────────────────────────────────────────────────────────────

export async function* streamOpenRouter(
  messages: ChatMessage[],
  model: string,
  maxTokens?: number,
  fallbackModels?: string[]
): AsyncGenerator<{ type: 'token'; data: string } | { type: 'used_model'; model: string }> {
  const client = getClient();

  async function* tryStream(m: string) {
    const stream = await client.chat.completions.create({
      model: m,
      messages: messages as OpenAI.ChatCompletionMessageParam[],
      stream: true,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield { type: 'token' as const, data: text };
    }
  }

  const chain = [model, ...(fallbackModels ?? [])];
  let usedModel = model;

  for (let i = 0; i < chain.length; i++) {
    try {
      usedModel = chain[i];
      yield* tryStream(chain[i]);
      yield { type: 'used_model' as const, model: usedModel };
      return;
    } catch (err) {
      if (i === chain.length - 1) throw err;
      // Пробуем следующую модель в цепочке
    }
  }
}

// ─── Генерация изображений (Flux через chat completions) ──────────────────────
// OpenRouter отдаёт image-модели через /chat/completions.
// URL изображения возвращается в choices[0].message.content.

export async function generateImageFlux(
  prompt: string,
  model: string = OR_MODELS.flux,
  sourceImageUrl?: string,      // если передан — режим редактирования изображения
  aspectRatio?: string,
): Promise<string> {
  // Собираем сообщение пользователя: редактирование = [изображение, текст], генерация = [текст]
  const userContent = sourceImageUrl
    ? [
        { type: 'image_url', image_url: { url: sourceImageUrl, detail: 'high' } },
        { type: 'text', text: `Edit this image: ${prompt}` },
      ]
    : `Generate an image. Visual scene description: ${prompt}`;

  // image_config.aspect_ratio подтверждён в доках OpenRouter только для Gemini-семейства
  // (google/*-image модели) — у остальных провайдеров (OpenAI/ByteDance/Qwen) этот путь
  // не проверен, поэтому не отправляем его им вслепую: absent-параметр безопаснее, чем
  // непроверенный запрос, который может тихо сломать генерацию.
  const supportsAspectRatio = model.startsWith('google/');

  // Таймаут на fetch — без него зависший апстрим держит промис вечно нерешённым:
  // BullMQ-воркер не получает ни успеха, ни исключения, GenerateJob навсегда
  // остаётся 'processing', а activeJob-guard в routes/generate.ts блокирует
  // пользователя от новых попыток безо всякого предела по времени.
  //
  // 600с (10 мин), НЕ 120с — живое подтверждение по логам OpenRouter для
  // openai/gpt-5-image: реальная УСПЕШНАЯ генерация заняла generation_time
  // 372004мс (6.2 мин), не зависание. 120с убивал бы эту же генерацию на
  // 2-й минуте, ничего не дожидаясь — то есть создавал бы новую версию той
  // же проблемы вместо решения старой. Для быстрых моделей (Flux/Gemini,
  // обычно секунды) этот таймаут никогда не достигается — цена перестраховки
  // только для медленных моделей типа gpt-image.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600_000);

  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL ?? 'https://ghostlineai.ru',
        'X-Title': 'GhostLine AI',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: userContent }],
        modalities: ['image'],
        ...(aspectRatio && supportsAspectRatio ? { image_config: { aspect_ratio: aspectRatio } } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('OpenRouter image generation: timeout (120s)');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`OpenRouter image generation failed: ${err}`);
  }

  const data = (await response.json()) as any;

  const msg = data?.choices?.[0]?.message;

  // Формат 1: message.images[] — модели генерации изображений OpenRouter (seedream, flux.2 и т.д.)
  const images = msg?.images;
  if (Array.isArray(images) && images.length > 0) {
    const img = images[0];
    if (img?.image_url?.url) return img.image_url.url;
    if (img?.url) return img.url;
  }

  // Формат 2: data[].url (в стиле OpenAI DALL-E)
  const imgData = data?.data?.[0];
  if (imgData?.url) return imgData.url;
  if (imgData?.b64_json) return `data:image/png;base64,${imgData.b64_json}`;

  // Формат 3: content как массив частей
  const content = msg?.content;
  if (Array.isArray(content)) {
    for (const p of content) {
      if (p?.type === 'image_url' && p.image_url?.url) return p.image_url.url;
      if (p?.type === 'image' && p.image_url?.url) return p.image_url.url;
      if (p?.type === 'image' && p.url) return p.url;
    }
  }

  // Формат 4: content как строка URL или data-URI
  if (typeof content === 'string' && content.trim()) {
    const t = content.trim();
    if (t.startsWith('http') || t.startsWith('data:')) return t;
    const m = t.match(/https?:\/\/\S+/);
    if (m) return m[0];
  }

  console.error('[generateImageFlux] Unknown response:\n', JSON.stringify(data, null, 2).slice(0, 2000));
  throw new Error(`No image data in OpenRouter response: ${JSON.stringify(data).slice(0, 300)}`);
}

// ─── Голос: распознавание и синтез речи (gpt-audio-mini через chat completions) ──
// ⚠️ Формат запроса/ответа собран по документированному API OpenAI для
// audio-модальности (modalities:['text','audio'], input_audio/audio в content,
// message.audio.data в ответе) — НЕ проверен живым вызовом (нет доступа к
// реальному ключу в момент написания). Если формат отличается, упадёт с понятной
// ошибкой в voice.worker.ts, а не тихо вернёт мусор — но перед продакшном
// нужен один реальный тестовый вызов.

export const VOICE_MODEL = 'openai/gpt-audio-mini';

function base64FromDataUri(dataUriOrUrl: string): { base64: string; format: string } | null {
  const m = dataUriOrUrl.match(/^data:audio\/(\w+);base64,(.+)$/);
  if (!m) return null;
  return { format: m[1] === 'mpeg' ? 'mp3' : m[1], base64: m[2] };
}

/** Распознаёт речь из аудио (URL нашего сервера или data URI) и возвращает текст. */
export async function transcribeAudio(audioUrl: string): Promise<string> {
  let base64: string;
  let format: string;
  const dataUri = base64FromDataUri(audioUrl);
  if (dataUri) {
    ({ base64, format } = dataUri);
  } else {
    const res = await fetch(audioUrl);
    if (!res.ok) throw new Error(`[transcribeAudio] Failed to fetch audio: ${res.status}`);
    const contentType = res.headers.get('content-type') ?? 'audio/mpeg';
    format = contentType.includes('wav') ? 'wav' : contentType.includes('ogg') ? 'ogg' : 'mp3';
    base64 = Buffer.from(await res.arrayBuffer()).toString('base64');
  }

  const client = getClient();
  const resp = await client.chat.completions.create({
    model: VOICE_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Transcribe exactly what is said in this audio. Reply with ONLY the transcript text, no commentary, no quotes.' },
          { type: 'input_audio', input_audio: { data: base64, format } } as any,
        ],
      },
    ] as OpenAI.ChatCompletionMessageParam[],
  });

  const text = resp.choices[0]?.message?.content;
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('[transcribeAudio] Empty transcript from model');
  }
  return text.trim();
}

/** Озвучивает текст и возвращает аудио как data URI (mp3, base64). */
export async function synthesizeSpeech(text: string): Promise<string> {
  const client = getClient();
  const resp = await client.chat.completions.create({
    model: VOICE_MODEL,
    modalities: ['text', 'audio'] as any,
    audio: { voice: 'alloy', format: 'mp3' } as any,
    messages: [
      { role: 'system', content: 'Read the following text aloud naturally, exactly as written. Do not add anything.' },
      { role: 'user', content: text },
    ] as OpenAI.ChatCompletionMessageParam[],
  });

  const audioData = (resp.choices[0]?.message as any)?.audio?.data;
  if (!audioData || typeof audioData !== 'string') {
    throw new Error('[synthesizeSpeech] No audio in model response');
  }
  return `data:audio/mp3;base64,${audioData}`;
}
