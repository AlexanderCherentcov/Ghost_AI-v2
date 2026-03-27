import type { FastifyBaseLogger } from 'fastify';
import { OR_MODELS } from './providers/openrouter.js';
import type { BalanceType } from './tokens.js';

export type Complexity = 'simple' | 'complex';
export type Provider = 'openrouter-haiku' | 'openrouter-sonnet';

export interface RouterResult {
  provider: Provider;
  complexity: Complexity;
  model: string;
  balanceType: BalanceType;
  maxTokens?: number;
}

const CODE_KEYWORDS = [
  'напиши код','написать код','код на','функция','алгоритм','скрипт',
  'исправь ошибку','почему не работает','объясни код','оптимизируй',
  'рефакторинг','баг','ошибка в коде','напиши функцию','напиши класс',
  'напиши скрипт','сделай api','напиши запрос','sql запрос',
  'write code','write function','write class','write script',
  'fix bug','fix error','debug','debugging','refactor','review code',
  'function ','algorithm','implement','class ','sql query',
];

const COMPLEX_KEYWORDS = [
  'проанализируй','сравни','исследуй','реши задачу','разработай',
  'спроектируй','составь план','напиши статью','напиши эссе',
  'переведи','резюмируй','суммаризируй','что думаешь о',
  'расскажи подробнее','помоги разобраться','найди ошибку',
  'analyze','compare','research','solve','develop','design',
  'write an essay','write an article','translate','summarize',
  'explain in detail','help me understand',
];

const DOCUMENT_KEYWORDS = [
  'проанализируй документ','прочитай файл','что в pdf','что в этом файле',
  'разбери документ','объясни документ','что написано в',
  'analyze document','read file','explain this document','summarize document',
  'what does this file','what is in the pdf',
];

export type RouteCategory = 'chat' | 'code' | 'docs';

export function classifyCategory(prompt: string, hasImage = false, hasDocument = false): RouteCategory {
  if (hasDocument) return 'docs';
  const lower = prompt.toLowerCase();
  if (CODE_KEYWORDS.some((k) => lower.includes(k))) return 'code';
  if (DOCUMENT_KEYWORDS.some((k) => lower.includes(k))) return 'docs';
  return 'chat';
}

export function classifyComplexity(prompt: string, hasImage = false, hasDocument = false): Complexity {
  if (hasImage || hasDocument) return 'complex';
  const lower = prompt.toLowerCase();
  if (prompt.split(/\s+/).length > 200) return 'complex';
  if (/```|^\s*(def |function |class |SELECT |INSERT |UPDATE |DELETE )/m.test(prompt)) return 'complex';
  if (CODE_KEYWORDS.some((k) => lower.includes(k))) return 'complex';
  if (DOCUMENT_KEYWORDS.some((k) => lower.includes(k))) return 'complex';
  if (COMPLEX_KEYWORDS.some((k) => lower.includes(k))) return 'complex';
  return 'simple';
}

export function route(
  prompt: string,
  hasDocument = false,
  logger?: FastifyBaseLogger,
  hasImage = false,
  plan?: string
): RouterResult {
  const category   = classifyCategory(prompt, hasImage, hasDocument);
  const complexity = classifyComplexity(prompt, hasImage, hasDocument);

  let balanceType: BalanceType;
  if (hasImage && !hasDocument) balanceType = 'images';
  else if (category === 'code')                balanceType = 'code';
  else if (category === 'docs' || hasDocument) balanceType = 'docs';
  else                                          balanceType = 'chat';

  const usesonnet  = complexity === 'complex';
  const provider: Provider = usesonnet ? 'openrouter-sonnet' : 'openrouter-haiku';
  const model = usesonnet ? OR_MODELS.sonnet : OR_MODELS.haiku;
  const maxTokens = plan === 'FREE' ? 400 : undefined;

  logger?.debug({ category, complexity, balanceType, provider, model, plan }, '[AIRouter] Routed');
  return { provider, complexity: usesonnet ? 'complex' : complexity, model, balanceType, maxTokens };
}

export function selectProvider(complexity: Complexity): { provider: Provider; model: string } {
  return complexity === 'simple'
    ? { provider: 'openrouter-haiku', model: OR_MODELS.haiku }
    : { provider: 'openrouter-sonnet', model: OR_MODELS.sonnet };
}
