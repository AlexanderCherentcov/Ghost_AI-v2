import OpenAI from 'openai';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Models available via OpenRouter
export const OR_MODELS = {
  haiku:    'anthropic/claude-haiku-4-5',
  sonnet:   'anthropic/claude-sonnet-4-6',
  flux:     'black-forest-labs/flux-1.1-pro',
  fluxFill: 'black-forest-labs/flux-fill-pro',
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

// ─── Text streaming ────────────────────────────────────────────────────────────

export async function* streamOpenRouter(
  messages: Array<{ role: string; content: string }>,
  model: string
): AsyncGenerator<{ type: 'token'; data: string }> {
  const client = getClient();

  const stream = await client.chat.completions.create({
    model,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
    stream: true,
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) {
      yield { type: 'token', data: text };
    }
  }
}

// ─── Image generation (Flux) ──────────────────────────────────────────────────

export async function generateImageFlux(
  prompt: string,
  model: string = OR_MODELS.flux
): Promise<string> {
  const response = await fetch(`${OPENROUTER_BASE}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.FRONTEND_URL ?? 'https://ghostline.ai',
      'X-Title': 'GhostLine AI',
    },
    body: JSON.stringify({ model, prompt, n: 1 }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`OpenRouter image generation failed: ${err}`);
  }

  const data = (await response.json()) as {
    data: Array<{ url?: string; b64_json?: string }>;
  };

  const img = data.data?.[0];
  if (img?.url) return img.url;
  if (img?.b64_json) return `data:image/png;base64,${img.b64_json}`;

  throw new Error('No image data in OpenRouter response');
}
