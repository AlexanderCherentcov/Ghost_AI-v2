/**
 * Cloudflare AI provider for standard chat
 * Used for ALL std chat requests on ALL plans (including FREE)
 * Model: @cf/meta/llama-3.1-8b-instruct-fast
 */

import type { ChatMessage } from './openrouter.js';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const CF_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';

function getCfUrl(): string {
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`;
}

function getCfHeaders(): Record<string, string> {
  const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// ─── One-shot JSON call (for dispatcher / lyrics) ────────────────────────────

export async function callCloudflareJSON(
  messages: ChatMessage[],
  maxTokens = 512,
): Promise<string> {
  const cfMessages = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string'
      ? m.content
      : (m.content as any[]).map((p: any) => (p.type === 'text' ? p.text : '')).join(''),
  }));

  const response = await fetch(getCfUrl(), {
    method: 'POST',
    headers: getCfHeaders(),
    body: JSON.stringify({ messages: cfMessages, stream: false, max_tokens: maxTokens }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Cloudflare AI error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as any;
  return data?.result?.response ?? data?.response ?? '';
}

// ─── Streaming text from Cloudflare AI ────────────────────────────────────────

export async function* streamCloudflare(
  messages: ChatMessage[],
  _maxTokens?: number,
): AsyncGenerator<{ type: 'token'; data: string } | { type: 'used_model'; model: string }> {
  const url = getCfUrl();
  const headers = getCfHeaders();

  // Cloudflare AI expects simple string content (not multimodal arrays)
  const cfMessages = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string'
      ? m.content
      : m.content
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join(''),
  }));

  const body = JSON.stringify({
    messages: cfMessages,
    stream: true,
    max_tokens: _maxTokens ?? 1024,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });
  } catch (err: any) {
    throw Object.assign(
      new Error(`Cloudflare AI connection error: ${err.message}`),
      { code: 'CF_CONNECTION_ERROR' },
    );
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw Object.assign(
      new Error(`Cloudflare AI error ${response.status}: ${errText}`),
      { code: 'CF_API_ERROR', status: response.status },
    );
  }

  if (!response.body) {
    throw Object.assign(
      new Error('Cloudflare AI returned empty body'),
      { code: 'CF_EMPTY_RESPONSE' },
    );
  }

  yield { type: 'used_model', model: CF_MODEL };

  // Parse Server-Sent Events
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') return;

        try {
          const parsed = JSON.parse(dataStr) as { response?: string };
          if (parsed.response) {
            yield { type: 'token', data: parsed.response };
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
