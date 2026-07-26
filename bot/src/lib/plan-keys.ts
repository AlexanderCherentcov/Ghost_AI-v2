// Ключи планов — единственное место в bot/, откуда их берут bot.ts и admin-bot.ts.
// Должны совпадать с PLAN_KEYS из backend/src/config/plans.ts.
export const PLAN_KEYS = ['FREE', 'BASIC', 'PRO', 'VIP', 'ULTRA'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];
