// Общие хелперы для отображения цен на сайте.
// Сами цифры (тарифы, тиры докупки Caspers) сюда НЕ зашиваются —
// они приходят с бэкенда через GET /plans (единый источник правды: backend/src/config/plans.ts).
// Здесь только чистая математика, 1:1 повторяющая расчёт на бэкенде, чтобы сумма
// на экране совпадала с суммой, которую реально спишет yokassa.ts.

import type { CasperPriceTier, ImageModelOption, VideoModelOption } from './api';

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
 * логин, регистрация, billing) с зашитыми внутрь цифрами — при смене
 * приветственного бонуса/лимита пришлось бы искать все копии.
 *
 * Приветственный бонус убран (FREE_WELCOME_CASPERS: 0, см. plans.ts) — по
 * решению Александра 2026-08-25, экономически не окупался: на 100 Caspers
 * можно было полностью попробовать платные функции без единой оплаты.
 * Вместо него — дневной лимит на бесплатный чат (FREE_LIMITS.chat_daily).
 */
export function freeTierTagline(chatDailyLimit: number): string {
  return `${chatDailyLimit} бесплатных сообщений в день · картинки и музыка за Caspers`;
}

/**
 * Самая дешёвая модель в каждом домене (image/video берутся из живого /api/plans,
 * music — фиксированная цена CASPER_COSTS.music_generate, для музыки пока нет
 * реестра моделей). Используется, чтобы честно посчитать "до скольки
 * картинок/видео/треков хватит Caspers на тарифе" — не выдумывая цифры руками.
 * Одно место для лендинга и /billing — раньше эта математика жила бы в двух копиях.
 */
export interface CheapestCosts {
  image: number;
  video: number;
  music: number;
}

export function cheapestCosts(
  imageModels: ImageModelOption[],
  videoModels: VideoModelOption[],
  musicGenerateCost: number,
): CheapestCosts {
  return {
    image: imageModels.length ? Math.min(...imageModels.map((m) => m.cost)) : 0,
    video: videoModels.length ? Math.min(...videoModels.map((m) => m.cost['4s'])) : 0,
    music: musicGenerateCost,
  };
}

/** "До скольки X хватит N Caspers" — целое число, округление вниз (честный минимум). */
export function maxGenerations(caspersMonthly: number, unitCost: number): number {
  if (unitCost <= 0) return 0;
  return Math.floor(caspersMonthly / unitCost);
}
