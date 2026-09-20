import { redis } from './redis.js';

/**
 * Бан хранится в Redis (ключ banned:<userId>, его ставит админ-бот). При недоступности
 * Redis считаем пользователя не забаненным (fail-open): сбой кэша не должен ронять весь API.
 */
export async function isUserBanned(userId: string): Promise<boolean> {
  try {
    return (await redis.exists(`banned:${userId}`)) > 0;
  } catch {
    return false;
  }
}
