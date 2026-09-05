// Расчёт и отображение стоимости операций в Caspers.
// Сами цифры сюда НЕ зашиваются — приходят с бэкенда через GET /plans
// (casper_costs, единый источник правды: backend/src/config/plans.ts).
// DEFAULT_CASPER_COSTS — только запасной вариант на время, пока /plans
// не загрузился, не источник правды.

import type { ChatMode, VideoOptions } from './types';
import type { ChatModelOption, ImageModelOption, VideoModelOption } from '@/lib/api';

export type CasperCosts = Record<string, number>;

export const DEFAULT_CASPER_COSTS: CasperCosts = {
  music_generate: 5,
};

// Цена картинок/видео теперь зависит от выбранной модели (реестр backend/src/config/models.ts),
// а не от фиксированных ключей image_generate/video_std_4s — costs (CasperCosts) остаётся
// источником цены только для музыки, у которой пока нет реестра моделей.
export function calcCaspers(
  mode: ChatMode,
  videoOpts: VideoOptions,
  costs: CasperCosts,
  imageModel?: ImageModelOption,
  videoModels?: VideoModelOption[],
): number {
  if (mode === 'music') return costs.music_generate;
  if (mode === 'images') return imageModel?.cost ?? 0;
  if (mode === 'video') {
    const spec = videoModels?.find((m) => m.id === videoOpts.videoModel);
    if (!spec) return 0;
    const base = spec.cost[videoOpts.duration];
    // Звук у части провайдеров (Veo) реально дороже — см. audioCostMultiplier
    // в backend/src/config/models.ts. У остальных моделей (Kling/Seedance/Wan)
    // undefined/1 — звук бесплатный или не влияет на цену.
    const withAudio = videoOpts.enableAudio && spec.capabilities.audio && spec.audioCostMultiplier
      ? Math.round(base * spec.audioCostMultiplier)
      : base;
    return withAudio;
  }
  return 0;
}

// ─── Отображение стоимости с учётом тарифа ──────────────────────────────────────
//
// Возвращает, что показать рядом с заголовком виджета или тулбаром:
//   { type:'free', label:'3/5 нед.' }   → FREE-пользователь с остатком квоты
//   { type:'caspers', amount: 10 }       → платный пользователь ИЛИ квота FREE исчерпана
//   null                                 → режим чата (стоимости нет)

export type CostDisplay =
  | { type: 'free'; label: string }
  | { type: 'caspers'; amount: number }
  | null;

export function getCostDisplay(
  mode: ChatMode,
  videoOpts: VideoOptions,
  costs: CasperCosts,
  userPlan?: string,
  userImages?: number,
  userMusic?: number,
  userVideos?: number,
  selectedChatModel?: ChatModelOption,
  imageModel?: ImageModelOption,
  videoModels?: VideoModelOption[],
): CostDisplay {
  if (mode === 'chat') {
    if (!selectedChatModel || selectedChatModel.cost === 0) return null; // 'auto' и бесплатные модели — без бейджа
    // Платные модели чата списывают Caspers на всех тарифах одинаково, без
    // бесплатной дневной квоты (убрана по прямому решению Александра — модели,
    // за которые платим мы, оплачиваются всеми, без исключений даже на ULTRA).
    return { type: 'caspers', amount: selectedChatModel.cost };
  }

  if (mode === 'images') {
    if (!imageModel) return null; // список моделей ещё не загрузился
    return { type: 'caspers', amount: imageModel.cost };
  }

  if (mode === 'music') {
    return { type: 'caspers', amount: costs.music_generate };
  }

  if (mode === 'video') {
    return { type: 'caspers', amount: calcCaspers('video', videoOpts, costs, imageModel, videoModels) };
  }

  return null;
}
