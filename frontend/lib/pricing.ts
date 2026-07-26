// Общие хелперы для отображения цен на сайте.
// Сами цифры (тарифы, тиры докупки Caspers) сюда НЕ зашиваются —
// они приходят с бэкенда через GET /plans (единый источник правды: backend/src/config/plans.ts).
// Здесь только чистая математика, 1:1 повторяющая расчёт на бэкенде, чтобы сумма
// на экране совпадала с суммой, которую реально спишет yokassa.ts.

import type { CasperPriceTier } from './api';

/** Итоговая цена докупки N Caspers по ступенчатым тирам. */
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
  // Округление до копеек — как в backend/src/config/plans.ts, иначе сумма на экране
  // разойдётся с суммой, которую реально спишет YooKassa.
  return Math.round(total * 100) / 100;
}

export function pricePerCasper(amount: number, tiers: CasperPriceTier[]): number {
  if (amount <= 0) return tiers[0]?.price ?? 0;
  const total = calculateCasperPrice(amount, tiers);
  return Math.round((total / amount) * 10) / 10;
}

/**
 * Маркетинговая зачёркнутая цена (см. пояснение "Pricing philosophy" в backend/src/config/plans.ts):
 * месячная = реальная × 2, годовая = фейковая месячная × 12.
 */
export function fakeCyclePrice(price: number, cycle: 'monthly' | 'yearly'): number {
  const fakeMonthly = price * 2;
  return cycle === 'yearly' ? fakeMonthly * 12 : fakeMonthly;
}

/**
 * Маркетинговая строка про бесплатный тариф — единственное место, где она
 * собирается. Раньше этот текст был захардкожен по всему сайту (лендинг,
 * логин, регистрация, billing) с зашитыми внутрь цифрами 100/5 — при смене
 * приветственного бонуса или дневного лимита пришлось бы искать все копии.
 */
export function freeTierTagline(welcomeCaspers: number, dailyMessages: number): string {
  return `🎁 ${welcomeCaspers} Caspers · ${dailyMessages} сообщений/день · всё остальное за Caspers`;
}
