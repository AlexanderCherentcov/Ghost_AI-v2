import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
}

// Расширяем FastifyRequest типом user из JWT
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email?: string };
    user: { userId: string; email?: string };
  }
}
