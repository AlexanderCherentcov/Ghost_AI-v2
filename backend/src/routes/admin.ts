import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { PLANS } from '../services/yokassa.js';
import { grantCaspers } from '../services/tokens.js';

if (!process.env.BOT_SECRET) {
  throw new Error('BOT_SECRET is required — server refuses to start without it');
}
const BOT_SECRET = process.env.BOT_SECRET;

function checkBotSecret(request: any, reply: any): boolean {
  if (request.headers['x-bot-secret'] !== BOT_SECRET) {
    reply.code(403).send({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const setplanSchema = z.object({
  userId: z.string().min(1),
  plan:   z.enum(['FREE', 'BASIC', 'PRO', 'VIP', 'ULTRA']),
});

const resetSchema = z.object({
  userId: z.string().min(1),
});

const addCaspersSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().min(1),
});

const banSchema = z.object({
  userId: z.string().min(1),
  unban:  z.boolean().optional(),
});

// ─── User field selector ───────────────────────────────────────────────────────

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  telegramId: true,
  plan: true,
  planExpiresAt: true,
  billing: true,
  caspers_balance: true,
  caspers_monthly: true,
  std_messages_today: true,
  pro_messages_today: true,
  images_this_week: true,
  music_this_week: true,
  videos_this_week: true,
  day_start: true,
  week_start: true,
  period_start: true,
  onboardingDone: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function getUserWithBanStatus(user: any) {
  const banned = await redis.exists(`banned:${user.id}`);
  return { ...user, isBanned: banned === 1 };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const adminRoutes: FastifyPluginAsync = async (fastify) => {

  // ── GET /api/admin/users ──────────────────────────────────────────────────
  fastify.get('/admin/users', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const q = request.query as { page?: string; limit?: string; search?: string };
    const page   = Math.max(1, parseInt(q.page ?? '1'));
    const limit  = Math.min(50, Math.max(1, parseInt(q.limit ?? '15')));
    const search = (q.search ?? '').trim();

    const where = search
      ? {
          OR: [
            { name:       { contains: search, mode: 'insensitive' as const } },
            { email:      { contains: search, mode: 'insensitive' as const } },
            { telegramId: { contains: search } },
            { id:         { contains: search } },
            { yandexId:   { contains: search } },
            { googleId:   { contains: search } },
          ],
        }
      : {};

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    // Attach ban status
    const bannedKeys = await redis.mget(...users.map(u => `banned:${u.id}`));
    const usersWithBan = users.map((u, i) => ({ ...u, isBanned: bannedKeys[i] === '1' }));

    return { users: usersWithBan, total, page, limit };
  });

  // ── GET /api/admin/users/:id ───────────────────────────────────────────────
  fastify.get('/admin/users/:id', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { id } = request.params as { id: string };
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ id }, { telegramId: id }],
      },
      select: USER_SELECT,
    });

    if (!user) return reply.code(404).send({ error: 'User not found' });
    return getUserWithBanStatus(user);
  });

  // ── POST /api/admin/setplan ────────────────────────────────────────────────
  fastify.post('/admin/setplan', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { userId, plan } = setplanSchema.parse(request.body);
    const planInfo = PLANS[plan as keyof typeof PLANS];
    if (!planInfo) return reply.code(400).send({ error: 'Unknown plan' });

    const periodStart = new Date();
    const periodEnd   = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: plan as any,
        period_start:  periodStart,
        planExpiresAt: periodEnd,
        // Reset weekly counters
        images_this_week: 0,
        music_this_week:  0,
        videos_this_week: 0,
        week_start: new Date(),
      },
    });

    // Grant caspers for the plan
    if (planInfo.caspers_monthly > 0) {
      await grantCaspers(userId, planInfo.caspers_monthly, planInfo.caspers_monthly, `admin_setplan_${plan.toLowerCase()}`);
    } else {
      // FREE plan: set to 0
      await prisma.user.update({
        where: { id: userId },
        data: { caspers_balance: 0, caspers_monthly: 0 },
      });
    }

    return reply.send({ ok: true, plan });
  });

  // ── POST /api/admin/resetlimits ────────────────────────────────────────────
  fastify.post('/admin/resetlimits', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { userId } = resetSchema.parse(request.body);

    const today  = new Date();

    await prisma.user.update({
      where: { id: userId },
      data: {
        std_messages_today: 0,
        pro_messages_today: 0,
        images_this_week:   0,
        music_this_week:    0,
        videos_this_week:   0,
        day_start:   today,
        week_start:  today,
        period_start: today,
      },
    });

    return reply.send({ ok: true });
  });

  // ── POST /api/admin/addcaspers ─────────────────────────────────────────────
  // Add caspers to a user's balance directly.
  fastify.post('/admin/addcaspers', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { userId, amount } = addCaspersSchema.parse(request.body);

    await prisma.user.update({
      where: { id: userId },
      data: { caspers_balance: { increment: amount } },
    });
    await prisma.casperTransaction.create({
      data: { userId, amount, reason: 'admin_grant' },
    });

    return reply.send({ ok: true, added: amount });
  });

  // ── POST /api/admin/ban ────────────────────────────────────────────────────
  fastify.post('/admin/ban', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { userId, unban } = banSchema.parse(request.body);

    if (unban) {
      await redis.del(`banned:${userId}`);
    } else {
      // 365-day ban flag in Redis (refreshed on each ban call)
      await redis.set(`banned:${userId}`, '1', 'EX', 60 * 60 * 24 * 365);
    }

    return reply.send({ ok: true, banned: !unban });
  });

  // ── GET /api/admin/stats ───────────────────────────────────────────────────
  fastify.get('/admin/stats', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      newToday,
      messagesToday,
      genToday,
      paymentsToday,
      revenueToday,
      revenueTotal,
      planCounts,
    ] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.message.count({ where: { createdAt: { gte: todayStart }, role: 'user' } }),
      prisma.generateJob.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.payment.count({ where: { createdAt: { gte: todayStart }, status: 'SUCCEEDED' } }),
      prisma.payment.aggregate({
        where: { createdAt: { gte: todayStart }, status: 'SUCCEEDED' },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: 'SUCCEEDED' },
        _sum: { amount: true },
      }),
      prisma.user.groupBy({ by: ['plan'], _count: { _all: true }, orderBy: { _count: { plan: 'desc' } } }),
    ]);

    const planCountsMap = Object.fromEntries(
      planCounts.map((p: any) => [p.plan, p._count._all])
    );

    return {
      totalUsers,
      newToday,
      messagesToday,
      genToday,
      paymentsToday,
      revenueToday: revenueToday._sum.amount ?? 0,
      revenueTotal:  revenueTotal._sum.amount ?? 0,
      planCounts: planCountsMap,
    };
  });
};

export default adminRoutes;
