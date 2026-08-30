/**
 * ─── GhostLine AI — Конфигурация тарифов ─────────────────────────────────────
 *
 * ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ для всех данных о тарифах.
 * Используется в: yokassa.ts (оплата), routes/plans.ts (публичный API), frontend, miniapp.
 *
 * Логика ценообразования:
 *   - Фейковая "оригинальная" цена = реальная месячная × 2 (маркетинговая скидка 50%)
 *   - Реальная годовая цена = месячная × 12 × 0.8 (реальная скидка 20% от месячной)
 *   - Год маркетингово подаётся как "скидка 70%" от фейковой оригинальной цены
 */

export const PLAN_KEYS = ['FREE', 'START', 'BASIC', 'PRO', 'PRO_PLUS', 'VIP', 'ULTRA'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

/** Сравнение тарифов по порядку в PLAN_KEYS — для гейтинга моделей по minPlan. */
export function planAtLeast(userPlan: PlanKey, required: PlanKey): boolean {
  return PLAN_KEYS.indexOf(userPlan) >= PLAN_KEYS.indexOf(required);
}

// Приветственный бонус Caspers для новых пользователей — используется в
// routes/auth.ts при регистрации И здесь же, в тексте фичи FREE-плана,
// чтобы оба места не расходились при изменении суммы бонуса.
//
// Убран по прямому решению Александра 2026-08-25: экономически невыгоден —
// на 100 Caspers новый пользователь мог полностью попробовать платные функции
// (картинки/музыку) без единой оплаты. Единственная бесплатная часть теперь —
// стандартный чат (llama-3.1-fast, единственная модель с cost:0 в реестре),
// но и он больше не безлимитный — см. FREE_LIMITS.chat_daily и checkAndDeduct
// в services/tokens.ts.
export const FREE_WELCOME_CASPERS = 0;

// ─── Лимиты FREE-тарифа (публично видимые) ───────────────────────────────────
// Объявлены до PLANS, т.к. используются в тексте фич FREE-плана ниже.

export const FREE_LIMITS = {
  images_weekly: 5,
  music_weekly: 5,
  // Видео — самый дорогой домен по себестоимости (в разы дороже картинок/музыки за
  // генерацию). На FREE недоступно вообще, даже за докупленные Caspers — см.
  // services/tokens.ts:checkAndDeduct (LIMIT_VIDEOS_FREE_PLAN). Раньше здесь было
  // videos_monthly: 3, но лимит нигде не проверялся — приветственный бонус можно было
  // целиком потратить на видео без ограничений.
  videos_monthly: 0,
  // Стандартный (бесплатный, cost:0) чат был безлимитным на всех тарифах включая
  // FREE — см. историю в services/tokens.ts:checkAndDeduct. По прямому решению
  // Александра 2026-08-25: закрываем дыру — жёсткий дневной лимит, сброс по
  // day_start (уже существующий механизм, см. checkResets).
  chat_daily: 10,
} as const;

export interface PlanInfo {
  key: PlanKey;
  label: string;
  description: string;  // короткая строка под названием тарифа (см. features ниже для деталей)
  price: number;        // реальная месячная цена (RUB)
  price_yearly: number; // реальная годовая цена (RUB) = price * 12 * 0.8
  caspers_monthly: number;
  badge: string | null;
  popular: boolean;
  features: string[];
}

export const PLANS: Record<PlanKey, PlanInfo> = {
  FREE: {
    key: 'FREE',
    label: 'Бесплатный',
    description: 'Попробовать без карты — стандартный чат и немного Caspers на генерации.',
    price: 0,
    price_yearly: 0,
    caspers_monthly: 0,
    badge: null,
    popular: false,
    features: [
      `Стандартный чат: до ${FREE_LIMITS.chat_daily} сообщений в день`,
      'Изображения и музыка — за Caspers',
      'Видео — с тарифа BASIC',
    ],
  },
  START: {
    key: 'START',
    label: 'Старт',
    description: 'Дешёвый вход для тех, кому пока хватит по чуть-чуть картинок, музыки и видео.',
    price: 390,
    price_yearly: 3744, // 390 * 12 * 0.8
    caspers_monthly: 130,
    badge: null,
    popular: false,
    features: [
      'Стандартный чат: безлимит',
      '130 Caspers в месяц',
      'Платные модели чата — от 1 Casper/сообщ.',
      'Изображения — от 5 Caspers/шт',
      'Видео — от 20 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
  BASIC: {
    key: 'BASIC',
    label: 'Базовый',
    description: 'Безлимитный чат и Caspers на регулярные картинки, музыку и видео.',
    price: 790,
    price_yearly: 7584, // 790 * 12 * 0.8
    caspers_monthly: 300,
    badge: null,
    popular: false,
    features: [
      'Стандартный чат: безлимит',
      '300 Caspers в месяц',
      'Платные модели чата — от 1 Casper/сообщ.',
      'Изображения — от 5 Caspers/шт',
      'Видео — от 20 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
  PRO: {
    key: 'PRO',
    label: 'Про',
    description: 'Больше Caspers каждый месяц для активного использования.',
    price: 1690,
    price_yearly: 16224, // 1690 * 12 * 0.8
    caspers_monthly: 700,
    badge: 'Популярный',
    popular: true,
    features: [
      'Стандартный чат: безлимит',
      '700 Caspers в месяц',
      'Платные модели чата — от 1 Casper/сообщ.',
      'Изображения — от 5 Caspers/шт',
      'Видео — от 20 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
  PRO_PLUS: {
    key: 'PRO_PLUS',
    label: 'Про+',
    description: 'Промежуточный шаг между Про и VIP — больше Caspers без прыжка в цене почти в 2.4 раза.',
    price: 2790,
    price_yearly: 26784, // 2790 * 12 * 0.8
    caspers_monthly: 1200,
    badge: null,
    popular: false,
    features: [
      'Стандартный чат: безлимит',
      '1 200 Caspers в месяц',
      'Платные модели чата — от 1 Casper/сообщ.',
      'Изображения — от 5 Caspers/шт',
      'Видео — от 20 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
  VIP: {
    key: 'VIP',
    label: 'VIP',
    description: 'Для активной работы: большой запас Caspers каждый месяц.',
    price: 3990,
    price_yearly: 38304, // 3990 * 12 * 0.8
    caspers_monthly: 1800,
    badge: null,
    popular: false,
    features: [
      'Стандартный чат: безлимит',
      '1 800 Caspers в месяц',
      'Платные модели чата — от 1 Casper/сообщ.',
      'Изображения — от 5 Caspers/шт',
      'Видео — от 20 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
  ULTRA: {
    key: 'ULTRA',
    label: 'Ультра',
    description: 'Максимальный запас Caspers каждый месяц.',
    price: 5990,
    price_yearly: 57504, // 5990 * 12 * 0.8
    caspers_monthly: 2800,
    badge: 'Максимум',
    popular: false,
    features: [
      'Стандартный чат: безлимит',
      '2 800 Caspers в месяц',
      'Платные модели чата — от 1 Casper/сообщ.',
      'Изображения — от 5 Caspers/шт',
      'Видео — от 20 Caspers',
      'Музыка — 5 Caspers/трек',
    ],
  },
};

// ─── Стоимость операций в Caspers ─────────────────────────────────────────────
// Чат/картинки/видео тарифицируются по модели (config/models.ts, ModelSpec.cost) —
// здесь остаётся музыка и голос: для них пока нет реестра моделей (один провайдер).

export const CASPER_COSTS = {
  music_generate: 5,
  // ⚠️ ЦЕНА-ЗАГЛУШКА. Голос = STT (openai/gpt-audio-mini, $0.6/1M токенов аудио-входа)
  // + ответ "мозга" (модель 'auto') + TTS (тот же gpt-audio-mini, $2.4/1M токенов аудио-выхода).
  // Точное отношение "секунды аудио → токены" для gpt-audio-mini не сверено (see
  // services/providers/openrouter.ts:synthesizeSpeech/transcribeAudio) — эта цена
  // консервативная оценка сверху, не факт. НЕ запускать в продакшн без проверки на
  // реальном трафике.
  voice_exchange: 8,
} as const;

// ─── Ступенчатая цена докупки Caspers ─────────────────────────────────────────
// 10 ступеней × 100 Caspers, цена падает на 0.1 ₽ за каждую ступень

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
