import OpenAI from 'openai';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Models available via OpenRouter
export const OR_MODELS = {
  haiku:      'anthropic/claude-haiku-4-5',
  deepseek:   'deepseek/deepseek-v3.2',
  gpt4oMini:  'openai/gpt-4o-mini',
  flux:       'black-forest-labs/flux-1.1-pro',
  fluxFill:   'black-forest-labs/flux-fill-pro',
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

// ─── Image generation (Flux via /images/generations) ──────────────────────────

export async function generateImageFlux(
  prompt: string,
  model: string = OR_MODELS.flux,
  size: string = '1024x1024'
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.FRONTEND_URL ?? 'https://ghostlineai.ru',
    'X-Title': 'GhostLine AI',
  };

  const response = await fetch(`${OPENROUTER_BASE}/images/generations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, prompt, n: 1, size }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`OpenRouter image generation failed: ${err}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ url?: string; b64_json?: string }>;
  };

  const img = data.data?.[0];
  if (img?.url) return img.url;
  if (img?.b64_json) return `data:image/png;base64,${img.b64_json}`;

  throw new Error(`No image data in OpenRouter response: ${JSON.stringify(data).slice(0, 300)}`);
}
