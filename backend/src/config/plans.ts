/**
 * ─── GhostLine AI — Plan Configuration ───────────────────────────────────────
 *
 * SINGLE SOURCE OF TRUTH for all plan data.
 * Used by: yokassa.ts (payments), routes/plans.ts (public API), frontend, miniapp.
 *
 * Pricing philosophy:
 *   - Fake "original" price = real monthly × 2  (marketing 50% off)
 *   - Yearly real price = monthly × 12 × 0.8    (real 20% off vs real monthly)
 *   - Yearly is marketed as "70% скидка" vs the fake original
 */

export const PLAN_KEYS = ['FREE', 'BASIC', 'PRO', 'VIP', 'ULTRA'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface PlanInfo {
  key: PlanKey;
  label: string;
  price: number;        // real monthly price (RUB)
  price_yearly: number; // real yearly price (RUB) = price * 12 * 0.8
  caspers_monthly: number;
  pro_free_daily: number; // -1 = unlimited
  badge: string | null;
  popular: boolean;
  features: string[];
}

export const PLANS: Record<PlanKey, PlanInfo> = {
  FREE: {
    key: 'FREE',
    label: 'Бесплатный',
    price: 0,
    price_yearly: 0,
    caspers_monthly: 0,
    pro_free_daily: 0,
    badge: null,
    popular: false,
    features: [
      'Стандартный чат: 5 сообщений/день',
      'Изображения: 5 в неделю',
      'Музыка: 5 треков в неделю',
      'Видео: 3 в месяц',
    ],
  },
  BASIC: {
    key: 'BASIC',
    label: 'Базовый',
    price: 790,
    price_yearly: 7584, // 790 * 12 * 0.8
    caspers_monthly: 300,
    pro_free_daily: 0,
    badge: null,
    popular: false,
    features: [
      'Стандартный чат: безлимит',
      '300 Caspers в месяц',
      'Про чат: 1 Casper/сообщ.',
      'Изображения — 10 Caspers/шт',
      'Видео — от 25 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
  PRO: {
    key: 'PRO',
    label: 'Про',
    price: 1690,
    price_yearly: 16224, // 1690 * 12 * 0.8
    caspers_monthly: 700,
    pro_free_daily: 20,
    badge: 'Популярный',
    popular: true,
    features: [
      'Стандартный чат: безлимит',
      '700 Caspers в месяц',
      'Про чат: 20 запросов/день бесплатно',
      'Изображения — 10 Caspers/шт',
      'Видео — от 25 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
  VIP: {
    key: 'VIP',
    label: 'VIP',
    price: 3990,
    price_yearly: 38304, // 3990 * 12 * 0.8
    caspers_monthly: 1800,
    pro_free_daily: 50,
    badge: null,
    popular: false,
    features: [
      'Стандартный чат: безлимит',
      '1 800 Caspers в месяц',
      'Про чат: 50 запросов/день бесплатно',
      'Изображения — 10 Caspers/шт',
      'Видео — от 25 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
  ULTRA: {
    key: 'ULTRA',
    label: 'Ультра',
    price: 5990,
    price_yearly: 57504, // 5990 * 12 * 0.8
    caspers_monthly: 2800,
    pro_free_daily: -1,
    badge: 'Максимум',
    popular: false,
    features: [
      'Стандартный чат: безлимит',
      '2 800 Caspers в месяц',
      'Про чат: безлимит',
      'Изображения — 10 Caspers/шт',
      'Видео — от 25 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
};

// ─── FREE tier limits (shown publicly) ───────────────────────────────────────

export const FREE_LIMITS = {
  std_messages_daily: 5,
  images_weekly: 5,
  music_weekly: 5,
  videos_monthly: 3,   // 3 видео в МЕСЯЦ (not week)
} as const;

// ─── Casper operation costs ───────────────────────────────────────────────────

export const CASPER_COSTS = {
  chat_pro:        1,
  image_generate:  10,
  image_edit:      10,
  video_std_4s:    25,
  video_std_8s:    40,
  video_pro_4s:    50,
  video_pro_8s:    90,
  music_generate:  5,
} as const;

// ─── Casper top-up tiered pricing ────────────────────────────────────────────
// 10 tiers × 100 Caspers, price drops 0.1 ₽ per tier

export const CASPER_PRICE_TIERS = [
  { max: 100, price: 3.0 },
  { max: 100, price: 2.9 },
  { max: 100, price: 2.8 },
  { max: 100, price: 2.7 },
  { max: 100, price: 2.6 },
  { max: 100, price: 2.5 },
  { max: 100, price: 2.4 },
  { max: 100, price: 2.3 },
  { max: 100, price: 2.2 },
  { max: 100, price: 2.1 },
] as const;

export function calculateCasperPrice(amount: number): number {
  if (amount <= 0) return 0;
  let total = 0;
  let remaining = amount;
  for (const tier of CASPER_PRICE_TIERS) {
    if (remaining <= 0) break;
    const inTier = Math.min(remaining, tier.max);
    total += inTier * tier.price;
    remaining -= inTier;
  }
  return Math.round(total * 100) / 100;
}
