import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface StreamChunk {
  type: 'token' | 'done' | 'error';
  data?: string;
  error?: string;
}

export async function* streamClaude(
  messages: Array<{ role: string; content: string }>,
  model = 'claude-sonnet-4-6'
): AsyncGenerator<StreamChunk> {
  const formattedMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const stream = client.messages.stream({
    model,
    max_tokens: 8192,
    messages: formattedMessages,
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield { type: 'token', data: event.delta.text };
    }
  }

  yield { type: 'done' };
}
