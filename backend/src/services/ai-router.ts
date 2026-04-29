import type { FastifyBaseLogger } from 'fastify';
import { OR_MODELS } from './providers/openrouter.js';

export type Complexity = 'simple' | 'complex';
export type Provider = 'cloudflare' | 'openrouter-haiku' | 'openrouter-deepseek' | 'openrouter-sonar';

export interface RouterResult {
  provider: Provider;
  complexity: Complexity;
  model: string;
  fallbackModel?: string;
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
  preferredModel?: 'haiku' | 'deepseek',
  mode?: string,
): RouterResult {
  const complexity = classifyComplexity(prompt, hasImage, hasDocument);

  // [C-05] Images need a vision-capable model for analysis, not an image-generation model
  if (hasImage) {
    return {
      provider: 'openrouter-haiku' as Provider,
      complexity: 'complex',
      model: OR_MODELS.haiku,
      fallbackModel: OR_MODELS.gpt4oMini,
      maxTokens: plan === 'FREE' ? 400 : undefined,
    };
  }

  // Std chat (mode === 'chat' or no mode specified, no image, no document) → Cloudflare AI
  // Pro/think mode → OpenRouter
  if (mode === 'chat' || (!mode && !hasDocument && !hasImage)) {
    // Still use OpenRouter for search queries on paid plans with sonar
    const isPaidPlan = plan !== 'FREE' && plan !== undefined;
    if (isPaidPlan && isSearchQuery(prompt)) {
      logger?.debug({ plan, model: OR_MODELS.sonar }, '[AIRouter] Search query → Sonar');
      return {
        provider: 'openrouter-sonar',
        complexity: 'complex',
        model: OR_MODELS.sonar,
        fallbackModel: OR_MODELS.deepseek,
        maxTokens: undefined,
      };
    }

    // Default std chat → Cloudflare
    logger?.debug({ plan, provider: 'cloudflare' }, '[AIRouter] Std chat → Cloudflare');
    return {
      provider: 'cloudflare',
      complexity,
      model: '@cf/meta/llama-3.1-8b-instruct-fast',
      maxTokens: plan === 'FREE' ? 400 : undefined,
    };
  }

  // Pro chat (mode === 'think') → OpenRouter
  const isPaid = plan !== 'FREE' && plan !== undefined;
  const isPremium = plan === 'PRO' || plan === 'VIP' || plan === 'ULTRA';

  if (isPaid && !hasDocument && !hasImage && isSearchQuery(prompt)) {
    logger?.debug({ plan, model: OR_MODELS.sonar }, '[AIRouter] Search query → Sonar');
    return {
      provider: 'openrouter-sonar',
      complexity: 'complex',
      model: OR_MODELS.sonar,
      fallbackModel: OR_MODELS.deepseek,
      maxTokens: undefined,
    };
  }

  // PRO / VIP / ULTRA → DeepSeek by default (unless user explicitly picks haiku)
  const useDeepSeek = preferredModel === 'deepseek'
    ? true
    : preferredModel === 'haiku'
      ? false
      : isPremium || hasDocument;

  const provider: Provider = useDeepSeek ? 'openrouter-deepseek' : 'openrouter-haiku';
  const model = useDeepSeek ? OR_MODELS.deepseek : OR_MODELS.haiku;
  const fallbackModel = useDeepSeek ? OR_MODELS.gpt4oMini : undefined;
  const maxTokens = plan === 'FREE' ? 400 : undefined;

  logger?.debug({ complexity, provider, model, plan }, '[AIRouter] Routed');
  return { provider, complexity: useDeepSeek ? 'complex' : complexity, model, fallbackModel, maxTokens };
}

export function selectProvider(complexity: Complexity): { provider: Provider; model: string } {
  return complexity === 'simple'
    ? { provider: 'openrouter-haiku', model: OR_MODELS.haiku }
    : { provider: 'openrouter-deepseek', model: OR_MODELS.deepseek };
}
