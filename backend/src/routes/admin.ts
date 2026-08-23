import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { PLANS } from '../services/yokassa.js';
import { grantCaspers } from '../services/tokens.js';
import { createPromoCode, deletePromoCode, normalizePromoCode, PromoError } from '../services/promo.js';
import { checkBotSecret } from '../lib/bot-auth.js';
import { USAGE_COUNTERS_SELECT } from '../lib/user-select.js';
import { getMaintenanceState, setMaintenanceState } from '../lib/maintenance.js';

// ─── Схемы ─────────────────────────────────────────────────────────────────────

const setplanSchema = z.object({
  userId: z.string().min(1),
  plan:   z.enum(['FREE', 'START', 'BASIC', 'PRO', 'PRO_PLUS', 'VIP', 'ULTRA']),
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

const maintenanceSchema = z.object({
  active: z.boolean(),
  until:  z.string().datetime().nullable().optional(),
});

const createPromoSchema = z.object({
  code:            z.string().min(3).max(40),
  rewardType:      z.enum(['CASPERS', 'DISCOUNT_PERCENT']),
  casperAmount:    z.number().int().min(1).optional(),
  discountPercent: z.number().int().min(1).max(100).optional(),
  applicablePlans: z.array(z.enum(['FREE', 'START', 'BASIC', 'PRO', 'PRO_PLUS', 'VIP', 'ULTRA'])).optional(),
  maxUses:         z.number().int().min(1).optional(),
  expiresAt:       z.string().datetime().optional(),
  createdBy:       z.string().optional(),
});

// ─── Набор полей пользователя ──────────────────────────────────────────────────

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  telegramId: true,
  plan: true,
  planExpiresAt: true,
  billing: true,
  ...USAGE_COUNTERS_SELECT,
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

// ─── Роуты ─────────────────────────────────────────────────────────────────────

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

    // Прикрепляем статус бана
    const bannedKeys = users.length > 0 ? await redis.mget(...users.map(u => `banned:${u.id}`)) : [];
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
        // Сбрасываем недельные счётчики
        images_this_week: 0,
        music_this_week:  0,
        videos_this_month: 0,
        week_start: new Date(),
      },
    });

    // Начисляем Caspers за тариф
    if (planInfo.caspers_monthly > 0) {
      await grantCaspers(userId, planInfo.caspers_monthly, planInfo.caspers_monthly, `admin_setplan_${plan.toLowerCase()}`);
    } else {
      // FREE-тариф: обнуляем
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
        videos_this_month:   0,
        day_start:   today,
        week_start:  today,
        period_start: today,
      },
    });

    return reply.send({ ok: true });
  });

  // ── POST /api/admin/addcaspers ─────────────────────────────────────────────
  // Начислить Caspers на баланс пользователя напрямую.
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

  // ── POST /api/admin/subcaspers ────────────────────────────────────────────
  // Списать Caspers с баланса пользователя (не уходит ниже 0).
  fastify.post('/admin/subcaspers', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { userId, amount } = addCaspersSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { caspers_balance: true } });
    if (!user) return reply.code(404).send({ error: 'User not found' });

    const deduct = Math.min(amount, user.caspers_balance);
    await prisma.user.update({
      where: { id: userId },
      data: { caspers_balance: { decrement: deduct } },
    });
    await prisma.casperTransaction.create({
      data: { userId, amount: -deduct, reason: 'admin_deduct' },
    });

    return reply.send({ ok: true, removed: deduct });
  });

  // ── POST /api/admin/ban ────────────────────────────────────────────────────
  fastify.post('/admin/ban', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { userId, unban } = banSchema.parse(request.body);

    if (unban) {
      await redis.del(`banned:${userId}`);
    } else {
      // Флаг бана в Redis на 365 дней (обновляется при каждом вызове бана)
      await redis.set(`banned:${userId}`, '1', 'EX', 60 * 60 * 24 * 365);
    }

    return reply.send({ ok: true, banned: !unban });
  });

  // ── GET /api/admin/stats ───────────────────────────────────────────────────
  fastify.get('/admin/stats', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      newToday,
      newThisMonth,
      messagesToday,
      chatToday,
      proChatToday,
      imagesToday,
      musicToday,
      videosToday,
      genToday,
      caspersSpentToday,
      paymentsToday,
      revenueToday,
      paymentsThisMonth,
      revenueThisMonth,
      revenueTotal,
      planCounts,
    ] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.message.count({ where: { createdAt: { gte: todayStart }, role: 'user' } }),
      prisma.message.count({ where: { createdAt: { gte: todayStart }, role: 'user', mode: 'chat' } }),
      prisma.message.count({ where: { createdAt: { gte: todayStart }, role: 'user', mode: 'think' } }),
      prisma.generateJob.count({ where: { createdAt: { gte: todayStart }, mode: 'vision' } }),
      prisma.generateJob.count({ where: { createdAt: { gte: todayStart }, mode: 'sound' } }),
      prisma.generateJob.count({ where: { createdAt: { gte: todayStart }, mode: 'reel' } }),
      prisma.generateJob.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.casperTransaction.aggregate({
        where: { createdAt: { gte: todayStart }, amount: { lt: 0 } },
        _sum: { amount: true },
      }),
      prisma.payment.count({ where: { createdAt: { gte: todayStart }, status: 'SUCCEEDED' } }),
      prisma.payment.aggregate({
        where: { createdAt: { gte: todayStart }, status: 'SUCCEEDED' },
        _sum: { amount: true },
      }),
      prisma.payment.count({ where: { createdAt: { gte: monthStart }, status: 'SUCCEEDED' } }),
      prisma.payment.aggregate({
        where: { createdAt: { gte: monthStart }, status: 'SUCCEEDED' },
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
      newThisMonth,
      messagesToday,
      chatToday,
      proChatToday,
      imagesToday,
      musicToday,
      videosToday,
      genToday,
      caspersSpentToday: Math.abs(caspersSpentToday._sum.amount ?? 0),
      paymentsToday,
      revenueToday: revenueToday._sum.amount ?? 0,
      paymentsThisMonth,
      revenueThisMonth: revenueThisMonth._sum.amount ?? 0,
      revenueTotal:  revenueTotal._sum.amount ?? 0,
      planCounts: planCountsMap,
    };
  });

  // ── POST /api/admin/promo/create ───────────────────────────────────────────
  fastify.post('/admin/promo/create', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const input = createPromoSchema.parse(request.body);
    if (input.rewardType === 'CASPERS' && !input.casperAmount) {
      return reply.code(400).send({ error: 'casperAmount обязателен для типа CASPERS' });
    }
    if (input.rewardType === 'DISCOUNT_PERCENT' && !input.discountPercent) {
      return reply.code(400).send({ error: 'discountPercent обязателен для типа DISCOUNT_PERCENT' });
    }

    try {
      const promo = await createPromoCode({
        ...input,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      });
      return reply.send({ ok: true, promo });
    } catch (err: any) {
      if (err.code === 'P2002') return reply.code(409).send({ error: 'Такой промокод уже существует' });
      throw err;
    }
  });

  // ── GET /api/admin/promo/list ──────────────────────────────────────────────
  fastify.get('/admin/promo/list', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const q = request.query as { page?: string; limit?: string };
    const page  = Math.max(1, parseInt(q.page ?? '1'));
    const limit = Math.min(50, Math.max(1, parseInt(q.limit ?? '10')));

    const [promos, total] = await prisma.$transaction([
      prisma.promoCode.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.promoCode.count(),
    ]);

    return { promos, total, page, limit };
  });

  // ── GET /api/admin/promo/:code — детали + кто активировал ──────────────────
  fastify.get('/admin/promo/:code', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { code } = request.params as { code: string };
    const promo = await prisma.promoCode.findUnique({ where: { code: normalizePromoCode(code) } });
    if (!promo) return reply.code(404).send({ error: 'Промокод не найден' });

    const redemptions = await prisma.promoRedemption.findMany({
      where: { promoCodeId: promo.id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true, telegramId: true } } },
    });

    return { promo, redemptions };
  });

  // ── DELETE /api/admin/promo/:code ──────────────────────────────────────────
  // Полностью удаляет, если ни разу не использовался; иначе деактивирует, чтобы
  // история активаций (кто и что использовал) осталась видна админам.
  fastify.delete('/admin/promo/:code', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { code } = request.params as { code: string };
    try {
      const result = await deletePromoCode(code);
      return reply.send({ ok: true, ...result });
    } catch (err: any) {
      if (err instanceof PromoError) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  // ── GET /api/admin/maintenance — текущий статус тех.работ ──────────────────
  fastify.get('/admin/maintenance', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;
    return getMaintenanceState();
  });

  // ── POST /api/admin/maintenance — включить/выключить тех.работы ────────────
  fastify.post('/admin/maintenance', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const { active, until } = maintenanceSchema.parse(request.body);
    // Новый токен обхода на каждое включение — старая ссылка (если утекла) не
    // переживает следующий цикл тех.работ. Выключили — токен тоже гасим сразу,
    // не дожидаясь истечения until.
    const state = {
      active,
      until: active ? (until ?? null) : null,
      bypassToken: active ? crypto.randomBytes(32).toString('hex') : null,
    };
    await setMaintenanceState(state);
    return reply.send({ ok: true, ...state });
  });
};

export default adminRoutes;
