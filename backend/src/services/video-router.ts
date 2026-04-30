/**
 * Video Router — автоматически выбирает модель по промту и контексту.
 *
 * Модели:
 *   veo3_standard   — Veo 3.1 standard (veo3.1-video-fast)
 *   veo3_pro        — Veo 3.1 pro (veo3.1-video)
 *   kling_std       — Kling V-2.5
 *
 * Пользователь не видит какая модель используется — бренд «GhostLine».
 */

export type VideoModel = 'veo3_standard' | 'veo3_pro' | 'kling_std';

export interface VideoRouterResult {
  model: VideoModel;
  reason: string;
}

// Ключевые слова, требующие высокого качества (Kling / Veo3 Pro)
const PREMIUM_SCENE = [
  // Люди / персонажи
  'человек', 'люди', 'мужчина', 'женщина', 'девушка', 'парень', 'ребёнок', 'дети',
  'лицо', 'лица', 'портрет', 'руки', 'тело', 'фигура', 'персонаж', 'актёр', 'модель',
  'толпа', 'аудитория',
  'person', 'people', 'man', 'woman', 'girl', 'boy', 'child', 'children',
  'face', 'faces', 'portrait', 'hands', 'body', 'figure', 'character', 'actor',
  'human', 'crowd', 'audience',
  // Сложная кинематика
  'кинематографич', 'cinematic', 'tracking shot', 'dolly',
  // Детальная фотореалистика
  'фотореалистичн', 'photorealistic', 'hyperrealistic', 'ultra realistic',
  '8k', 'ultra hd',
  // Боевые/танцевальные сцены
  'дерётся', 'дерутся', 'танцует', 'танцуют', 'fighting', 'dancing',
];

export function routeVideo(
  prompt: string,
  hasSourceImage: boolean,
  isPro: boolean,
): VideoRouterResult {
  const lower = prompt.toLowerCase();

  // Pro model for complex/human scenes
  if (isPro || PREMIUM_SCENE.some((kw) => lower.includes(kw))) {
    return { model: 'veo3_pro', reason: 'pro/premium scene → Veo3.1 Pro' };
  }

  // Image-to-video → Kling (better motion preservation)
  if (hasSourceImage) {
    return { model: 'kling_std', reason: 'image-to-video → Kling STD' };
  }

  // Default → Veo3.1 Standard
  return { model: 'veo3_standard', reason: 'default → Veo3.1 Standard' };
}
