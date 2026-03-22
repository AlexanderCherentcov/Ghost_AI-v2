import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createPayment, processWebhook, PLANS, TOKEN_PACKS } from '../services/yokassa.js';
import { prisma } from '../lib/prisma.js';

const createPaymentSchema = z.object({
  type: z.enum(['TOKEN_PACK', 'SUBSCRIPTION']),
  key: z.string(),
  returnUrl: z.string().url().optional(),
});

export default async function paymentRoutes(fastify: FastifyInstance) {
  // ── Create payment ────────────────────────────────────────────────────────
  fastify.post('/payments/create', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { type, key, returnUrl } = createPaymentSchema.parse(request.body);

      // Validate key
      const validKeys =
        type === 'SUBSCRIPTION'
          ? Object.keys(PLANS)
          : Object.keys(TOKEN_PACKS);

      if (!validKeys.includes(key)) {
        return reply.code(400).send({ error: 'Invalid plan/pack key' });
      }

      const frontendUrl = process.env.FRONTEND_URL ?? 'https://ghostline.ai';
      const effectiveReturnUrl =
        returnUrl ?? `${frontendUrl}/billing/success`;

      const result = await createPayment(userId, type, key as any, effectiveReturnUrl);
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

  // ── Payment history ───────────────────────────────────────────────────────
  fastify.get('/payments', {
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      const { userId } = request.user;
      const query = request.query as { page?: string };
      const page = parseInt(query.page ?? '1');
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
  fastify.get('/plans', async () => ({
    plans: PLANS,
    packs: TOKEN_PACKS,
  }));
}
