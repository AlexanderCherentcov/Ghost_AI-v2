// Общая проверка заголовка x-bot-secret для внутренних эндпоинтов, которые
// вызывает только бот (не обычные пользователи). Раньше эта проверка была
// скопирована в 4 местах (admin.ts + 3 раза в auth.ts) с разными кодами
// ответа (403 в одном месте, 401 в остальных) — теперь один источник.

import { timingSafeEqual } from 'crypto';

if (!process.env.BOT_SECRET) {
  throw new Error('BOT_SECRET is required — server refuses to start without it');
}
export const BOT_SECRET = process.env.BOT_SECRET;
const BOT_SECRET_BUF = Buffer.from(BOT_SECRET);

/**
 * Сравнение через timingSafeEqual — этот секрет открывает доступ ко всем
 * /admin/* эндпоинтам (смена тарифа, Caspers, бан), обычное `!==` даёт
 * микроскопическую, но ненулевую утечку через тайминг посимвольного сравнения.
 */
function secretsMatch(secret: string): boolean {
  const buf = Buffer.from(secret);
  if (buf.length !== BOT_SECRET_BUF.length) return false;
  return timingSafeEqual(buf, BOT_SECRET_BUF);
}

/** true — секрет верный, можно продолжать. Иначе сама отправляет 401 и возвращает false. */
export function checkBotSecret(request: any, reply: any): boolean {
  const secret = (request.headers['x-bot-secret'] ?? '') as string;
  if (!secretsMatch(secret)) {
    reply.code(401).send({ error: 'Unauthorized' });
    return false;
  }
  return true;
}
