import type { FastifyBaseLogger } from 'fastify';
import { OR_MODELS } from './providers/openrouter.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Complexity = 'simple' | 'complex';
export type Provider = 'openrouter-haiku' | 'openrouter-sonnet';

export interface RouterResult {
  provider: Provider;
  complexity: Complexity;
  model: string;
}

// ─── Keyword lists by category ────────────────────────────────────────────────

// Код и программирование → Sonnet
const CODE_KEYWORDS = [
  // RU
  'напиши код', 'написать код', 'код на', 'функция', 'алгоритм', 'скрипт',
  'исправь ошибку', 'почему не работает', 'объясни код', 'оптимизируй',
  'рефакторинг', 'баг', 'ошибка в коде', 'напиши функцию', 'напиши класс',
  'напиши скрипт', 'сделай api', 'напиши запрос', 'sql запрос',
  // EN
  'write code', 'write function', 'write class', 'write script',
  'fix bug', 'fix error', 'debug', 'debugging', 'refactor', 'review code',
  'function ', 'algorithm', 'implement', 'class ', 'sql query',
];

// Сложный анализ → Sonnet
const COMPLEX_KEYWORDS = [
  // RU
  'проанализируй', 'сравни', 'исследуй', 'реши задачу', 'разработай',
  'спроектируй', 'составь план', 'напиши статью', 'напиши эссе',
  'переведи', 'резюмируй', 'суммаризируй', 'что думаешь о',
  'расскажи подробнее', 'помоги разобраться', 'найди ошибку',
  // EN
  'analyze', 'compare', 'research', 'solve', 'develop', 'design',
  'write an essay', 'write an article', 'translate', 'summarize',
  'explain in detail', 'help me understand',
];

// Документы → Sonnet (дополнительные ключевые слова)
const DOCUMENT_KEYWORDS = [
  // RU
  'проанализируй документ', 'прочитай файл', 'что в pdf', 'что в этом файле',
  'разбери документ', 'объясни документ', 'что написано в',
  // EN
  'analyze document', 'read file', 'explain this document', 'summarize document',
  'what does this file', 'what is in the pdf',
];

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyComplexity(
  prompt: string,
  hasImage = false,
  hasDocument = false
): Complexity {
  // Attachment → always Sonnet (multimodal / doc analysis)
  if (hasImage || hasDocument) return 'complex';

  const lower = prompt.toLowerCase();

  // Long prompts → Sonnet
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount > 200) return 'complex';

  // Code block markers
  if (/```|^\s*(def |function |class |SELECT |INSERT |UPDATE |DELETE )/m.test(prompt)) return 'complex';

  // Category keyword matches
  if (CODE_KEYWORDS.some((k) => lower.includes(k))) return 'complex';
  if (DOCUMENT_KEYWORDS.some((k) => lower.includes(k))) return 'complex';
  if (COMPLEX_KEYWORDS.some((k) => lower.includes(k))) return 'complex';

  return 'simple';
}

// ─── Provider selection ───────────────────────────────────────────────────────

export function selectProvider(complexity: Complexity): { provider: Provider; model: string } {
  return complexity === 'simple'
    ? { provider: 'openrouter-haiku', model: OR_MODELS.haiku }
    : { provider: 'openrouter-sonnet', model: OR_MODELS.sonnet };
}

// ─── Main router ──────────────────────────────────────────────────────────────

export function route(
  prompt: string,
  hasDocument = false,
  logger?: FastifyBaseLogger,
  hasImage = false
): RouterResult {
  const complexity = classifyComplexity(prompt, hasImage, hasDocument);
  const { provider, model } = selectProvider(complexity);

  logger?.debug(
    { complexity, provider, model, promptLength: prompt.length, hasImage, hasDocument },
    '[AIRouter] Routed request'
  );

  return { provider, complexity, model };
}
