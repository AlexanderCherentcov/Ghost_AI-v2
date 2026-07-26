import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { redeemCaspersPromo, previewDiscountPromo, PromoError } from '../services/promo.js';
import { PLANS } from '../services/yokassa.js';

const redeemSchema = z.object({
  code: z.string().min(1).max(40),
});

const previewSchema = z.object({
  code: z.string().min(1).max(40),
  plan: z.string(),
});

export default async function promoRoutes(fastify: FastifyInstance) {
  // ── Redeem a CASPERS-type promo code immediately ──────────────────────────
  fastify.post('/promo/redeem', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { code } = redeemSchema.parse(request.body);
      try {
        const result = await redeemCaspersPromo(code, userId);
        return { ok: true, casperAmount: result.casperAmount };
      } catch (err: any) {
        if (err instanceof PromoError) {
          return reply.code(400).send({ error: err.message, code: err.code });
        }
        throw err;
      }
    },
  });

  // ── Preview a DISCOUNT_PERCENT promo before checkout (no side effects) ───
  fastify.post('/promo/preview', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { code, plan } = previewSchema.parse(request.body);
      if (!Object.keys(PLANS).includes(plan)) {
        return reply.code(400).send({ error: 'Invalid plan key' });
      }
      try {
        const result = await previewDiscountPromo(code, userId, plan as any);
        return { ok: true, discountPercent: result.discountPercent, code: result.code };
      } catch (err: any) {
        if (err instanceof PromoError) {
          return reply.code(400).send({ error: err.message, code: err.code });
        }
        throw err;
      }
    },
  });
}
