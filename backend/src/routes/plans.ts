import type { FastifyInstance } from 'fastify';
import { PLANS, FREE_LIMITS, CASPER_COSTS, CASPER_PRICE_TIERS } from '../config/plans.js';

/**
 * Public endpoint — no auth required.
 * Returns all plan data so frontend and miniapp stay in sync with backend.
 */
export default async function plansRoutes(fastify: FastifyInstance) {
  fastify.get('/plans', async (_request, reply) => {
    const paid = (['BASIC', 'PRO', 'VIP', 'ULTRA'] as const).map((key) => {
      const p = PLANS[key];
      return {
        key:             p.key,
        label:           p.label,
        price:           p.price,
        price_yearly:    p.price_yearly,
        caspers_monthly: p.caspers_monthly,
        pro_free_daily:  p.pro_free_daily,
        badge:           p.badge,
        popular:         p.popular,
        features:        p.features,
      };
    });

    return reply.send({
      plans: paid,
      free: {
        ...PLANS.FREE,
        limits: FREE_LIMITS,
      },
      casper_costs: CASPER_COSTS,
      casper_price_tiers: CASPER_PRICE_TIERS,
    });
  });
}
