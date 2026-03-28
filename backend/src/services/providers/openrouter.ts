import OpenAI from 'openai';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Models available via OpenRouter
export const OR_MODELS = {
  haiku:      'anthropic/claude-haiku-4-5',
  deepseek:   'deepseek/deepseek-v3.2',
  gpt4oMini:  'openai/gpt-4o-mini',
  flux:       'bytedance-seed/seedream-4.5',
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
  fallbackModel?: string
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

  let usedModel = model;
  try {
    yield* tryStream(model);
  } catch (err) {
    if (!fallbackModel) throw err;
    usedModel = fallbackModel;
    yield* tryStream(fallbackModel);
  }
  yield { type: 'used_model' as const, model: usedModel };
}

// ─── Image generation (Flux via chat completions) ─────────────────────────────
// OpenRouter exposes image models through /chat/completions.
// The image URL is returned in choices[0].message.content.

export async function generateImageFlux(
  prompt: string,
  model: string = OR_MODELS.flux
): Promise<string> {
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
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`OpenRouter image generation failed: ${err}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type: string; image_url?: { url: string }; url?: string }>;
      };
    }>;
    data?: Array<{ url?: string; b64_json?: string }>;
  };

  // Format 1: data[].url (OpenAI-images style)
  const imgData = data.data?.[0];
  if (imgData?.url) return imgData.url;
  if (imgData?.b64_json) return `data:image/png;base64,${imgData.b64_json}`;

  const content = data.choices?.[0]?.message?.content;

  // Format 2: content as array of parts
  if (Array.isArray(content)) {
    for (const part of content) {
      const p = part as any;
      if (p.type === 'image_url' && p.image_url?.url) return p.image_url.url;
      if (p.type === 'image' && p.url) return p.url;
      if (p.type === 'image' && p.image_url?.url) return p.image_url.url;
      if (p.type === 'image' && p.source?.url) return p.source.url;
    }
  }

  // Format 3: content as string (URL, data-URI, or markdown image)
  if (typeof content === 'string' && content.trim()) {
    const trimmed = content.trim();
    if (trimmed.startsWith('http') || trimmed.startsWith('data:') || trimmed.startsWith('//')) return trimmed;
    const urlMatch = trimmed.match(/https?:\/\/\S+/);
    if (urlMatch) return urlMatch[0];
    const mdMatch = trimmed.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (mdMatch) return mdMatch[1];
    // If looks like base64
    if (trimmed.length > 100 && /^[A-Za-z0-9+/=]+$/.test(trimmed.slice(0, 20))) {
      return `data:image/png;base64,${trimmed}`;
    }
  }

  console.error('[generateImageFlux] Unrecognized response:', JSON.stringify(data).slice(0, 1000));
  throw new Error(`No image data in OpenRouter response: ${JSON.stringify(data).slice(0, 500)}`);
}
