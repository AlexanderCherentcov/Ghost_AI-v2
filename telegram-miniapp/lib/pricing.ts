// Общие хелперы для отображения цен в мини-аппе.
// Тиры докупки Caspers приходят с бэкенда через GET /plans (единый источник правды:
// backend/src/config/plans.ts) — здесь только чистая математика, 1:1 повторяющая
// расчёт на бэкенде, чтобы сумма на экране совпадала с суммой, которую спишет YooKassa.

export interface CasperPriceTier {
  max: number;
  price: number;
}

export function calculateCasperPrice(amount: number, tiers: CasperPriceTier[]): number {
  if (amount <= 0) return 0;
  let total = 0;
  let remaining = amount;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const inTier = Math.min(remaining, tier.max);
    total += inTier * tier.price;
    remaining -= inTier;
  }
  // Округление до копеек — как в backend/src/config/plans.ts
  return Math.round(total * 100) / 100;
}

/**
 * Маркетинговая зачёркнутая цена (см. "Pricing philosophy" в backend/src/config/plans.ts):
 * месячная = реальная × 2, годовая = фейковая месячная × 12.
 */
export function fakeCyclePrice(price: number, cycle: 'monthly' | 'yearly'): number {
  const fakeMonthly = price * 2;
  return cycle === 'yearly' ? fakeMonthly * 12 : fakeMonthly;
}
