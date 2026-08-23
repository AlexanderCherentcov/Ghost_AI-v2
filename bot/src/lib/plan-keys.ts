// Ключи планов — единственное место в bot/, откуда их берут bot.ts и admin-bot.ts.
// Должны совпадать с PLAN_KEYS из backend/src/config/plans.ts.
export const PLAN_KEYS = ['FREE', 'START', 'BASIC', 'PRO', 'PRO_PLUS', 'VIP', 'ULTRA'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

/** Сравнение тарифов по порядку — та же логика, что planAtLeast в backend/src/config/plans.ts и frontend/lib/utils.ts. */
export function planAtLeast(userPlan: string, required: string): boolean {
  return PLAN_KEYS.indexOf(userPlan as PlanKey) >= PLAN_KEYS.indexOf(required as PlanKey);
}
