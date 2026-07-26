// Стоимость операций в Caspers для мини-аппа.
// Цифры приходят с бэкенда через GET /plans (casper_costs, единый источник правды:
// backend/src/config/plans.ts). DEFAULT_CASPER_COSTS — только запасной вариант
// на время, пока /plans не загрузился, не источник правды.

export type CasperCosts = Record<string, number>;

export const DEFAULT_CASPER_COSTS: CasperCosts = {
  chat_pro: 1,
  image_generate: 10,
  video_std_4s: 25,
  video_std_8s: 40,
  video_pro_4s: 50,
  video_pro_8s: 90,
  music_generate: 5,
};

// Длительность видео выбирается в мини-аппе в секундах (5|10) для удобства UI,
// но бэкенд (backend/src/routes/generate.ts) принимает только '4s'|'8s' —
// маппинг единый на весь проект, менять только здесь.
export function videoDurationToBackend(seconds: 5 | 10): '4s' | '8s' {
  return seconds === 10 ? '8s' : '4s';
}

// Мини-апп не даёт выбрать pro/cinema-модель для видео (в отличие от сайта),
// поэтому видео всегда идёт по std-тарифу.
export function calcCasperCost(
  mode: 'chat' | 'images' | 'video' | 'music',
  model: 'haiku' | 'deepseek' | undefined,
  videoDurationSeconds: 5 | 10,
  costs: CasperCosts,
): number {
  if (mode === 'chat') return model === 'deepseek' ? costs.chat_pro : 0;
  if (mode === 'images') return costs.image_generate;
  if (mode === 'music') return costs.music_generate;
  if (mode === 'video') {
    return videoDurationToBackend(videoDurationSeconds) === '4s' ? costs.video_std_4s : costs.video_std_8s;
  }
  return 0;
}
