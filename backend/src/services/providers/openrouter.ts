import OpenAI from 'openai';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Models available via OpenRouter
export const OR_MODELS = {
  haiku:      'google/gemini-2.5-flash',
  deepseek:   'deepseek/deepseek-v3.2',
  gpt4oMini:  'openai/gpt-4o-mini',
  sonar:      'perplexity/sonar',          // web-search model, PRO/ULTRA only
  flux:       'google/gemini-3.1-flash-image-preview',
  fluxFill:   'black-forest-labs/flux.2-pro',
} as const;

function getClient() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    baseURL: OPENROUTER_BASE,
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
