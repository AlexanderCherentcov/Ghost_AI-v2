import { createHash } from 'crypto';
import { redis } from '../lib/redis.js';

const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildCacheKey(mode: string, tier: string, prompt: string): string {
  const normalized = normalizePrompt(prompt);
  const raw = `${mode}:${tier}:${normalized}`;
  return createHash('sha256').update(raw).digest('hex');
}

export async function getCached(
  mode: string,
  tier: string,
  prompt: string
): Promise<{ hit: true; response: object } | { hit: false }> {
  const key = buildCacheKey(mode, tier, prompt);
  const cached = await redis.get(key);
  return cached ? { hit: true, response: JSON.parse(cached) } : { hit: false };
}

export async function setCached(
  mode: string,
  tier: string,
  prompt: string,
  response: object
): Promise<void> {
  const key = buildCacheKey(mode, tier, prompt);
  await redis.set(key, JSON.stringify(response), 'EX', TTL_SECONDS);
}
