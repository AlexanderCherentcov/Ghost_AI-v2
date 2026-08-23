import type { FastifyBaseLogger } from 'fastify';
import {
  AUTO_MODEL_ID,
  AUTO_MIN_COST,
  CHAT_MODELS,
  autoEligibleChatModels,
  findModel,
  type ChatModelSpec,
} from '../config/models.js';

// ─── Ключевые слова для диспетчера режима «Авто» ──────────────────────────────
//
// Используются ТОЛЬКО когда пользователь явно выбрал 'auto' — это внутренняя
// эвристика экономии Caspers, а не скрытый тариф-детектор. При явном выборе
// конкретной модели этот файл вообще не участвует в решении.

const COMPLEX_KEYWORDS = [
  'проанализируй','сравни','исследуй','реши задачу','разработай',
  'спроектируй','составь план','напиши статью','напиши эссе',
  'переведи','резюмируй','суммаризируй','что думаешь о',
  'расскажи подробнее','помоги разобраться','найди ошибку',
  'напиши код','написать код','код на','функция','алгоритм','скрипт',
  'исправь ошибку','почему не работает','объясни код','оптимизируй',
  'рефакторинг','баг','ошибка в коде',
  'analyze','compare','research','solve','develop','design',
  'write an essay','write an article','translate','summarize',
  'explain in detail','help me understand','write code','debug','refactor',
];

const SEARCH_KEYWORDS = [
  'найди','найти','поищи','поиск','погугли','загугли',
  'что сейчас','что сегодня','последние новости','свежие новости',
  'актуально','актуальная','актуальный','актуальные',
  'текущий курс','текущая цена','текущие события',
  'новости','сейчас происходит','что происходит',
  'расписание','когда выйдет','когда выходит','дата выхода',
  'погода','курс доллара','курс евро','цена биткоин',
  'последняя версия','последний релиз','вышел ли',
  'есть ли информация о','свежая информация',
  'search for','find information','look up','google it',
  'latest news','current news','recent news',
  'what is happening','right now','today\'s',
  'current price','stock price','weather in',
  'when does','release date','latest version',
  'recent events','is there any news',
];

export function isSearchQuery(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return SEARCH_KEYWORDS.some((k) => lower.includes(k));
}

function isComplexQuery(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  if (prompt.split(/\s+/).length > 200) return true;
  if (/```|^\s*(def |function |class |SELECT |INSERT |UPDATE |DELETE )/m.test(prompt)) return true;
  return COMPLEX_KEYWORDS.some((k) => lower.includes(k));
}

export interface ChatRouteResult {
  spec: ChatModelSpec;
  /** true, если модель подобрана диспетчером «Авто», а не выбрана пользователем явно. */
  viaAuto: boolean;
  /**
   * Реальная цена списания — обычно равна spec.cost, НО если «Авто» подобрало
   * бесплатную Llama, это AUTO_MIN_COST, а не 0: «Авто» — платная функция
   * экономии, не чёрный ход к бесплатному чату. При явном выборе
   * «Стандартного чата» (эта же модель, но не через диспетчер) цена честно 0 —
   * см. resolveChatModel: billedCost === spec.cost всегда, если viaAuto === false.
   */
  billedCost: number;
}

export class VisionNotSupportedError extends Error {
  code = 'MODEL_NO_VISION';
  constructor(label: string) {
    super(`Модель «${label}» не умеет распознавать изображения — выберите другую модель или «Авто».`);
  }
}

export class UnknownModelError extends Error {
  code = 'UNKNOWN_MODEL';
  constructor(id: string) {
    super(`Неизвестная модель: ${id}`);
  }
}

/**
 * Разрешает id модели (включая 'auto') в конкретный ChatModelSpec.
 * Явный выбор — уважается всегда, включая ошибку вместо молчаливой подмены,
 * если модель не умеет то, что нужно для конкретного сообщения (см. VisionNotSupportedError).
 */
export function resolveChatModel(
  modelId: string,
  ctx: { prompt: string; hasImage: boolean; hasDocument: boolean; plan: string; logger?: FastifyBaseLogger },
): ChatRouteResult {
  const { prompt, hasImage, hasDocument, plan, logger } = ctx;

  if (modelId !== AUTO_MODEL_ID) {
    const spec = findModel('chat', modelId);
    if (!spec) throw new UnknownModelError(modelId);
    if (hasImage && !spec.capabilities?.vision) throw new VisionNotSupportedError(spec.label);
    return { spec, viaAuto: false, billedCost: spec.cost };
  }

  // ── Диспетчер «Авто» ─────────────────────────────────────────────────────
  const isPaid = plan !== 'FREE';

  if (hasImage) {
    return autoResult(pick('gemini-2.5-flash', logger, 'Авто → картинка нужна vision-модель'));
  }
  if (isPaid && !hasDocument && isSearchQuery(prompt)) {
    return autoResult(pick('sonar', logger, 'Авто → похоже на поисковый запрос'));
  }
  if (hasDocument || isComplexQuery(prompt)) {
    return autoResult(pick('deepseek-v3.2', logger, 'Авто → сложный запрос/документ'));
  }
  return autoResult(pick('llama-3.1-fast', logger, 'Авто → простой запрос, экономим'));
}

// «Авто» — платная функция сама по себе (см. AUTO_MIN_COST в config/models.ts):
// даже когда диспетчер выбрал бесплатную Llama, billedCost не опускается до 0.
function autoResult(spec: ChatModelSpec): ChatRouteResult {
  return { spec, viaAuto: true, billedCost: Math.max(spec.cost, AUTO_MIN_COST) };
}

function pick(id: string, logger: FastifyBaseLogger | undefined, why: string): ChatModelSpec {
  const spec = CHAT_MODELS.find((m) => m.id === id);
  if (!spec) throw new UnknownModelError(id);
  logger?.debug({ model: spec.id }, `[AIRouter] ${why}`);
  return spec;
}

// autoEligibleChatModels() реэкспортируется отсюда для удобства вызывающего кода
export { autoEligibleChatModels };
