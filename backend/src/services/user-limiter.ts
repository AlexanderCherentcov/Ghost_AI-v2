/**
 * Per-user rate limiting & in-flight lock
 * ────────────────────────────────────────
 * Защищает от спама и дублирующих запросов:
 *   • CHAT_RPM   — макс сообщений в минуту в чате (default 20)
 *   • GEN_RPM    — макс запросов генерации в минуту (default 5)
 *   • chat lock  — не даёт отправить новый запрос пока предыдущий стримится
 *
 * Все функции fail-open: если Redis недоступен — пропускаем запрос.
 */

import { redis } from '../lib/redis.js';

const CHAT_RPM  = parseInt(process.env.CHAT_RPM  ?? '10');  // 10 сообщений чата в минуту
const GEN_RPM   = parseInt(process.env.GEN_RPM   ?? '3');   // 3 генерации картинок в минуту
const VIDEO_RPM = parseInt(process.env.VIDEO_RPM ?? '1');   // 1 генерация видео в минуту
const LOCK_TTL  = 120; // секунд — max время удержания лока (страховка от вечного лока)

// ─── Chat rate limit ──────────────────────────────────────────────────────────

/**
 * Проверяет лимит сообщений пользователя в чате.
 * Redis INCR + EXPIRE реализует скользящее окно в 60 сек.
 * @returns true — в пределах лимита, false — превышен
 */
export async function checkChatRateLimit(userId: string): Promise<boolean> {
  try {
    const key = `rl:chat:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    return count <= CHAT_RPM;
  } catch {
    return true; // Redis недоступен → пропускаем (fail-open)
  }
}

// ─── Generate rate limit ──────────────────────────────────────────────────────

/**
 * Проверяет лимит запросов на медиа-генерацию пользователя.
 * @returns true — в пределах лимита, false — превышен
 */
export async function checkGenRateLimit(userId: string): Promise<boolean> {
  try {
    const key = `rl:gen:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    return count <= GEN_RPM;
  } catch {
    return true;
  }
}

// ─── Video rate limit ─────────────────────────────────────────────────────────

/**
 * Проверяет лимит запросов на видео-генерацию (1 в минуту).
 * @returns true — в пределах лимита, false — превышен
 */
export async function checkVideoRateLimit(userId: string): Promise<boolean> {
  try {
    const key = `rl:video:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    return count <= VIDEO_RPM;
  } catch {
    return true;
  }
}

// ─── Chat in-flight lock ──────────────────────────────────────────────────────

/**
 * Пытается захватить эксклюзивный лок на стриминг для конкретного пользователя.
 * SET NX гарантирует атомарность — только один запрос может держать лок.
 * Лок автоматически истекает через LOCK_TTL секунд (страховка от краша).
 * @returns true — лок захвачен, false — уже занят другим запросом
 */
export async function acquireChatLock(userId: string): Promise<boolean> {
  try {
    const key = `lock:chat:${userId}`;
    const result = await redis.set(key, '1', 'EX', LOCK_TTL, 'NX');
    return result === 'OK';
  } catch {
    return true; // Redis недоступен → пропускаем (fail-open)
  }
}

/**
 * Освобождает лок пользователя.
 * ВСЕГДА вызывать в блоке finally после acquireChatLock.
 */
export async function releaseChatLock(userId: string): Promise<void> {
  try {
    await redis.del(`lock:chat:${userId}`);
  } catch {
    // Игнорируем ошибку — лок всё равно истечёт через LOCK_TTL
  }
}
