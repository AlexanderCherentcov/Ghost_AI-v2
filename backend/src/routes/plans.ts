import type { FastifyInstance } from 'fastify';
import { PLANS, PLAN_KEYS, FREE_LIMITS, FREE_WELCOME_CASPERS, CASPER_COSTS, CASPER_PRICE_TIERS } from '../config/plans.js';
import { AUTO_MIN_COST, AUTO_MODEL_ID, CHAT_MODELS, IMAGE_MODELS, VIDEO_MODELS } from '../config/models.js';
import { TTS_VOICES } from '../config/tts-voices.js';

/**
 * Публичная проекция реестра моделей — без provider/providerModel/goapiModel и т.п.
 * (это детали реализации бэкенда, не то, что должен видеть клиент). Сайт, бот и
 * будущие приложения читают модели ТОЛЬКО отсюда — не хранят свой список/цены.
 */
function publicModels() {
  return {
    chat: [
      { id: AUTO_MODEL_ID, label: 'GhostLine', blurb: 'Экономит Caspers', cost: AUTO_MIN_COST, minPlan: 'FREE', capabilities: {} },
      ...CHAT_MODELS.map((m) => ({ id: m.id, label: m.label, blurb: m.blurb, cost: m.cost, minPlan: m.minPlan, capabilities: m.capabilities ?? {} })),
    ],
    image: IMAGE_MODELS.map((m) => ({
      id: m.id, label: m.label, blurb: m.blurb, cost: m.cost, minPlan: m.minPlan, capabilities: m.capabilities ?? {},
      ui: m.ui, previewImageUrl: m.previewImageUrl,
    })),
    video: VIDEO_MODELS.map((m) => ({
      id: m.id, label: m.label, blurb: m.blurb, minPlan: m.minPlan, capabilities: m.capabilities ?? {},
      cost: { '4s': m.cost('4s'), '8s': m.cost('8s') },
      audioCostMultiplier: m.audioCostMultiplier,
      ui: m.ui, previewVideoUrl: m.previewVideoUrl,
    })),
  };
}

/**
 * Публичный эндпоинт — авторизация не требуется.
 * Отдаёт все данные о тарифах, чтобы frontend и miniapp оставались синхронизированы с бэкендом.
 */
export default async function plansRoutes(fastify: FastifyInstance) {
  fastify.get('/plans', async (_request, reply) => {
    const paid = PLAN_KEYS.filter((key) => key !== 'FREE').map((key) => {
      const p = PLANS[key];
      return {
        key:             p.key,
        label:           p.label,
        description:     p.description,
        price:           p.price,
        price_yearly:    p.price_yearly,
        caspers_monthly: p.caspers_monthly,
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
        welcome_caspers: FREE_WELCOME_CASPERS,
      },
      casper_costs: CASPER_COSTS,
      casper_price_tiers: CASPER_PRICE_TIERS,
      models: publicModels(),
      tts_voices: TTS_VOICES,
    });
  });
}
