/**
 * Ключ и лимиты для @fastify/rate-limit.
 *
 * Реальный IP посетителя до backend не доходит: системный nginx-роутер на 443 пробрасывает TLS
 * на docker-nginx по TCP (stream, порт 4443), поэтому для docker-nginx и backend ВСЕ посетители
 * приходят с одного адреса (172.18.0.1, виден в логах). Лимит «на IP» превращался в один общий
 * бакет на весь сайт: 200 запросов и 20 входов в минуту на всех пользователей сразу — при
 * рекламном трафике сайт начал бы отвечать 429 уже на первых десятках человек.
 * Поэтому: авторизованных считаем по userId из проверенного JWT, а анонимам даём общий, но
 * щедрый потолок (защита от лавины, а не от одного клиента).
 */

function envInt(name: string, fallback: number): number {
  const value = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Значения по умолчанию рассчитаны на «все анонимы под одним IP». Когда до backend начнут доходить
// реальные адреса (TRUST_PROXY=true), анонимные лимиты можно ужесточить через env, не трогая код.
export const USER_RATE_LIMIT_PER_MIN = envInt('RATE_LIMIT_USER_PER_MIN', 300);
export const ANON_RATE_LIMIT_PER_MIN = envInt('RATE_LIMIT_ANON_PER_MIN', 6000);
// Вход/обновление токена и т.п. (auth-scope) — анонимные, и бот-пользователи не лимитируются (см. allowList в app.ts).
export const AUTH_ANON_RATE_LIMIT_PER_MIN = envInt('RATE_LIMIT_AUTH_PER_MIN', 1500);

const USER_KEY_PREFIX = 'u:';

type VerifyJwt = (token: string) => { userId?: string };

interface KeyRequest {
  headers: Record<string, string | string[] | undefined>;
  ip: string;
}

/** verify — проверка подписи JWT (fastify.jwt.verify); непроверенный токен ключом пользователя стать не может. */
export function createRateLimitKey(verify: VerifyJwt) {
  return (req: KeyRequest): string => {
    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      try {
        const { userId } = verify(auth.slice('Bearer '.length));
        if (userId) return `${USER_KEY_PREFIX}${userId}`;
      } catch {
        // Невалидный/просроченный токен — считаем анонимом
      }
    }
    // Если когда-нибудь на входе появится настоящий X-Real-IP (PROXY protocol) — он будет использован.
    const forwarded = process.env.TRUST_PROXY === 'true' ? req.headers['x-real-ip'] : undefined;
    return `ip:${(typeof forwarded === 'string' && forwarded) || req.ip}`;
  };
}

/**
 * Ответ при превышении лимита. statusCode обязателен: без него @fastify/rate-limit пробрасывал ошибку
 * в общий обработчик, и вместо 429 пользователь получал «500 Internal server error».
 */
export function rateLimitErrorBuilder(_req: unknown, context: { after: string }) {
  return {
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Слишком много запросов — повторите через ${context.after}`,
    code: 'RATE_LIMITED',
  };
}

/** Лимит для ключа: у авторизованного — свой, у анонимного общего бакета — anonMax. */
export function rateLimitMax(anonMax: number) {
  return (_req: unknown, key: string): number => (key.startsWith(USER_KEY_PREFIX) ? USER_RATE_LIMIT_PER_MIN : anonMax);
}
