import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { PLANS } from '../services/yokassa.js';

const BOT_SECRET = process.env.BOT_SECRET ?? '';

function checkBotSecret(request: any, reply: any) {
  if (request.headers['x-bot-secret'] !== BOT_SECRET || !BOT_SECRET) {
    reply.code(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

const setplanSchema = z.object({
  userId: z.string().min(1),
  plan:   z.enum(['FREE', 'BASIC', 'STANDARD', 'PRO', 'ULTRA']),
});

const resetSchema = z.object({
  userId: z.string().min(1),
});

const adminRoutes: FastifyPluginAsync = async (fastify) => {

  // POST /api/admin/setplan
  fastify.post('/admin/setplan', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { userId, plan } = setplanSchema.parse(request.body);
    const limits = PLANS[plan];
    if (!limits) return reply.code(400).send({ error: 'Unknown plan' });

    const periodStart = new Date();
    const periodEnd   = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.user.update({
      where: { id: userId },
      data: {
        plan,
        period_start:             periodStart,
        planExpiresAt:            periodEnd,
        std_messages_daily_limit: limits.std_messages_daily,
        pro_messages_daily_limit: limits.pro_messages_daily,
        images_daily_limit:       limits.images_daily,
        videos_daily_limit:       limits.videos_daily,
        files_monthly_limit:      limits.files_monthly,
      },
    });

    return reply.send({ ok: true, plan });
  });

  // POST /api/admin/resetlimits
  fastify.post('/admin/resetlimits', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { userId } = resetSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
    if (!user) return reply.code(404).send({ error: 'User not found' });

    const limits = PLANS[user.plan] ?? PLANS['FREE'];
    const today  = new Date();

    await prisma.user.update({
      where: { id: userId },
      data: {
        std_messages_today: 0,
        pro_messages_today: 0,
        images_today:       0,
        videos_today:       0,
        files_used:         0,
        day_start:          today,
        period_start:       today,
        std_messages_daily_limit: limits.std_messages_daily,
        pro_messages_daily_limit: limits.pro_messages_daily,
        images_daily_limit:       limits.images_daily,
        videos_daily_limit:       limits.videos_daily,
        files_monthly_limit:      limits.files_monthly,
      },
    });

    return reply.send({ ok: true });
  });
};

export default adminRoutes;
