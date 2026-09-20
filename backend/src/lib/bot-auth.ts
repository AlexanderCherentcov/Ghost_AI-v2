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
function makeSecretMatcher(secret: string, headerName: string) {
  const secretBuf = Buffer.from(secret);
  return function matches(request: any): boolean {
    const provided = (request.headers[headerName] ?? '') as string;
    const buf = Buffer.from(provided);
    return buf.length === secretBuf.length && timingSafeEqual(buf, secretBuf);
  };
}

function makeSecretChecker(matches: (request: any) => boolean) {
  return function check(request: any, reply: any): boolean {
    if (!matches(request)) {
      reply.code(401).send({ error: 'Unauthorized' });
      return false;
    }
    return true;
  };
}

export const BOT_SECRET = requireSecret('BOT_SECRET');
export const ADMIN_BOT_SECRET = requireSecret('ADMIN_BOT_SECRET');
export const SUPPORT_BOT_SECRET = requireSecret('SUPPORT_BOT_SECRET');

const matchesBotSecret = makeSecretMatcher(BOT_SECRET, 'x-bot-secret');
const matchesAdminSecret = makeSecretMatcher(ADMIN_BOT_SECRET, 'x-admin-bot-secret');
const matchesSupportSecret = makeSecretMatcher(SUPPORT_BOT_SECRET, 'x-support-bot-secret');

/** true — секрет верный, можно продолжать. Иначе сама отправляет 401 и возвращает false. */
export const checkBotSecret = makeSecretChecker(matchesBotSecret);
export const checkAdminSecret = makeSecretChecker(matchesAdminSecret);
export const checkSupportBotSecret = makeSecretChecker(matchesSupportSecret);

/**
 * Запрос пришёл от нашего бота (любой из трёх секретов верный) — без отправки ответа.
 * Нужен rate-limit'у: боты ходят в backend напрямую, у всех один IP контейнера, и
 * общий лимит 20/мин на IP душил бы всех пользователей бота разом.
 */
export function hasInternalBotSecret(request: any): boolean {
  return matchesBotSecret(request) || matchesAdminSecret(request) || matchesSupportSecret(request);
}
