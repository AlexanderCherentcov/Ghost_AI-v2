import { describe, it, expect } from 'vitest';
import { calcCaspers, DEFAULT_CASPER_COSTS } from './costs';
import type { VideoOptions } from './types';
import type { VideoModelOption, ImageModelOption } from '@/lib/api';

// Регрессионный тест: раньше стоимости в Caspers были захардкожены прямо
// в calcCaspers/getCostDisplay независимо от backend/src/config/plans.ts —
// если бэкенд менял цену операции, бейдж стоимости в InputBar показывал
// старое число, пока сюда не приходили обновлённые costs с /plans.
//
// С переходом на реестр моделей (backend/src/config/models.ts) цена картинок
// и видео зависит от ВЫБРАННОЙ МОДЕЛИ, а не от фиксированных ключей
// image_generate/video_std_4s — эти тесты проверяют именно это: cost берётся
// из объекта модели, пришедшего с /plans, а не из констант.
describe('calcCaspers — стоимость операции по данным из /plans', () => {
  const baseVideoOptions: VideoOptions = {
    videoModel: 'kling-v2.5',
    duration: '8s',
    aspectRatio: '16:9',
    enableAudio: false,
    resolution: '720p',
    negativePrompt: '',
  };

  const noUiParams = { durationLabels: null, aspectRatios: [], resolutions: [], supportsNegativePrompt: false, cameraPresets: [] };
  const videoModels: VideoModelOption[] = [
    { id: 'kling-v2.5', label: 'GhostLine Reality', minPlan: 'FREE', capabilities: { audio: true }, cost: { '4s': 25, '8s': 40 }, ui: noUiParams },
    { id: 'veo-3.1-pro', label: 'GhostLine Cinema', minPlan: 'BASIC', capabilities: { audio: true }, cost: { '4s': 50, '8s': 90 }, audioCostMultiplier: 2, ui: noUiParams },
  ];

  const imageModel: ImageModelOption = { id: 'gemini-flash-image', label: 'Gemini Flash Image', minPlan: 'FREE', capabilities: {}, cost: 10 };

  it('музыка берёт стоимость из переданного объекта costs (у неё пока нет реестра моделей)', () => {
    expect(calcCaspers('music', baseVideoOptions, DEFAULT_CASPER_COSTS)).toBe(DEFAULT_CASPER_COSTS.music_generate);
  });

  it('картинки берут стоимость из выбранной модели, а не из costs', () => {
    expect(calcCaspers('images', baseVideoOptions, DEFAULT_CASPER_COSTS, imageModel)).toBe(10);
  });

  it('видео: цена зависит и от модели, и от длительности', () => {
    expect(calcCaspers('video', { ...baseVideoOptions, videoModel: 'kling-v2.5', duration: '4s' }, DEFAULT_CASPER_COSTS, undefined, videoModels))
      .toBe(25);
    expect(calcCaspers('video', { ...baseVideoOptions, videoModel: 'kling-v2.5', duration: '8s' }, DEFAULT_CASPER_COSTS, undefined, videoModels))
      .toBe(40);
    expect(calcCaspers('video', { ...baseVideoOptions, videoModel: 'veo-3.1-pro', duration: '4s' }, DEFAULT_CASPER_COSTS, undefined, videoModels))
      .toBe(50);
    expect(calcCaspers('video', { ...baseVideoOptions, videoModel: 'veo-3.1-pro', duration: '8s' }, DEFAULT_CASPER_COSTS, undefined, videoModels))
      .toBe(90);
  });

  it('видео: включённый звук у модели с audioCostMultiplier — цена умножается (Veo: ×2)', () => {
    expect(calcCaspers('video', { ...baseVideoOptions, videoModel: 'veo-3.1-pro', duration: '8s', enableAudio: true }, DEFAULT_CASPER_COSTS, undefined, videoModels))
      .toBe(180);
  });

  it('видео: включённый звук у модели БЕЗ audioCostMultiplier — цена не меняется (Kling: звук бесплатный)', () => {
    expect(calcCaspers('video', { ...baseVideoOptions, videoModel: 'kling-v2.5', duration: '8s', enableAudio: true }, DEFAULT_CASPER_COSTS, undefined, videoModels))
      .toBe(40);
  });

  it('видео: неизвестная/ещё не загруженная модель — 0, а не крэш', () => {
    expect(calcCaspers('video', baseVideoOptions, DEFAULT_CASPER_COSTS, undefined, undefined)).toBe(0);
  });

  it('меняются вслед за данными с бэкенда — не зашиты в код', () => {
    const customImageModel = { ...imageModel, cost: 999 };
    expect(calcCaspers('images', baseVideoOptions, DEFAULT_CASPER_COSTS, customImageModel)).toBe(999);
  });
});
