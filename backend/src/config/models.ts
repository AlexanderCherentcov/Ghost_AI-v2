/**
 * ─── GhostLine AI — Реестр моделей ────────────────────────────────────────────
 *
 * ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ для того, какие модели существуют, что они стоят
 * и на каком провайдере работают. Бэкенд — единственный, кто это знает;
 * сайт, бот и будущие приложения читают через API (см. routes/plans.ts),
 * а не хранят свою копию списка/цен/лейблов.
 *
 * Честность выбора: если пользователь выбрал конкретную модель — работает
 * именно она, списание идёт по её цене. Свобода подбора модели существует
 * только внутри явно выбранного 'auto' (см. AUTO_MODEL_ID) — там диспетчер
 * волен экономить Caspers пользователя, подбирая модель по сложности запроса.
 *
 * ВАЖНО про цены: Caspers-стоимость чат-моделей ниже — это ПРЕДЛОЖЕНИЕ,
 * посчитанное от реальной цены OpenRouter (see providerModel) в предположении
 * ~500 токенов запрос + 500 токенов ответ, с привязкой к уже действующей
 * цене DeepSeek V3.2 = 1 Casper. Это отправная точка для решения по марже,
 * не финальная цена — проверить перед стартом продаж.
 */

import type { PlanKey } from './plans.js';

export type ModelDomain = 'chat' | 'image' | 'video';
export type VideoDurationChoice = '4s' | '8s';

export function secondsOf(duration: VideoDurationChoice): number {
  return duration === '4s' ? 4 : 8;
}

interface BaseModelSpec {
  /** Стабильный id — уходит на провод (WS/REST) и в Message.provider/GenerateJob. Никогда не меняется задним числом. */
  id: string;
  label: string;
  /** Короткая подпись под лейблом в развёрнутых пикерах (напр. «Быстро · Veo 3.1 Fast»). Опционально. */
  blurb?: string;
  minPlan: PlanKey;
  /** Участвует ли модель в подборе диспетчером при model === AUTO_MODEL_ID. */
  autoEligible: boolean;
}

export interface ChatModelSpec extends BaseModelSpec {
  domain: 'chat';
  /** Caspers за сообщение. */
  cost: number;
  provider: 'cloudflare' | 'openrouter';
  providerModel: string;
  /** Цепочка резервных моделей OpenRouter, если основная недоступна. */
  fallbackModels?: string[];
  capabilities?: { vision?: boolean; search?: boolean };
}

/**
 * Реальные, подтверждённые документацией провайдера настройки, которые можно
 * показать пользователю в UI (панель настроек — см. frontend SettingsPanel).
 * Единый источник для сайта, бота и любых будущих клиентов — все читают отсюда
 * через /plans, никто не хранит свою копию (по прямому указанию Александра:
 * "всё должно браться с одного файла").
 */
export interface VideoModelUiParams {
  /** Реальные секунды провайдера для двух наших ценовых корзин '4s'/'8s' — только подпись
   *  кнопки, сама корзина (и цена) не меняется. null — провайдер не даёт выбрать длительность. */
  durationLabels: { '4s': string; '8s': string } | null;
  aspectRatios: string[];
  /** Пусто — провайдер не поддерживает выбор разрешения. */
  resolutions: string[];
  supportsNegativePrompt: boolean;
  /** Непусто только у Kling — простые пресеты camera_control. */
  cameraPresets: string[];
}

export interface ImageModelUiParams {
  /** Пусто/отсутствует — соотношение сторон у этой модели не подтверждено, контрол не показываем. */
  aspectRatios: string[];
}

export interface ImageModelSpec extends BaseModelSpec {
  domain: 'image';
  /** Caspers за изображение. */
  cost: number;
  provider: 'openrouter';
  providerModel: string;
  /** Резервная модель, если основная упала (пустой результат, content policy и т.п.). */
  fallbackModel?: string;
  capabilities?: { edit?: boolean };
  ui?: ImageModelUiParams;
  /** Пример вывода модели — заглушка, пока Александр не пришлёт реальные сэмплы. */
  previewImageUrl?: string;
}

export interface VideoModelSpec extends BaseModelSpec {
  domain: 'video';
  /** Caspers за ролик в зависимости от выбранной длительности. */
  cost: (duration: VideoDurationChoice) => number;
  provider: 'goapi' | 'openai-direct';
  /** Значение поля "model" в теле запроса GoAPI (пусто для openai-direct). */
  goapiModel: string;
  // goapiTaskType реально ЧИТАЕТСЯ только у goapiModel === 'veo3.1' (reel.worker.ts
  // различает standard/pro по этому полю). У Kling режим/версию задают klingMode/
  // klingVersion, а у остальных провайдеров task_type вычисляется заново внутри
  // buildGenericVideoInput (services/providers/goapi.ts) — часто по значению opts
  // (например image-to-video/text-to-video), значение из реестра там не читается
  // в принципе. Раньше поле было обязательным и заполнялось везде "для полноты",
  // что выглядело так, будто оно на что-то влияет — не заполняем там, где оно
  // не используется, чтобы не вводить в заблуждение при следующем чтении реестра.
  goapiTaskType?: string;
  /** id модели у провайдера напрямую — сейчас только для provider === 'openai-direct' (Sora). */
  providerModel?: string;
  // imageRequired — модель работает ТОЛЬКО как image-to-video (SkyReels, Framepack:
  // провайдер обязательно требует image, чистого text-to-video у него нет) —
  // routes/generate.ts отклоняет запрос без videoImageUrl для таких моделей,
  // а не отправляет заведомо невалидный запрос в GoAPI.
  capabilities?: { imageToVideo?: boolean; audio?: boolean; imageRequired?: boolean };
  // Только для goapiModel === 'kling' — форсирует режим/версию независимо от
  // остальных опций (см. services/providers/goapi.ts:KlingVideoOptions). У
  // остальных провайдеров эти поля не используются.
  klingMode?: 'std' | 'pro';
  klingVersion?: string;
  ui: VideoModelUiParams;
  /** Пример вывода модели — заглушка, пока Александр не пришлёт реальные сэмплы. */
  previewVideoUrl?: string;
}

export type ModelSpec = ChatModelSpec | ImageModelSpec | VideoModelSpec;

// ─── Чат ────────────────────────────────────────────────────────────────────
// 'auto' не модель, а специальный id — обрабатывается диспетчером в ai-router.ts,
// в CHAT_MODELS не входит.

export const AUTO_MODEL_ID = 'auto';
export const DEFAULT_CHAT_MODEL_ID = AUTO_MODEL_ID;

// «Авто» само по себе — платная функция диспетчеризации, не способ получить
// стандартный чат бесплатно через чёрный ход. По прямому решению Александра:
// даже когда диспетчер выбирает самую дешёвую ветку (бесплатную Llama), с
// пользователя всё равно списывается минимальная сумма — см. ai-router.ts.
// Явный выбор «Стандартного чата» (llama-3.1-fast напрямую) остаётся бесплатным,
// это разные пути: один явно бесплатный, второй — платная экономия через «Авто».
export const AUTO_MIN_COST = 1;

export const CHAT_MODELS: ChatModelSpec[] = [
  {
    // Cloudflare Workers AI — бесплатный инференс без счётчика по токенам на стороне
    // провайдера, поэтому cost:0 не заглушка, а честная цена. Лейбл переименован из
    // технического "Llama 3.1 8B" — для обычного пользователя это просто "бесплатный чат",
    // название модели под капотом ему не нужно (как у Syntx: языковые модели не тарифицируются).
    // Цепочка резерва теперь в 2 звена — streamOpenRouter (providers/openrouter.ts)
    // честно проходит весь fallbackModels по порядку, а не только первый элемент,
    // так что добавление сюда сразу даёт реальную защиту, а не декорацию:
    // Cloudflare → Llama 3.1 8B (OpenRouter) → Llama 3.3 70B (OpenRouter, другая
    // версия модели, с большей вероятностью не упадёт одновременно с первой).
    id: 'llama-3.1-fast', domain: 'chat', label: 'Стандартный чат', blurb: 'Бесплатная модель', minPlan: 'FREE',
    provider: 'cloudflare', providerModel: '@cf/meta/llama-3.1-8b-instruct-fast',
    fallbackModels: ['meta-llama/llama-3.1-8b-instruct', 'meta-llama/llama-3.3-70b-instruct'],
    cost: 0, autoEligible: true, capabilities: {},
  },
  {
    id: 'gpt-4o-mini', domain: 'chat', label: 'GPT-4o mini', blurb: 'OpenAI', minPlan: 'FREE',
    provider: 'openrouter', providerModel: 'openai/gpt-4o-mini',
    cost: 1, autoEligible: true, capabilities: { vision: true },
  },
  {
    id: 'deepseek-v3.2', domain: 'chat', label: 'DeepSeek V3.2', blurb: 'DeepSeek', minPlan: 'FREE',
    provider: 'openrouter', providerModel: 'deepseek/deepseek-v3.2',
    fallbackModels: ['google/gemini-2.5-flash', 'openai/gpt-4o-mini'],
    cost: 1, autoEligible: true, capabilities: {},
  },
  {
    id: 'gemini-2.5-flash', domain: 'chat', label: 'Gemini 2.5 Flash', blurb: 'Google', minPlan: 'FREE',
    provider: 'openrouter', providerModel: 'google/gemini-2.5-flash',
    fallbackModels: ['openai/gpt-4o-mini'],
    cost: 4, autoEligible: true, capabilities: { vision: true },
  },
  {
    // 2026-08-21: цена поднята с 3 до 6 Caspers — Sonar структурно самая уязвимая
    // модель каталога (токен $1/M, как у GPT-4o, но при старой цене 3 Caspers
    // была на уровне DeepSeek/mini, чей токен в 3-13 раз дешевле). При максимальной
    // истории/файле (адверсариальный сценарий) старая цена давала худшее ₽/Casper
    // во всём каталоге (₽1,47), хуже любой видео-модели. При 6 Caspers худший
    // случай поднимается до ₽0,74/Casper — на уровне остального каталога (60-70%
    // маржи), а не выбивается из него.
    id: 'sonar', domain: 'chat', label: 'Perplexity Sonar (веб-поиск)', blurb: 'Perplexity', minPlan: 'FREE',
    provider: 'openrouter', providerModel: 'perplexity/sonar',
    fallbackModels: ['deepseek/deepseek-v3.2'],
    cost: 6, autoEligible: true, capabilities: { search: true },
  },
  {
    id: 'claude-haiku-4.5', domain: 'chat', label: 'Claude Haiku 4.5', blurb: 'Anthropic', minPlan: 'FREE',
    provider: 'openrouter', providerModel: 'anthropic/claude-haiku-4.5',
    fallbackModels: ['openai/gpt-4o-mini'],
    cost: 9, autoEligible: true, capabilities: { vision: true },
  },
  {
    id: 'gemini-2.5-pro', domain: 'chat', label: 'Gemini 2.5 Pro', blurb: 'Google', minPlan: 'FREE',
    provider: 'openrouter', providerModel: 'google/gemini-2.5-pro',
    fallbackModels: ['anthropic/claude-haiku-4.5'],
    cost: 17, autoEligible: true, capabilities: { vision: true },
  },
  {
    id: 'gpt-4o', domain: 'chat', label: 'GPT-4o', blurb: 'OpenAI', minPlan: 'FREE',
    provider: 'openrouter', providerModel: 'openai/gpt-4o',
    fallbackModels: ['anthropic/claude-haiku-4.5'],
    cost: 19, autoEligible: true, capabilities: { vision: true },
  },
];

// ─── Картинки ───────────────────────────────────────────────────────────────
// vision.worker.ts сейчас падал бы на fallback 'black-forest-labs/flux.2-pro' —
// этой модели больше нет в каталоге OpenRouter (проверено). Ниже — только
// реально существующие сейчас image-output модели.

export const DEFAULT_IMAGE_MODEL_ID = 'gemini-flash-image';

// image_config.aspect_ratio подтверждён в доках OpenRouter только для Gemini-семейства
// (chat/completions с modalities:['image']) — см. providers/openrouter.ts:generateImageFlux.
// У остальных провайдеров (OpenAI/ByteDance/Qwen) путь не подтверждён, ui.aspectRatios
// у них умышленно не задан — честнее не показывать контрол, чем показать нерабочий.
const GEMINI_IMAGE_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];

export const IMAGE_MODELS: ImageModelSpec[] = [
  {
    id: 'gemini-flash-image', domain: 'image', label: 'Gemini Flash Image', blurb: 'Google', minPlan: 'FREE',
    provider: 'openrouter', providerModel: 'google/gemini-3.1-flash-image',
    fallbackModel: 'google/gemini-3-pro-image',
    cost: 10, autoEligible: true, capabilities: { edit: true },
    ui: { aspectRatios: GEMINI_IMAGE_ASPECT_RATIOS },
  },
  {
    id: 'gemini-pro-image', domain: 'image', label: 'Gemini Pro Image', blurb: 'Google', minPlan: 'BASIC',
    provider: 'openrouter', providerModel: 'google/gemini-3-pro-image',
    cost: 22, autoEligible: true, capabilities: { edit: true },
    ui: { aspectRatios: GEMINI_IMAGE_ASPECT_RATIOS },
  },
  {
    // TODO: pricing.image для этой модели не сверен (есть только prompt/completion в дампе
    // каталога) — цена ниже грубая оценка, не факт.
    id: 'gpt-image-mini', domain: 'image', label: 'GPT Image mini', blurb: 'OpenAI', minPlan: 'BASIC',
    provider: 'openrouter', providerModel: 'openai/gpt-5-image-mini',
    cost: 14, autoEligible: true, capabilities: { edit: false },
  },
  {
    // Цена по формуле реестра: Caspers = USD_cost × 400 (проверено на Sora — единственной
    // модели в файле с точной $-привязкой: $0.10/с × 400 = 40 Caspers/с, $0.30 × 400 = 120 —
    // сходится. Дальше применяю ту же формулу ко всем новым моделям вместо гадания).
    // OpenRouter: $0.25/M input + $1.50/M output токенов, на типичную картинку (~1290
    // output-токенов) — ~$0.002/картинка. По формуле это <1 Casper — задрал до 5
    // (минимальный психологический порог цены, формула даёт только пол оверхеда сверх
    // сырой цены API, не покрывает эквайринг/поддержку на дешёвых операциях).
    id: 'nano-banana-2-lite', domain: 'image', label: 'Nano Banana 2 Lite', blurb: 'Google', minPlan: 'FREE',
    provider: 'openrouter', providerModel: 'google/gemini-3.1-flash-lite-image',
    cost: 5, autoEligible: true, capabilities: { edit: true },
    ui: { aspectRatios: GEMINI_IMAGE_ASPECT_RATIOS },
  },
  // Seedream 5 (ByteDance) и Qwen Image 3 — УБРАНЫ 2026-08-20: проверено вживую по
  // живому каталогу OpenRouter (api/v1/models, 414 моделей на момент проверки) — ни
  // bytedance-seed/seedream-5-0-*, ни qwen/qwen-image-3* там не существуют (у ByteDance
  // на OpenRouter только текстовые Seed 1.6/2.0/2.1, у Qwen только текстовые/coder-модели,
  // картиночных линеек нет вообще). Раньше эти 4 модели были в UI с ценником — при выборе
  // любой из них генерация гарантированно падала бы. Если провайдер добавит эти модели
  // в каталог позже — вернуть с перепроверенным providerModel, не по памяти.
  {
    // 2026-08-20: реальная OpenRouter-модель, проверено (openai/gpt-5-image
    // существует в живом каталоге, output_modalities включает image).
    // ⚠️ ЦЕНА-ОЦЕНКА: image_output $40/M токенов, картинка ~4160 токенов на
    // качестве "high" (официальный размер OpenAI для 1024×1024) — какое качество
    // реально уйдёт в запросе, наш код сейчас явно не задаёт (см. providers/openrouter.ts),
    // это предположение по умолчанию "high", не факт. Сверить на реальном трафике.
    id: 'gpt-image', domain: 'image', label: 'GPT Image', blurb: 'OpenAI · выше качеством, чем mini', minPlan: 'BASIC',
    provider: 'openrouter', providerModel: 'openai/gpt-5-image',
    cost: 70, autoEligible: true, capabilities: { edit: true },
  },
  {
    // 2026-08-20: openai/gpt-5.4-image-2 — новейшая модель OpenAI для картинок
    // на момент проверки, реально существует в каталоге OpenRouter.
    // ⚠️ ЦЕНА-ОЦЕНКА: та же оговорка про качество "high", что у gpt-image выше.
    id: 'gpt-5.4-image-2', domain: 'image', label: 'GPT-5.4 Image 2', blurb: 'OpenAI · новейшая модель', minPlan: 'BASIC',
    provider: 'openrouter', providerModel: 'openai/gpt-5.4-image-2',
    cost: 52, autoEligible: true, capabilities: { edit: true },
  },
  {
    // 2026-08-20: google/gemini-2.5-flash-image — оригинальная модель "Nano Banana"
    // (более ранняя, чем 3.1-flash-image/-lite-image выше), проверено в живом
    // каталоге OpenRouter. По себестоимости токена идентична nano-banana-2-lite
    // ($30/M output) — цена здесь чуть выше просто потому, что это более старая
    // версия, которую держим для совместимости/привычки, не флагман.
    id: 'nano-banana-classic', domain: 'image', label: 'Nano Banana Classic', blurb: 'Google · оригинальная версия', minPlan: 'FREE',
    provider: 'openrouter', providerModel: 'google/gemini-2.5-flash-image',
    cost: 6, autoEligible: true, capabilities: { edit: true },
    ui: { aspectRatios: GEMINI_IMAGE_ASPECT_RATIOS },
  },
];

// ─── Видео ──────────────────────────────────────────────────────────────────
// Kling/Seedance/Hailuo/Wan — через GoAPI (goapi.ai/docs), формат запроса
// подтверждён по их документации на момент планирования. Sora — отдельная
// прямая интеграция с OpenAI (v1/videos), подтверждена в их доках
// (developers.openai.com/api/docs/models/sora-2): биллинг $/сек, не за
// генерацию, поэтому cost — функция от длительности с явной оговоркой ниже.
//
// Luma (Dream Machine) и Hunyuan — контракт подтверждён по goapi.ai/docs
// (dream-machine/create-task, hunyuan-video/txt2video-api) при добавлении.
// ⚠️ Hunyuan: в официальной документации GoAPI прямо написано "Hunyuan Video
// Model Can Do NSFW" — это модель без встроенной модерации контента на стороне
// провайдера. Для потребительского продукта это реальный риск (жалобы,
// репутация, возможные юридические вопросы) — решение включать её в продакшн
// или нет должно приниматься осознанно, не автоматически через реестр.

export const DEFAULT_VIDEO_MODEL_ID = 'kling-v2.5';

export const VIDEO_MODELS: VideoModelSpec[] = [
  {
    // minPlan BASIC (не FREE) — видео недоступно на FREE вообще, см. FREE_LIMITS в
    // config/plans.ts и жёсткую блокировку в services/tokens.ts:checkAndDeduct.
    id: 'kling-v2.5', domain: 'video', label: 'GhostLine Reality', blurb: 'Реализм · Kling V-2.5', minPlan: 'BASIC',
    provider: 'goapi', goapiModel: 'kling',
    // 2026-08-20: явно закреплена version:'2.5' — раньше поле не передавалось, и
    // GoAPI молча подставлял дефолт "2.6" (goapi.ai/docs/kling-api/create-task),
    // хотя модель называется "2.5". Цена 2.5/2.6 идентична в std и pro (проверено
    // живым запросом к докам) — фикс только честности бренда, маржа не меняется.
    klingVersion: '2.5',
    cost: (d) => (d === '4s' ? 25 : 40),
    autoEligible: true, capabilities: { imageToVideo: true },
    // goapi.ai/docs/kling-api/create-task — duration: 5|10, aspect_ratio: 16:9/9:16/1:1
    // (только text-to-video), resolution провайдером не поддерживается вообще.
    ui: {
      durationLabels: { '4s': '5с', '8s': '10с' },
      aspectRatios: ['16:9', '9:16', '1:1'],
      resolutions: [],
      supportsNegativePrompt: true,
      cameraPresets: ['static', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'orbit'],
    },
  },
  {
    id: 'veo-3.1-pro', domain: 'video', label: 'GhostLine Cinema', blurb: 'Высокое качество · Veo 3.1 Pro', minPlan: 'BASIC',
    provider: 'goapi', goapiModel: 'veo3.1', goapiTaskType: 'veo3.1-video',
    cost: (d) => (d === '4s' ? 50 : 90),
    autoEligible: true, capabilities: { imageToVideo: true },
    ui: {
      durationLabels: { '4s': '4с', '8s': '8с' },
      aspectRatios: ['16:9', '9:16'],
      resolutions: ['720p', '1080p'],
      supportsNegativePrompt: true,
      cameraPresets: [],
    },
  },
  {
    // ⚠️ ЦЕНА-ЗАГЛУШКА. Реальный тариф OpenAI — $0.10/сек, но перевод в Caspers
    // зависит от курса и желаемой маржи — это решение бизнеса, не может быть
    // выведено автоматически. НЕ запускать в продакшн без подтверждения цены.
    id: 'sora-2', domain: 'video', label: 'Sora 2', blurb: 'OpenAI · синхронный звук', minPlan: 'PRO',
    provider: 'openai-direct', goapiModel: '', providerModel: 'sora-2',
    cost: (d) => secondsOf(d) * 40,
    autoEligible: false, capabilities: {},
    // developers.openai.com/api/reference/resources/videos — seconds: 4/8/12 (у нас 2 корзины),
    // size: 720x1280/1280x720 (текущая интеграция — только 16:9/9:16, см. openai-video.ts).
    // Resolution/audio/negative_prompt отдельными полями не поддерживаются.
    ui: {
      durationLabels: { '4s': '4с', '8s': '8с' },
      aspectRatios: ['16:9', '9:16'],
      resolutions: [],
      supportsNegativePrompt: false,
      cameraPresets: [],
    },
  },
  {
    // 2026-08-20: та же модель, что GhostLine Reality, но mode: 'pro' форсирован
    // независимо от звука (klingMode) — goapi.ai/docs/kling-api/create-task
    // подтверждает цену pro-режима $0.33/5с против $0.20/5с у std (×1.65).
    id: 'kling-v2.5-pro', domain: 'video', label: 'GhostLine Reality Pro', blurb: 'Высокое качество · Kling Pro', minPlan: 'BASIC',
    provider: 'goapi', goapiModel: 'kling',
    klingMode: 'pro', klingVersion: '2.5', // см. комментарий у kling-v2.5 выше — тот же фикс честности версии
    cost: (d) => (d === '4s' ? 42 : 83),
    autoEligible: true, capabilities: { imageToVideo: true },
    ui: {
      durationLabels: { '4s': '5с', '8s': '10с' },
      aspectRatios: ['16:9', '9:16', '1:1'],
      resolutions: [],
      supportsNegativePrompt: true,
      cameraPresets: ['static', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'orbit'],
    },
  },
  {
    // 2026-08-20: старшая версия Kling — goapi.ai/docs/kling-api/create-task
    // подтверждает version:"2.1-master" (только pro-режим, других не поддерживает)
    // и цену $0.96/5с, $1.92/10с (в доке явно: "price for 10s = 2x price for 5s").
    id: 'kling-2.1-master', domain: 'video', label: 'GhostLine Reality Master', blurb: 'Премиум-качество · Kling 2.1 Master', minPlan: 'BASIC',
    provider: 'goapi', goapiModel: 'kling',
    klingMode: 'pro', klingVersion: '2.1-master',
    cost: (d) => (d === '4s' ? 120 : 240),
    autoEligible: true, capabilities: { imageToVideo: true },
    ui: {
      durationLabels: { '4s': '5с', '8s': '10с' },
      aspectRatios: ['16:9', '9:16', '1:1'],
      resolutions: [],
      supportsNegativePrompt: true,
      cameraPresets: ['static', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'orbit'],
    },
  },
  {
    id: 'veo-3.1-standard', domain: 'video', label: 'GhostLine Motion', blurb: 'Быстро · Veo 3.1 Fast', minPlan: 'BASIC',
    provider: 'goapi', goapiModel: 'veo3.1', goapiTaskType: 'veo3.1-video-fast',
    cost: (d) => (d === '4s' ? 25 : 40),
    autoEligible: true, capabilities: { imageToVideo: true },
    // goapi.ai/docs/veo31-api/text-to-video — duration: 4s/6s/8s, aspect_ratio: 16:9/9:16, resolution: 720p/1080p.
    ui: {
      durationLabels: { '4s': '4с', '8s': '8с' },
      aspectRatios: ['16:9', '9:16'],
      resolutions: ['720p', '1080p'],
      supportsNegativePrompt: true,
      cameraPresets: [],
    },
  },
  {
    // 2026-08-20: сверено вживую по goapi.ai/docs/seedance-api/seedance-2 — реальная цена
    // $0.10/с (480p) / $0.20/с (720p) / $0.50/с (1080p), не единая ставка. Наша Caspers-
    // цена — ПЛОСКАЯ (не зависит от resolution), поэтому 1080p выкинут из выбора вообще —
    // при 1080p/10с реальная себестоимость ≈$5.00, старая цена в 46 Caspers (≈$1.35 по
    // курсу ЦБ) была прямым убытком ≈$3.65 на ролик. Цена ниже посчитана на худшем ИЗ
    // ОСТАВШИХСЯ случаев (720p, все резолюции ниже — заведомо в плюс).
    id: 'seedance-2', domain: 'video', label: 'Seedance 2', blurb: 'ByteDance', minPlan: 'BASIC',
    provider: 'goapi', goapiModel: 'seedance',
    cost: (d) => (d === '4s' ? 60 : 115),
    autoEligible: true, capabilities: { imageToVideo: true },
    // goapi.ai/docs/seedance-api/seedance-2 — duration: 4-15с произвольно (у нас 2 корзины),
    // aspect_ratio: 21:9/16:9/4:3/1:1/3:4/9:16. Negative prompt и camera control в доках
    // не задокументированы вообще.
    ui: {
      durationLabels: { '4s': '5с', '8s': '10с' },
      aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      resolutions: ['480p', '720p'],
      supportsNegativePrompt: false,
      cameraPresets: [],
    },
  },
  {
    // 2026-08-21: сверено вживую по goapi.ai/docs/hailuo-api/generate-video —
    // 768p: 6с $0.23, 10с $0.45; 1080p: 6с $0.40, 10с — "1080p+10s is not supported"
    // (прямая цитата из доков провайдера). 1080p убран из UI совсем: наша схема
    // (routes/generate.ts) проверяет resolution против ОБЩЕГО списка модели, не
    // отдельно по каждой длительности — раньше это позволяло выбрать 8s+1080p в
    // интерфейсе и получить ошибку от GoAPI уже после постановки задачи в очередь
    // (списания не было — проверка идёт раньше, но UX было тухлым). Заодно это
    // была самая тонкая маржа во всём видео-каталоге (1080p/6с — 43% на BASIC);
    // без неё худший случай в 4s-корзине — 768p/6с $0.23, маржа заметно выше.
    id: 'hailuo-v2.3', domain: 'video', label: 'Hailuo v2.3', blurb: 'MiniMax', minPlan: 'BASIC',
    provider: 'goapi', goapiModel: 'hailuo',
    cost: (d) => (d === '4s' ? 22 : 36),
    autoEligible: true, capabilities: { imageToVideo: true },
    ui: {
      durationLabels: { '4s': '6с', '8s': '10с' },
      aspectRatios: [],
      resolutions: ['768p'],
      supportsNegativePrompt: false,
      cameraPresets: [],
    },
  },
  {
    // 2026-08-20: сверено вживую по goapi.ai/docs/wan-api/wan26-text-to-video — реальная
    // цена $0.08/с (720p) / $0.12/с (1080p). 1080p выкинут из выбора: на 1080p/10с реальная
    // себестоимость ≈$1.20, старая цена в 32 Casper (≈$0.94) была прямым убытком. Цена ниже
    // посчитана на 720p (единственное оставшееся разрешение).
    // Image-to-video вариант — task_type 'wan26-img2video' (см. доки), не заведён отдельным id.
    id: 'wan-2.6', domain: 'video', label: 'Wan 2.6', blurb: 'Alibaba · со звуком', minPlan: 'BASIC',
    provider: 'goapi', goapiModel: 'Wan',
    cost: (d) => (d === '4s' ? 25 : 50),
    autoEligible: true, capabilities: { imageToVideo: true, audio: true },
    // goapi.ai/docs/wan-api/wan26-text-to-video — duration: 5|10|15, aspect_ratio:
    // 16:9/9:16/1:1/4:3/3:4, audio: нативная генерация звука/диалогов.
    ui: {
      durationLabels: { '4s': '5с', '8s': '10с' },
      aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
      resolutions: ['720p'],
      supportsNegativePrompt: true,
      cameraPresets: [],
    },
  },
  {
    // ⚠️ ЦЕНА-ЗАГЛУШКА, см. комментарий у sora-2. Тариф OpenAI — $0.30/сек.
    id: 'sora-2-pro', domain: 'video', label: 'Sora 2 Pro', blurb: 'OpenAI · максимум качества', minPlan: 'VIP',
    provider: 'openai-direct', goapiModel: '', providerModel: 'sora-2-pro',
    cost: (d) => secondsOf(d) * 120,
    autoEligible: false, capabilities: {},
    ui: {
      durationLabels: { '4s': '4с', '8s': '8с' },
      aspectRatios: ['16:9', '9:16'],
      resolutions: [],
      supportsNegativePrompt: false,
      cameraPresets: [],
    },
  },
  {
    // Реальная цена GoAPI: $0.2 за 5с, $0.4 за 9с — Luma отдаёт видео по 5/9 секунд,
    // не 4/8 как остальные; наш «4s»/«8s» маппится на ближайшее (5с/9с) в провайдере
    // (см. goapi.ts buildGenericVideoInput). По формуле реестра (×400, см. Sora):
    // $0.2×400=80, $0.4×400=160.
    id: 'luma-ray2', domain: 'video', label: 'Luma Ray 2', blurb: 'Dream Machine · нативный HDR', minPlan: 'BASIC',
    provider: 'goapi', goapiModel: 'luma',
    cost: (d) => (d === '4s' ? 80 : 160),
    autoEligible: true, capabilities: { imageToVideo: true },
    // goapi.ai/docs/dream-machine/create-task — duration: 5|9, aspect_ratio: 21:9/9:21/16:9/
    // 9:16/4:3/3:4/1:1. Resolution/audio/negative prompt не поддерживаются.
    ui: {
      durationLabels: { '4s': '5с', '8s': '9с' },
      aspectRatios: ['21:9', '9:21', '16:9', '9:16', '4:3', '3:4', '1:1'],
      resolutions: [],
      supportsNegativePrompt: false,
      cameraPresets: [],
    },
  },
  {
    // Реальная цена GoAPI: $0.09 (txt2video/img2video-replace, 20 шагов, 480x848).
    // По формуле реестра: $0.09×400=36. Разрешение заметно ниже остальных моделей
    // реестра — честно бюджетный вариант. Провайдер не принимает выбор длительности —
    // cost одинаков для «4s»/«8s».
    // ⚠️ См. предупреждение выше про NSFW-способности модели — минимальный тариф
    // повышен до BASIC умышленно, не FREE, как дополнительный барьер.
    id: 'hunyuan-video', domain: 'video', label: 'Hunyuan Video', blurb: 'Tencent · бюджетный вариант', minPlan: 'BASIC',
    provider: 'goapi', goapiModel: 'Qubico/hunyuan',
    cost: () => 36,
    autoEligible: true, capabilities: { imageToVideo: true },
    // goapi.ai/docs/hunyuan-video/txt2video-api — duration провайдером не настраивается вообще,
    // aspect_ratio: 16:9/9:16/1:1. Resolution/audio/negative prompt не поддерживаются.
    ui: {
      durationLabels: null,
      aspectRatios: ['16:9', '9:16', '1:1'],
      resolutions: [],
      supportsNegativePrompt: false,
      cameraPresets: [],
    },
  },
  {
    // 2026-08-20: goapi.ai/docs/skyreels-api/create-task — модель ТОЛЬКО
    // image-to-video (prompt и image оба обязательны у провайдера, чистого
    // text-to-video не существует — см. capabilities.imageRequired ниже).
    // Длительность не настраивается вообще, цена фиксированная $0.15/генерацию.
    id: 'skyreels', domain: 'video', label: 'SkyReels', blurb: 'По вашей фотографии', minPlan: 'BASIC',
    provider: 'goapi', goapiModel: 'Qubico/skyreels',
    cost: () => 19,
    autoEligible: false, capabilities: { imageToVideo: true, imageRequired: true },
    ui: {
      durationLabels: null,
      aspectRatios: ['16:9', '9:16', '1:1'],
      resolutions: [],
      supportsNegativePrompt: false,
      cameraPresets: [],
    },
  },
  {
    // 2026-08-20: goapi.ai/docs/framepack-api/create-task — тоже только
    // image-to-video. Провайдер принимает произвольную длительность 10-30с
    // (30fps) — наши корзины «4s»/«8s» маппим на 10с/20с (см. buildGenericVideoInput
    // в services/providers/goapi.ts), цена $0.03/с.
    id: 'framepack', domain: 'video', label: 'Framepack', blurb: 'По вашей фотографии · длинные ролики', minPlan: 'BASIC',
    provider: 'goapi', goapiModel: 'Qubico/framepack',
    cost: (d) => (d === '4s' ? 38 : 75),
    autoEligible: false, capabilities: { imageToVideo: true, imageRequired: true },
    ui: {
      durationLabels: { '4s': '10с', '8s': '20с' },
      aspectRatios: ['16:9', '9:16', '4:3', '3:4', '1:1'],
      resolutions: [],
      supportsNegativePrompt: true,
      cameraPresets: [],
    },
  },
];

// ─── Доступ ─────────────────────────────────────────────────────────────────

export function findModel(domain: 'chat', id: string): ChatModelSpec | undefined;
export function findModel(domain: 'image', id: string): ImageModelSpec | undefined;
export function findModel(domain: 'video', id: string): VideoModelSpec | undefined;
export function findModel(domain: ModelDomain, id: string): ModelSpec | undefined {
  const list = domain === 'chat' ? CHAT_MODELS : domain === 'image' ? IMAGE_MODELS : VIDEO_MODELS;
  return list.find((m) => m.id === id);
}

export function autoEligibleChatModels(): ChatModelSpec[] {
  return CHAT_MODELS.filter((m) => m.autoEligible);
}

/**
 * Находит зарегистрированную чат-модель по её providerModel-слагу у OpenRouter —
 * нужно для сверки биллинга, когда сработал fallbackModels и реально ответила
 * НЕ та модель, которую списали (см. routes/chat.ts: usedProviderModel). Слаги
 * резервных моделей в fallbackModels совпадают с providerModel других записей
 * реестра не случайно — так и предполагается сверка «кто реально ответил».
 */
export function findChatModelByProviderModel(providerModel: string): ChatModelSpec | undefined {
  return CHAT_MODELS.find((m) => m.providerModel === providerModel);
}
