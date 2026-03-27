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

// ─── Image generation (Flux via chat completions) ─────────────────────────────
// OpenRouter routes Flux models through chat completions endpoint.
// The model returns an image URL in choices[0].message.content.

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

  // Format 1: data[].url (OpenAI images style, some OR models use this)
  const imgData = data.data?.[0];
  if (imgData?.url) return imgData.url;
  if (imgData?.b64_json) return `data:image/png;base64,${imgData.b64_json}`;

  // Format 2: choices[].message.content as string URL
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('http') || trimmed.startsWith('data:')) return trimmed;
    // Sometimes OR wraps URL in markdown: ![](url)
    const mdMatch = trimmed.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (mdMatch) return mdMatch[1];
  }

  // Format 3: choices[].message.content as array with image_url parts
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === 'image_url' && part.image_url?.url) return part.image_url.url;
      if (part.type === 'image' && (part as any).url) return (part as any).url;
    }
  }

  throw new Error(`No image data in OpenRouter response: ${JSON.stringify(data).slice(0, 300)}`);
}
