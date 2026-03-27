import { createHash } from 'crypto';
import { redis } from '../lib/redis.js';

// ─── TTLs ─────────────────────────────────────────────────────────────────────
const TTL_TEXT  = 60 * 60 * 24;      // 24 часа — текстовые ответы
const TTL_MEDIA = 60 * 60 * 24 * 7;  // 7 дней — URL сгенерированных картинок

// Инкремент для инвалидации без FLUSHDB — поменяй в .env
const VER = process.env.CACHE_VERSION ?? 'v1';

// Запросы короче порога — никогда не кэшируем ("да", "нет", "ты уверен?")
const SHORT_THRESHOLD = parseInt(process.env.CACHE_SHORT_THRESHOLD ?? '20', 10);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sha256(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

// ─── Short-prompt detection ───────────────────────────────────────────────────

/**
 * Короткие разговорные сообщения (< 20 символов) обходят кэш полностью
 * и летят в API вместе с историей чата.
 * Это устраняет «нелепые ответы» когда "да" возвращало ответ про апокалипсис.
 */
export function isShortPrompt(prompt: string): boolean {
  return prompt.trim().length < SHORT_THRESHOLD;
}

// ─────────────────────────────────────────────────────────────────────────────
// ТЕКСТОВЫЙ КЭШ  (контекстный — составной ключ)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Строим ключ из: последние 2 сообщения пользователя + текущий промпт.
 * Это делает кэш контекстно-зависимым:
 *   "да" после "как сварить яйцо?"  ≠  "да" после "хочешь кофе?"
 */
function textKey(
  mode: string,
  complexity: string,
  prompt: string,
  historyContext: string[]   // только user-сообщения из истории
): string {
  const ctx     = historyContext.slice(-2).map(normalize);
  const combined = [...ctx, normalize(prompt)].join('\n↓\n');
  return `ghost:t:${sha256(`${VER}:${mode}:${complexity}:${combined}`)}`;
}

export async function getTextCached(
  mode: string,
  complexity: string,
  prompt: string,
  historyContext: string[] = []
): Promise<{ hit: true; response: object } | { hit: false }> {
  if (isShortPrompt(prompt)) return { hit: false };  // коротыши → мимо
  try {
    const raw = await redis.get(textKey(mode, complexity, prompt, historyContext));
    return raw ? { hit: true, response: JSON.parse(raw) } : { hit: false };
  } catch {
    return { hit: false }; // Redis недоступен → miss (fail-open)
  }
}

export async function setTextCached(
  mode: string,
  complexity: string,
  prompt: string,
  response: object,
  historyContext: string[] = []
): Promise<void> {
  if (isShortPrompt(prompt)) return;
  try {
    await redis.set(
      textKey(mode, complexity, prompt, historyContext),
      JSON.stringify(response),
      'EX',
      TTL_TEXT
    );
  } catch {
    // Redis недоступен → пропускаем запись (fail-open)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// МЕДИА КЭШ  (изолированный — только промпт, без истории)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ключ строго из промпта — без контекста, без сессии, без юзера.
 * "неоновый призрак" → одинаковый хеш у всех пользователей навсегда.
 * Экономим реальные кредиты генерации.
 */
function mediaKey(mode: string, prompt: string): string {
  return `ghost:m:${sha256(`${VER}:${mode}:${normalize(prompt)}`)}`;
}

export async function getMediaCached(
  mode: string,
  prompt: string
): Promise<{ hit: true; url: string } | { hit: false }> {
  try {
    const url = await redis.get(mediaKey(mode, prompt));
    return url ? { hit: true, url } : { hit: false };
  } catch {
    return { hit: false }; // Redis недоступен → miss (fail-open)
  }
}

export async function setMediaCached(
  mode: string,
  prompt: string,
  url: string
): Promise<void> {
  try {
    await redis.set(mediaKey(mode, prompt), url, 'EX', TTL_MEDIA);
  } catch {
    // Redis недоступен → пропускаем (fail-open)
  }
}

// ─── Legacy compat ────────────────────────────────────────────────────────────
// Обратная совместимость — перенаправляем на текстовый кэш без контекста
export const getCached = (mode: string, complexity: string, prompt: string) =>
  getTextCached(mode, complexity, prompt, []);

export const setCached = (mode: string, complexity: string, prompt: string, response: object) =>
  setTextCached(mode, complexity, prompt, response, []);
