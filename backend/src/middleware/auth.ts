import type { FastifyRequest, FastifyReply } from 'fastify';
import { isUserBanned } from '../lib/ban.js';

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  // Refresh-токен (30 дней) не должен работать как обычный bearer: иначе украденный
  // refresh даёт полный доступ к API в обход ротации по jti. Токены без type
  // (выпущены до появления поля) пропускаем — иначе разлогинит всех разом.
  if (request.user.type === 'refresh') {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  // Бан раньше проверялся только в WS-чате — забаненный свободно ходил в генерации и платежи.
  if (await isUserBanned(request.user.userId)) {
    return reply.code(403).send({ error: 'Аккаунт заблокирован', code: 'BANNED' });
  }
}

// Расширяем FastifyRequest типом user из JWT
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email?: string; type?: string; jti?: string };
    user: { userId: string; email?: string; type?: string; jti?: string };
  }
}
