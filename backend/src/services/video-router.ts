/**
 * Video Router — автоматически выбирает модель по промту и контексту.
 *
 * Уровни (дешевле → дороже):
 *   hunyuan_fast          $0.03  — простые/природные сцены, короткий промт
 *   hunyuan_std           $0.09  — средняя сложность текст→видео
 *   hunyuan_img2video     $0.09  — изображение→видео (дешевле Kling на 54%!)
 *   kling_std             $0.195 — люди, лица, кинематика, сложные сцены
 *
 * Пользователь не видит какая модель используется — бренд «GhostLine».
 */

import type { HunyuanMode } from './providers/goapi.js';

export type VideoModel = 'hunyuan_fast' | 'hunyuan_std' | 'hunyuan_img2video' | 'kling_std';

export interface VideoRouterResult {
  model: VideoModel;
  costUsd: number;
  reason: string;
  // Детали для воркера
  hunyuanMode?: HunyuanMode;
}

// ─── Keyword tables ────────────────────────────────────────────────────────────

// Ключевые слова, требующие Kling (люди, лица, точная кинематика)
const KLING_REQUIRED = [
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

// Простые сцены — Hunyuan Fast справится
const SIMPLE_SCENE = [
  'закат', 'рассвет', 'небо', 'облака', 'море', 'океан', 'волны', 'река', 'озеро',
  'лес', 'горы', 'поле', 'цветы', 'снег', 'дождь', 'туман', 'звёзды', 'луна',
  'sunset', 'sunrise', 'sky', 'clouds', 'ocean', 'sea', 'waves', 'river', 'lake',
  'forest', 'mountains', 'field', 'flowers', 'snow', 'rain', 'fog', 'stars', 'moon',
  'абстракт', 'abstract', 'частицы', 'particles',
  'огонь', 'fire', 'дым', 'smoke', 'вода', 'water', 'жидкость', 'liquid',
  'кот', 'собака', 'птица', 'рыба', 'cat', 'dog', 'bird', 'fish', 'animal',
];

// ─── Router ────────────────────────────────────────────────────────────────────

export function routeVideo(
  prompt: string,
  hasSourceImage: boolean,
  duration: number,
  aspectRatio: '16:9' | '9:16' | '1:1' = '16:9',
): VideoRouterResult {
  const lower = prompt.toLowerCase();
  const wordCount = prompt.trim().split(/\s+/).length;

  // ── 10-секундные видео → только Kling (Hunyuan не поддерживает) ──
  if (duration >= 10) {
    return {
      model: 'kling_std',
      costUsd: 0.39,
      reason: '10s duration → Kling STD',
    };
  }

  // ── Image-to-video ────────────────────────────────────────────────
  if (hasSourceImage) {
    // Если в промте есть люди/лица → Kling лучше сохраняет их пропорции
    if (KLING_REQUIRED.some((kw) => lower.includes(kw))) {
      return {
        model: 'kling_std',
        costUsd: 0.195,
        reason: 'image-to-video + human/face → Kling STD',
      };
    }
    // Остальные image-to-video → Hunyuan img2video-concat ($0.09 vs $0.195 у Kling — экономим 54%)
    return {
      model: 'hunyuan_img2video',
      costUsd: 0.09,
      hunyuanMode: 'img2video-concat',
      reason: 'image-to-video → Hunyuan img2video-concat',
    };
  }

  // ── Text-to-video: сначала проверяем на Kling-обязательное ────────
  if (KLING_REQUIRED.some((kw) => lower.includes(kw))) {
    return {
      model: 'kling_std',
      costUsd: 0.195,
      reason: 'complex/human scene → Kling STD',
    };
  }

  // ── Явно простая сцена или короткий промт → Hunyuan Fast ─────────
  if (SIMPLE_SCENE.some((kw) => lower.includes(kw)) || wordCount <= 6) {
    return {
      model: 'hunyuan_fast',
      costUsd: 0.03,
      hunyuanMode: 'fast',
      reason: 'simple/short prompt → Hunyuan Fast',
    };
  }

  // ── Длинный промт (> 120 символов) → Hunyuan STD ─────────────────
  if (prompt.length > 120) {
    return {
      model: 'hunyuan_std',
      costUsd: 0.09,
      hunyuanMode: 'standard',
      reason: 'long prompt → Hunyuan STD',
    };
  }

  // ── По умолчанию → Hunyuan STD (баланс качества и цены) ──────────
  return {
    model: 'hunyuan_std',
    costUsd: 0.09,
    hunyuanMode: 'standard',
    reason: 'default → Hunyuan STD',
  };
}
