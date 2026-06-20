import OpenAI from 'openai';
import { HttpsProxyAgent } from 'https-proxy-agent';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// ─── Outbound proxy ─────────────────────────────────────────────────────────────
// The OpenAI SDK uses node-fetch in Node, which IGNORES undici's global dispatcher
// (the proxy set in lib/proxy.ts). So OpenRouter calls would otherwise leave from
// our real IP and get geo/abuse-blocked. We must pass an http.Agent-compatible
// proxy agent explicitly via `httpAgent`. Built once and reused for keep-alive.
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

// Models available via OpenRouter
export const OR_MODELS = {
  haiku:      'google/gemini-2.5-flash',
  deepseek:   'deepseek/deepseek-v3.2',
  gpt4oMini:  'openai/gpt-4o-mini',
  sonar:      'perplexity/sonar',          // web-search model, PRO/ULTRA only
  llama:      'meta-llama/llama-3.1-8b-instruct', // Cloudflare fallback
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

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── One-shot JSON call (for dispatcher fallback) ─────────────────────────────

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

// ─── Text streaming ────────────────────────────────────────────────────────────

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
      // Try next model in chain
    }
  }
}

// ─── Image generation (Flux via chat completions) ─────────────────────────────
// OpenRouter exposes image models through /chat/completions.
// The image URL is returned in choices[0].message.content.

export async function generateImageFlux(
  prompt: string,
  model: string = OR_MODELS.flux,
  sourceImageUrl?: string      // if provided — image editing mode
): Promise<string> {
  // Build user message: editing = [image, text], generation = [text]
  const userContent = sourceImageUrl
    ? [
        { type: 'image_url', image_url: { url: sourceImageUrl, detail: 'high' } },
        { type: 'text', text: `Edit this image: ${prompt}` },
      ]
    : `Generate an image. Visual scene description: ${prompt}`;

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
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
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`OpenRouter image generation failed: ${err}`);
  }

  const data = (await response.json()) as any;

  const msg = data?.choices?.[0]?.message;

  // Format 1: message.images[] — OpenRouter image generation models (seedream, flux.2, etc.)
  const images = msg?.images;
  if (Array.isArray(images) && images.length > 0) {
    const img = images[0];
    if (img?.image_url?.url) return img.image_url.url;
    if (img?.url) return img.url;
  }

  // Format 2: data[].url (OpenAI DALL-E style)
  const imgData = data?.data?.[0];
  if (imgData?.url) return imgData.url;
  if (imgData?.b64_json) return `data:image/png;base64,${imgData.b64_json}`;

  // Format 3: content as array of parts
  const content = msg?.content;
  if (Array.isArray(content)) {
    for (const p of content) {
      if (p?.type === 'image_url' && p.image_url?.url) return p.image_url.url;
      if (p?.type === 'image' && p.image_url?.url) return p.image_url.url;
      if (p?.type === 'image' && p.url) return p.url;
    }
  }

  // Format 4: content as string URL or data-URI
  if (typeof content === 'string' && content.trim()) {
    const t = content.trim();
    if (t.startsWith('http') || t.startsWith('data:')) return t;
    const m = t.match(/https?:\/\/\S+/);
    if (m) return m[0];
  }

  console.error('[generateImageFlux] Unknown response:\n', JSON.stringify(data, null, 2).slice(0, 2000));
  throw new Error(`No image data in OpenRouter response: ${JSON.stringify(data).slice(0, 300)}`);
}
