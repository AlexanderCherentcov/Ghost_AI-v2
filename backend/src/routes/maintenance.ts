import type { FastifyPluginAsync } from 'fastify';
import { getMaintenanceState } from '../lib/maintenance.js';

const BYPASS_COOKIE = 'ghost_bypass';
const BYPASS_MAX_AGE_SEC = 60 * 60 * 24; // 24ч — обход надо будет один раз подтвердить ссылкой в сутки

/**
 * Публичный, без авторизации — сайту и боту нужно знать статус тех.работ ещё
 * до того, как пользователь залогинен. Управление статусом (запись) живёт в
 * routes/admin.ts, за bot-secret — сюда только чтение.
 *
 * Обход для Александра: admin-bot при включении тех.работ генерирует
 * одноразовый bypassToken (см. lib/maintenance.ts) и присылает ссылку вида
 * /?bypass=ТОКЕН. Токен живёт ровно пока активны тех.работы — сброшен вручную
 * или истёк until → getMaintenanceState() возвращает bypassToken: null, и
 * старая ссылка/cookie автоматически перестают действовать.
 *
 * Сам токен наружу НИКОГДА не отдаём (ни в теле ответа, ни иначе) — только
 * сверяем присланное значение с тем, что лежит в Redis.
 */
const maintenanceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/maintenance', async (request, reply) => {
    const state = await getMaintenanceState();
    const query = request.query as { bypass?: string };
    const cookieToken = request.cookies?.[BYPASS_COOKIE];
    const validToken = state.bypassToken; // null, если тех.работы выключены — сверять не с чем
    const bypassed = !!validToken && (query.bypass === validToken || cookieToken === validToken);

    if (validToken && query.bypass === validToken && cookieToken !== validToken) {
      reply.setCookie(BYPASS_COOKIE, validToken, {
        path: '/', maxAge: BYPASS_MAX_AGE_SEC, httpOnly: true, sameSite: 'lax', secure: true,
      });
    }

    return { active: state.active, until: state.until, bypass: bypassed };
  });
};

export default maintenanceRoutes;
