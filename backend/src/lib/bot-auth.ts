// Общая проверка секретов для внутренних эндпоинтов, которые вызывают только
// боты (не обычные пользователи). Три отдельных секрета — по числу процессов
// с разным уровнем привилегий:
//   - BOT_SECRET         — bot.ts (обычный юзер-бот): логин, промо, согласие
//   - ADMIN_BOT_SECRET   — admin-bot.ts: /admin/* (тарифы, Caspers, бан) и
//                          модерация галереи — полный доступ
//   - SUPPORT_BOT_SECRET — support-bot.ts: только тикеты поддержки
// Раньше все три использовали один и тот же BOT_SECRET — утечка секрета из
// самого нагруженного и открытого юзер-бота давала полный админский доступ.

import { timingSafeEqual } from 'crypto';

function requireSecret(envVar: string): string {
  const value = process.env[envVar];
  if (!value) throw new Error(`${envVar} is required — server refuses to start without it`);
  return value;
}

/**
 * Сравнение через timingSafeEqual — секрет открывает доступ к внутренним
 * bot-эндпоинтам, обычное `!==` даёт микроскопическую, но ненулевую утечку
 * через тайминг посимвольного сравнения.
 */
function makeSecretChecker(secret: string, headerName: string) {
  const secretBuf = Buffer.from(secret);
  return function check(request: any, reply: any): boolean {
    const provided = (request.headers[headerName] ?? '') as string;
    const buf = Buffer.from(provided);
    const matches = buf.length === secretBuf.length && timingSafeEqual(buf, secretBuf);
    if (!matches) {
      reply.code(401).send({ error: 'Unauthorized' });
      return false;
    }
    return true;
  };
}

export const BOT_SECRET = requireSecret('BOT_SECRET');
export const ADMIN_BOT_SECRET = requireSecret('ADMIN_BOT_SECRET');
export const SUPPORT_BOT_SECRET = requireSecret('SUPPORT_BOT_SECRET');

/** true — секрет верный, можно продолжать. Иначе сама отправляет 401 и возвращает false. */
export const checkBotSecret = makeSecretChecker(BOT_SECRET, 'x-bot-secret');
export const checkAdminSecret = makeSecretChecker(ADMIN_BOT_SECRET, 'x-admin-bot-secret');
export const checkSupportBotSecret = makeSecretChecker(SUPPORT_BOT_SECRET, 'x-support-bot-secret');
