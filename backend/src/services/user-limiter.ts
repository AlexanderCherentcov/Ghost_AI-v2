/**
 * Rate limiting на пользователя и блокировка одновременных запросов
 * ────────────────────────────────────────────────────────────────
 * Защищает от спама и дублирующих запросов:
 *   • CHAT_RPM   — макс сообщений в минуту в чате (default 10)
 *   • GEN_RPM    — макс запросов генерации в минуту (default 3)
 *   • VIDEO_RPM  — макс запросов видео в минуту (default 1)
 *   • chat lock  — не даёт отправить новый запрос пока предыдущий стримится
 *
 * Обнаружение злоупотреблений по часам (уведомление админу — раз в час):
 *   • CHAT_RPH   — 30 сообщений в час
 *   • IMG_RPH    — 10 генераций картинок в час
 *   • VIDEO_RPH  — 5 генераций видео в час
 *
 * Все функции fail-open: если Redis недоступен — пропускаем запрос.
 */

import { redis } from '../lib/redis.js';
import { notifyAbuse } from './admin-notify.js';
import { prisma } from '../lib/prisma.js';

const CHAT_RPM  = parseInt(process.env.CHAT_RPM  ?? '10');
const GEN_RPM   = parseInt(process.env.GEN_RPM   ?? '3');
const VIDEO_RPM = parseInt(process.env.VIDEO_RPM ?? '1');
const LOCK_TTL  = 120; // секунд

// Часовые пороги для обнаружения злоупотреблений
const CHAT_RPH  = parseInt(process.env.CHAT_RPH  ?? '30');
const IMG_RPH   = parseInt(process.env.IMG_RPH   ?? '10');
const VIDEO_RPH = parseInt(process.env.VIDEO_RPH ?? '5');

// Текущий часовой bucket (меняется каждые 60 мин)
function hourBucket(): number {
  return Math.floor(Date.now() / 3_600_000);
}

async function trackHourly(
  userId: string,
  type: 'chat' | 'image' | 'video',
  threshold: number,
): Promise<void> {
  try {
    const hour = hourBucket();
    const key  = `rl:${type}:h:${hour}:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 3600);

    if (count === threshold + 1) {
      // Отправляем уведомление о злоупотреблении ровно один раз на пользователя/тип/час
      const notifyKey = `notify:abuse:${type}:${userId}:${hour}`;
      const alreadySent = await redis.set(notifyKey, '1', 'EX', 3600, 'NX');
      if (alreadySent === 'OK') {
        // Запрашиваем имя пользователя асинхронно — без await, чтобы не тормозить запрос
        prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
          .then(user => notifyAbuse({
            userId,
            userName: user?.name ?? null,
            type,
            count,
            limit: threshold,
          }))
          .catch(err => console.error('[UserLimiter] Abuse notify error:', err));
      }
    }
  } catch {
    // Fail-open: Redis недоступен
  }
}

// ─── Rate limit чата ──────────────────────────────────────────────────────────

export async function checkChatRateLimit(userId: string): Promise<boolean> {
  try {
    const key   = `rl:chat:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    trackHourly(userId, 'chat', CHAT_RPH); // fire-and-forget, без ожидания
    return count <= CHAT_RPM;
  } catch {
    return true;
  }
}

// ─── Rate limit генерации (картинки) ──────────────────────────────────────────

export async function checkGenRateLimit(userId: string): Promise<boolean> {
  try {
    const key   = `rl:gen:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    trackHourly(userId, 'image', IMG_RPH);
    return count <= GEN_RPM;
  } catch {
    return true;
  }
}

// ─── Rate limit видео ──────────────────────────────────────────────────────────

export async function checkVideoRateLimit(userId: string): Promise<boolean> {
  try {
    const key   = `rl:video:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 60);
    trackHourly(userId, 'video', VIDEO_RPH);
    return count <= VIDEO_RPM;
  } catch {
    return true;
  }
}

// ─── Блокировка одновременных запросов в чате ─────────────────────────────────

export async function acquireChatLock(userId: string): Promise<boolean> {
  try {
    const key    = `lock:chat:${userId}`;
    const result = await redis.set(key, '1', 'EX', LOCK_TTL, 'NX');
    return result === 'OK';
  } catch {
    return true;
  }
}

export async function releaseChatLock(userId: string): Promise<void> {
  try {
    await redis.del(`lock:chat:${userId}`);
  } catch {
    // Игнорируем ошибку — лок всё равно истечёт через LOCK_TTL
  }
}
