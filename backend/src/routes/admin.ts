import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { PLANS } from '../services/yokassa.js';

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
  plan:   z.enum(['FREE', 'BASIC', 'STANDARD', 'PRO', 'ULTRA']),
});

const resetSchema = z.object({
  userId: z.string().min(1),
});

const setlimitsSchema = z.object({
  userId: z.string().min(1),
  chat:   z.number().int().optional(),   // std_messages_daily_limit (-1 = unlimited)
  pro:    z.number().int().optional(),   // pro_messages_daily_limit
  img:    z.number().int().optional(),   // images_daily_limit
  video:  z.number().int().optional(),   // videos_daily_limit
  files:  z.number().int().optional(),   // files_monthly_limit
});

const addlimitsSchema = z.object({
  userId: z.string().min(1),
  chat:   z.number().int().optional(),
  pro:    z.number().int().optional(),
  img:    z.number().int().optional(),
  video:  z.number().int().optional(),
  files:  z.number().int().optional(),
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
  std_messages_today: true,
  pro_messages_today: true,
  images_today: true,
  videos_today: true,
  files_used: true,
  std_messages_daily_limit: true,
  pro_messages_daily_limit: true,
  images_daily_limit: true,
  videos_daily_limit: true,
  files_monthly_limit: true,
  day_start: true,
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
  // ?page=1&limit=15&search=<query>
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

  // ── POST /api/admin/resetlimits ────────────────────────────────────────────
  fastify.post('/admin/resetlimits', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { userId } = resetSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
    if (!user) return reply.code(404).send({ error: 'User not found' });

    const limits = (PLANS as Record<string, typeof PLANS[keyof typeof PLANS]>)[user.plan] ?? PLANS['FREE'];
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

  // ── POST /api/admin/setlimits ──────────────────────────────────────────────
  // Set absolute limit values. -1 = unlimited.
  fastify.post('/admin/setlimits', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const body = setlimitsSchema.parse(request.body);
    const data: Record<string, number> = {};
    if (body.chat  !== undefined) data.std_messages_daily_limit = body.chat;
    if (body.pro   !== undefined) data.pro_messages_daily_limit = body.pro;
    if (body.img   !== undefined) data.images_daily_limit       = body.img;
    if (body.video !== undefined) data.videos_daily_limit       = body.video;
    if (body.files !== undefined) data.files_monthly_limit      = body.files;

    if (Object.keys(data).length === 0) {
      return reply.code(400).send({ error: 'No limits specified' });
    }

    await prisma.user.update({ where: { id: body.userId }, data });
    return reply.send({ ok: true, updated: data });
  });

  // ── POST /api/admin/addlimits ──────────────────────────────────────────────
  // Add N to current limit values.
  fastify.post('/admin/addlimits', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const body = addlimitsSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: {
        std_messages_daily_limit: true,
        pro_messages_daily_limit: true,
        images_daily_limit: true,
        videos_daily_limit: true,
        files_monthly_limit: true,
      },
    });
    if (!user) return reply.code(404).send({ error: 'User not found' });

    const data: Record<string, number> = {};
    // For unlimited (-1) fields, keep unlimited; otherwise add.
    if (body.chat  !== undefined && user.std_messages_daily_limit !== -1)
      data.std_messages_daily_limit = user.std_messages_daily_limit + body.chat;
    if (body.pro   !== undefined && user.pro_messages_daily_limit !== -1)
      data.pro_messages_daily_limit = user.pro_messages_daily_limit + body.pro;
    if (body.img   !== undefined && user.images_daily_limit !== -1)
      data.images_daily_limit       = user.images_daily_limit + body.img;
    if (body.video !== undefined && user.videos_daily_limit !== -1)
      data.videos_daily_limit       = user.videos_daily_limit + body.video;
    if (body.files !== undefined && user.files_monthly_limit !== -1)
      data.files_monthly_limit      = user.files_monthly_limit + body.files;

    if (Object.keys(data).length === 0) {
      return reply.send({ ok: true, note: 'All targeted limits are already unlimited' });
    }

    await prisma.user.update({ where: { id: body.userId }, data });
    return reply.send({ ok: true, updated: data });
  });

  // ── POST /api/admin/ban ────────────────────────────────────────────────────
  // Ban: set all limits to 0 + set Redis ban flag.
  // Unban: restore plan defaults + remove Redis flag.
  fastify.post('/admin/ban', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { userId, unban } = banSchema.parse(request.body);

    if (unban) {
      // Restore plan defaults
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
      if (!user) return reply.code(404).send({ error: 'User not found' });
      const limits = (PLANS as Record<string, typeof PLANS[keyof typeof PLANS]>)[user.plan] ?? PLANS['FREE'];
      await prisma.user.update({
        where: { id: userId },
        data: {
          std_messages_daily_limit: limits.std_messages_daily,
          pro_messages_daily_limit: limits.pro_messages_daily,
          images_daily_limit:       limits.images_daily,
          videos_daily_limit:       limits.videos_daily,
          files_monthly_limit:      limits.files_monthly,
        },
      });
      await redis.del(`banned:${userId}`);
    } else {
      await prisma.user.update({
        where: { id: userId },
        data: {
          std_messages_daily_limit: 0,
          pro_messages_daily_limit: 0,
          images_daily_limit:       0,
          videos_daily_limit:       0,
          files_monthly_limit:      0,
        },
      });
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
