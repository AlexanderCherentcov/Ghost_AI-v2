import type { FastifyBaseLogger } from 'fastify';
import { OR_MODELS } from './providers/openrouter.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Complexity = 'simple' | 'complex';
// Maps to OpenRouter model IDs
export type Provider = 'openrouter-haiku' | 'openrouter-sonnet';

export interface RouterResult {
  provider: Provider;
  complexity: Complexity;
  model: string;
}

// ─── Keywords ─────────────────────────────────────────────────────────────────

const CODE_KEYWORDS = [
  'напиши код', 'написать код', 'код на', 'функция', 'алгоритм', 'скрипт',
  'write code', 'function', 'algorithm', 'script', 'class ', 'implement',
  'объясни код', 'оптимизируй', 'рефакторинг', 'debug', 'баг', 'ошибка в коде',
];

const COMPLEX_KEYWORDS = [
  'объясни', 'проанализируй', 'сравни', 'исследуй',
  'реши', 'разработай', 'спроектируй',
  'explain', 'analyze', 'compare', 'research',
  'solve', 'develop', 'design',
];

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyComplexity(prompt: string): Complexity {
  const lower = prompt.toLowerCase();

  // Long prompts always go to sonnet
  const tokens = Math.ceil(prompt.split(/\s+/).length * 0.75);
  if (tokens > 300) return 'complex';

  // Code patterns
  if (/```|def |function |class /.test(prompt)) return 'complex';
  if (CODE_KEYWORDS.some((k) => lower.includes(k))) return 'complex';
  if (COMPLEX_KEYWORDS.some((k) => lower.includes(k))) return 'complex';

  return 'simple';
}

// ─── Provider selection ───────────────────────────────────────────────────────

export function selectProvider(complexity: Complexity): { provider: Provider; model: string } {
  if (complexity === 'simple') {
    return { provider: 'openrouter-haiku', model: OR_MODELS.haiku };
  }
  // complex (code, analysis) → Sonnet
  return { provider: 'openrouter-sonnet', model: OR_MODELS.sonnet };
}

// ─── Main router ──────────────────────────────────────────────────────────────

export function route(
  prompt: string,
  hasDocument = false,
  logger?: FastifyBaseLogger
): RouterResult {
  // Documents always use Sonnet
  const complexity: Complexity = hasDocument ? 'complex' : classifyComplexity(prompt);
  const { provider, model } = selectProvider(complexity);

  logger?.debug({ complexity, provider, model, promptLength: prompt.length }, '[AIRouter] Routed request');

  return { provider, complexity, model };
}
