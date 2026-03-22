import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface StreamChunk {
  type: 'token' | 'done' | 'error';
  data?: string;
  error?: string;
}

// ─── Chat streaming ───────────────────────────────────────────────────────────

export async function* streamOpenAI(
  messages: Array<{ role: string; content: string }>,
  model: 'gpt-4o' | 'gpt-4o-mini' = 'gpt-4o-mini'
): AsyncGenerator<StreamChunk> {
  const stream = await openai.chat.completions.create({
    model,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield { type: 'token', data: delta };
    }
  }

  yield { type: 'done' };
}

// ─── Image generation (DALL-E 3) ─────────────────────────────────────────────

export async function generateImage(
  prompt: string,
  options: { size?: '1024x1024' | '1792x1024' | '1024x1792'; quality?: 'standard' | 'hd' } = {}
): Promise<string> {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size: options.size ?? '1024x1024',
    quality: options.quality ?? 'standard',
    response_format: 'url',
  });

  const url = response.data[0]?.url;
  if (!url) throw new Error('No image URL returned from DALL-E');
  return url;
}
