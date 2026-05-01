import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createPayment, createCasperPayment, processWebhook, PLANS } from '../services/yokassa.js';
import { prisma } from '../lib/prisma.js';

const createPaymentSchema = z.object({
  plan: z.string(),
  returnUrl: z.string().url().optional(),
  billing: z.enum(['monthly', 'yearly']).default('monthly'),
});

const createCasperSchema = z.object({
  amount: z.number().int().min(1).max(1000),
  returnUrl: z.string().url().optional(),
});

export default async function paymentRoutes(fastify: FastifyInstance) {
  // ── Create subscription payment ───────────────────────────────────────────
  fastify.post('/payments/create', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { plan, returnUrl, billing } = createPaymentSchema.parse(request.body);

      const validPlans = Object.keys(PLANS).filter((k) => PLANS[k as keyof typeof PLANS].price > 0);
      if (!validPlans.includes(plan)) {
        return reply.code(400).send({ error: 'Invalid plan key' });
      }

      const frontendUrl = process.env.FRONTEND_URL ?? 'https://ghostlineai.ru';

      if (returnUrl && !returnUrl.startsWith(frontendUrl)) {
        return reply.code(400).send({ error: 'Invalid returnUrl: must start with the frontend URL' });
      }

      const effectiveReturnUrl = returnUrl ?? `${frontendUrl}/billing/success`;

      try {
        const result = await createPayment(userId, plan as any, effectiveReturnUrl, billing);
        return result;
      } catch (err: any) {
        fastify.log.error(err, 'createPayment failed');
        return reply.code(502).send({ error: err.message ?? 'Платёжный сервис недоступен' });
      }
    },
  });

  // ── Create Casper top-up payment ──────────────────────────────────────────
  fastify.post('/payments/caspers/create', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { amount, returnUrl } = createCasperSchema.parse(request.body);

      const frontendUrl = process.env.FRONTEND_URL ?? 'https://ghostlineai.ru';

      if (returnUrl && !returnUrl.startsWith(frontendUrl)) {
        return reply.code(400).send({ error: 'Invalid returnUrl: must start with the frontend URL' });
      }

      const effectiveReturnUrl = returnUrl ?? `${frontendUrl}/billing/success`;

      try {
        const result = await createCasperPayment(userId, amount, effectiveReturnUrl);
        return result;
      } catch (err: any) {
        const statusCode = err.code === 'PLAN_RESTRICTED' ? 403 : 400;
        return reply.code(statusCode).send({ error: err.message, code: err.code });
      }
    },
  });

  // ── YooKassa webhook ──────────────────────────────────────────────────────
  fastify.post('/payments/webhook', async (request, reply) => {
    try {
      await processWebhook(request.body);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      fastify.log.error(err, 'Webhook processing failed');
      return reply.code(400).send({ error: 'Webhook error' });
    }
  });

  // ── Payment status ────────────────────────────────────────────────────────
  fastify.get('/payments/status/:yokassaId', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { yokassaId } = request.params as { yokassaId: string };
      const payment = await prisma.payment.findFirst({
        where: { yokassaId, userId },
        select: { status: true, plan: true, paymentType: true, casperAmount: true },
      });
      if (!payment) return reply.code(404).send({ error: 'Not found' });
      return payment;
    },
  });

  // ── Payment history ───────────────────────────────────────────────────────
  fastify.get('/payments', {
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      const { userId } = request.user;
      const query = request.query as { page?: string };
      const page  = parseInt(query.page ?? '1');
      const limit = 20;
      const [payments, total] = await prisma.$transaction([
        prisma.payment.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.payment.count({ where: { userId } }),
      ]);
      return { payments, total, page, limit };
    },
  });

}
