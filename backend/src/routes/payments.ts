import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createPayment, processWebhook, PLANS } from '../services/yokassa.js';
import { prisma } from '../lib/prisma.js';

const createPaymentSchema = z.object({
  plan: z.string(),
  returnUrl: z.string().url().optional(),
  billing: z.enum(['monthly', 'yearly']).default('monthly'),
});

export default async function paymentRoutes(fastify: FastifyInstance) {
  // ── Create payment ────────────────────────────────────────────────────────
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
      const effectiveReturnUrl = returnUrl ?? `${frontendUrl}/billing/success`;

      const result = await createPayment(userId, plan as any, effectiveReturnUrl, billing);
      return result;
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
        select: { status: true, plan: true },
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

  // ── Plans info (public) ───────────────────────────────────────────────────
  fastify.get('/plans', async () => ({ plans: PLANS }));
}
