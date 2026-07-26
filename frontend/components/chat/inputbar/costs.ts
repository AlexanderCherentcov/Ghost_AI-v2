// Расчёт и отображение стоимости операций в Caspers.
// Сами цифры сюда НЕ зашиваются — приходят с бэкенда через GET /plans
// (casper_costs, единый источник правды: backend/src/config/plans.ts).
// DEFAULT_CASPER_COSTS — только запасной вариант на время, пока /plans
// не загрузился, не источник правды.

import type { ChatMode, VideoOptions } from './types';

export type CasperCosts = Record<string, number>;

export const DEFAULT_CASPER_COSTS: CasperCosts = {
  chat_pro: 1,
  image_generate: 10,
  image_edit: 10,
  video_std_4s: 25,
  video_std_8s: 40,
  video_pro_4s: 50,
  video_pro_8s: 90,
  music_generate: 5,
};

export function calcCaspers(mode: ChatMode, videoOpts: VideoOptions, costs: CasperCosts): number {
  if (mode === 'music') return costs.music_generate;
  if (mode === 'images') return costs.image_generate;
  if (mode === 'video') {
    const isPro = videoOpts.videoModel === 'cinema';
    if (isPro) return videoOpts.duration === '4s' ? costs.video_pro_4s : costs.video_pro_8s;
    return videoOpts.duration === '4s' ? costs.video_std_4s : costs.video_std_8s;
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
  preferredModel?: 'haiku' | 'deepseek' | undefined,
  userProFreeRemaining?: number,
): CostDisplay {
  if (mode === 'chat') {
    if (preferredModel !== 'deepseek') return null;
    if (!userPlan) return null; // ещё загружается
    if (userPlan === 'ULTRA') return { type: 'free', label: 'безлимит' };
    if (userProFreeRemaining !== undefined && userProFreeRemaining > 0) {
      return { type: 'free', label: `${userProFreeRemaining} сегодня` };
    }
    if (!userProFreeRemaining && userPlan === 'FREE') return null; // FREE не может пользоваться pro
    return { type: 'caspers', amount: costs.chat_pro };
  }

  if (mode === 'images') {
    return { type: 'caspers', amount: costs.image_generate };
  }

  if (mode === 'music') {
    return { type: 'caspers', amount: costs.music_generate };
  }

  if (mode === 'video') {
    return { type: 'caspers', amount: calcCaspers('video', videoOpts, costs) };
  }

  return null;
}
