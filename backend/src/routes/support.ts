import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { checkBotSecret } from '../lib/bot-auth.js';
import {
  getOrCreateOpenTicket, appendUserMessage, appendAdminReply,
  takeTicket, closeTicket, reopenTicket, findTicketByTopicId,
} from '../services/support-tickets.js';

const messageSchema = z.object({
  message: z.string().min(5).max(2000),
  email:   z.string().email().optional(),
});

const replySchema = z.object({
  text: z.string().min(1).max(4000),
});

const takeSchema = z.object({
  adminId:   z.string().min(1),
  adminName: z.string().min(1),
});

const telegramMessageSchema = z.object({
  telegramId:  z.string().min(1),
  text:        z.string().min(1).max(2000),
  displayName: z.string().optional(),
});

const supportRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Пользователь/гость пишет в поддержку — работает и с сайта, и из бота ──
  // (бот шлёт тот же JWT, что и обычные API-запросы сессии пользователя)
  fastify.post('/support/message', async (request, reply) => {
    const body = messageSchema.parse(request.body);

    let userId: string | null = null;
    let telegramId: string | null = null;
    let guestEmail = body.email;
    let displayName: string | undefined;

    try {
      await request.jwtVerify();
      const sub = (request.user as unknown as { userId: string }).userId;
      const user = await prisma.user.findUnique({
        where: { id: sub },
        select: { id: true, telegramId: true, email: true, name: true },
      });
      if (user) {
        userId      = user.id;
        telegramId  = user.telegramId;
        guestEmail  = guestEmail ?? user.email ?? undefined;
        displayName = user.name ?? undefined;
      }
    } catch {
      // анонимный запрос с сайта — используем email из тела, гостя не идентифицируем
    }

    const ticket = await getOrCreateOpenTicket({ userId, telegramId, guestEmail, displayName });
    await appendUserMessage(ticket, body.message);

    return reply.send({ ok: true });
  });

  // ── Пользователь пишет напрямую боту поддержки (bot-secret, нет JWT-сессии) ──
  // В отличие от /support/message (сайт/основной бот, есть access-токен),
  // сюда стучится support-bot от лица пользователя — известен только его
  // Telegram ID, поэтому userId резолвим здесь по telegramId в БД.
  fastify.post('/admin/support/message-from-telegram', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;
    const { telegramId, text, displayName } = telegramMessageSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { id: true, name: true },
    });

    const ticket = await getOrCreateOpenTicket({
      userId: user?.id ?? null,
      telegramId,
      displayName: user?.name ?? displayName,
    });
    await appendUserMessage(ticket, text);

    return reply.send({ ok: true, knownUser: !!user });
  });

  // ── Операторские действия из группы поддержки (вызывает admin-bot, bot-secret) ──

  fastify.post('/admin/support/tickets/:id/take', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;
    const { id } = request.params as { id: string };
    const { adminId, adminName } = takeSchema.parse(request.body);
    const ticket = await takeTicket(id, adminId, adminName);
    if (!ticket) return reply.code(409).send({ error: 'Тикет не найден или уже закрыт' });
    return { ok: true, ticket };
  });

  fastify.post('/admin/support/tickets/:id/close', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;
    const { id } = request.params as { id: string };
    const ticket = await closeTicket(id);
    if (!ticket) return reply.code(409).send({ error: 'Тикет не найден или уже закрыт' });
    return { ok: true, ticket };
  });

  fastify.post('/admin/support/tickets/:id/reopen', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;
    const { id } = request.params as { id: string };
    const ticket = await reopenTicket(id);
    if (!ticket) return reply.code(409).send({ error: 'Тикет не найден или не закрыт' });
    return { ok: true, ticket };
  });

  fastify.post('/admin/support/tickets/:id/reply', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;
    const { id } = request.params as { id: string };
    const { text } = replySchema.parse(request.body);
    const result = await appendAdminReply(id, text);
    if (!result.ok && result.reason === 'not_found') return reply.code(404).send(result);
    return reply.send(result);
  });

  fastify.get('/admin/support/tickets/by-topic/:topicId', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;
    const { topicId } = request.params as { topicId: string };
    const parsed = parseInt(topicId, 10);
    if (!Number.isFinite(parsed)) return reply.code(400).send({ error: 'topicId должен быть числом' });
    const ticket = await findTicketByTopicId(parsed);
    if (!ticket) return reply.code(404).send({ error: 'Тикет не найден' });
    return ticket;
  });
};

export default supportRoutes;
