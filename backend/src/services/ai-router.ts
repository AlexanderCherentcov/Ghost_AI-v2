import type { FastifyBaseLogger } from 'fastify';
import { OR_MODELS } from './providers/openrouter.js';

export type Complexity = 'simple' | 'complex';
export type Provider = 'cloudflare' | 'openrouter-haiku' | 'openrouter-deepseek' | 'openrouter-sonar';

export interface RouterResult {
  provider: Provider;
  complexity: Complexity;
  model: string;
  /** Fallback chain — tried in order if primary model fails */
  fallbackModels?: string[];
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

// Keywords that signal the user wants fresh info from the web
const SEARCH_KEYWORDS = [
  // Russian
  'найди','найти','поищи','поиск','погугли','загугли',
  'что сейчас','что сегодня','последние новости','свежие новости',
  'актуально','актуальная','актуальный','актуальные',
  'текущий курс','текущая цена','текущие события',
  'новости','сейчас происходит','что происходит',
  'расписание','когда выйдет','когда выходит','дата выхода',
  'погода','курс доллара','курс евро','цена биткоин',
  'последняя версия','последний релиз','вышел ли',
  'есть ли информация о','свежая информация',
  // English
  'search for','find information','look up','google it',
  'latest news','current news','recent news',
  'what is happening','right now','today\'s',
  'current price','stock price','weather in',
  'when does','release date','latest version',
  'recent events','is there any news',
];

const DOCUMENT_KEYWORDS = [
  'проанализируй документ','прочитай файл','что в pdf','что в этом файле',
  'разбери документ','объясни документ','что написано в',
  'analyze document','read file','explain this document','summarize document',
  'what does this file','what is in the pdf',
];

export type RouteCategory = 'chat' | 'code' | 'docs';

export function isSearchQuery(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return SEARCH_KEYWORDS.some((k) => lower.includes(k));
}

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
  plan?: string,
  _preferredModel?: 'haiku' | 'deepseek',  // kept for API compat, ignored — DeepSeek is always primary
  mode?: string,
): RouterResult {
  const complexity = classifyComplexity(prompt, hasImage, hasDocument);
  const isPaid = plan !== 'FREE' && plan !== undefined;

  // ── Images always need a vision-capable model — DeepSeek V3.2 cannot see images ──
  if (hasImage) {
    logger?.debug({ plan, model: OR_MODELS.haiku }, '[AIRouter] Image → Gemini Flash (vision)');
    return {
      provider: 'openrouter-haiku',
      complexity: 'complex',
      model: OR_MODELS.haiku,
      fallbackModels: [OR_MODELS.gpt4oMini],
      maxTokens: plan === 'FREE' ? 400 : undefined,
    };
  }

  // ── Std chat (mode === 'chat') → Cloudflare Llama, fallback OpenRouter Llama ──
  if (mode === 'chat' || (!mode && !hasDocument)) {
    logger?.debug({ plan, provider: 'cloudflare' }, '[AIRouter] Std chat → Cloudflare Llama');
    return {
      provider: 'cloudflare',
      complexity,
      model: '@cf/meta/llama-3.1-8b-instruct-fast',
      fallbackModels: [OR_MODELS.llama],
      maxTokens: plan === 'FREE' ? 400 : undefined,
    };
  }

  // ── Pro chat (mode === 'think') ────────────────────────────────────────────
  // Search queries → Sonar (all paid plans)
  if (isPaid && !hasDocument && isSearchQuery(prompt)) {
    logger?.debug({ plan, model: OR_MODELS.sonar }, '[AIRouter] Pro search query → Sonar');
    return {
      provider: 'openrouter-sonar',
      complexity: 'complex',
      model: OR_MODELS.sonar,
      fallbackModels: [OR_MODELS.deepseek, OR_MODELS.haiku],
    };
  }

  // Pro chat (including documents): DeepSeek V3.2 primary, Gemini Flash → GPT-4o-mini fallback.
  logger?.debug({ plan, model: OR_MODELS.deepseek }, '[AIRouter] Pro chat → DeepSeek V3.2');
  return {
    provider: 'openrouter-deepseek',
    complexity: 'complex',
    model: OR_MODELS.deepseek,
    fallbackModels: [OR_MODELS.haiku, OR_MODELS.gpt4oMini],
    maxTokens: plan === 'FREE' ? 400 : undefined,
  };
}

export function selectProvider(complexity: Complexity): { provider: Provider; model: string } {
  return complexity === 'simple'
    ? { provider: 'openrouter-haiku', model: OR_MODELS.haiku }
    : { provider: 'openrouter-deepseek', model: OR_MODELS.deepseek };
}
