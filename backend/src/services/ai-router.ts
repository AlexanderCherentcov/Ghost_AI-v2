import type { FastifyBaseLogger } from 'fastify';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Complexity = 'simple' | 'complex';
export type Provider = 'gemini-flash' | 'gpt4o-mini' | 'claude-sonnet' | 'gpt4o';

export interface RouterResult {
  provider: Provider;
  complexity: Complexity;
}

// ─── Keywords ─────────────────────────────────────────────────────────────────

const SIMPLE_KEYWORDS = [
  'переведи', 'привет', 'что такое', 'сколько', 'когда', 'кто такой',
  'translate', 'hello', 'what is', 'how many', 'who is', 'hi',
];

const COMPLEX_KEYWORDS = [
  'объясни', 'проанализируй', 'напиши код', 'сравни', 'исследуй',
  'реши', 'оптимизируй', 'разработай', 'спроектируй', 'алгоритм',
  'explain', 'analyze', 'write code', 'compare', 'research',
  'solve', 'optimize', 'develop', 'design', 'algorithm',
];

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyComplexity(prompt: string): Complexity {
  const lower = prompt.toLowerCase();

  // Approximate token count
  const tokens = Math.ceil(prompt.split(/\s+/).length * 0.75);

  if (tokens > 500) return 'complex';
  if (/```|def |function |class /.test(prompt)) return 'complex';
  if (COMPLEX_KEYWORDS.some((k) => lower.includes(k))) return 'complex';
  if (SIMPLE_KEYWORDS.some((k) => lower.includes(k))) return 'simple';

  // Default to simple (cost savings)
  return 'simple';
}

// ─── Provider selection ───────────────────────────────────────────────────────

// Round-robin index for cheap providers
let cheapRoundRobin = 0;

export function selectProvider(complexity: Complexity): Provider {
  if (complexity === 'simple') {
    cheapRoundRobin = (cheapRoundRobin + 1) % 2;
    return cheapRoundRobin === 0 ? 'gemini-flash' : 'gpt4o-mini';
  }
  // Complex → Claude Sonnet as primary
  return 'claude-sonnet';
}

// ─── Main router ──────────────────────────────────────────────────────────────

export function route(prompt: string, logger?: FastifyBaseLogger): RouterResult {
  const complexity = classifyComplexity(prompt);
  const provider = selectProvider(complexity);

  logger?.debug({ complexity, provider, promptLength: prompt.length }, '[AIRouter] Routed request');

  return { provider, complexity };
}
