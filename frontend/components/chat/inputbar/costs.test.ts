import { describe, it, expect } from 'vitest';
import { calcCaspers, DEFAULT_CASPER_COSTS } from './costs';
import type { VideoOptions } from './types';

// Регрессионный тест: раньше стоимости в Caspers были захардкожены прямо
// в calcCaspers/getCostDisplay независимо от backend/src/config/plans.ts —
// если бэкенд менял цену операции, бейдж стоимости в InputBar показывал
// старое число, пока сюда не приходили обновлённые costs с /plans.
describe('calcCaspers — стоимость операции по costs из /plans', () => {
  const baseVideoOptions: VideoOptions = {
    videoModel: 'motion',
    duration: '8s',
    aspectRatio: '16:9',
    enableAudio: false,
    resolution: '720p',
    negativePrompt: '',
  };

  it('картинки и музыка берут стоимость из переданного объекта costs, а не из констант', () => {
    expect(calcCaspers('images', baseVideoOptions, DEFAULT_CASPER_COSTS)).toBe(DEFAULT_CASPER_COSTS.image_generate);
    expect(calcCaspers('music', baseVideoOptions, DEFAULT_CASPER_COSTS)).toBe(DEFAULT_CASPER_COSTS.music_generate);
  });

  it('видео: standard 4s/8s и pro (cinema) 4s/8s — все 4 комбинации из costs', () => {
    expect(calcCaspers('video', { ...baseVideoOptions, videoModel: 'motion', duration: '4s' }, DEFAULT_CASPER_COSTS))
      .toBe(DEFAULT_CASPER_COSTS.video_std_4s);
    expect(calcCaspers('video', { ...baseVideoOptions, videoModel: 'motion', duration: '8s' }, DEFAULT_CASPER_COSTS))
      .toBe(DEFAULT_CASPER_COSTS.video_std_8s);
    expect(calcCaspers('video', { ...baseVideoOptions, videoModel: 'cinema', duration: '4s' }, DEFAULT_CASPER_COSTS))
      .toBe(DEFAULT_CASPER_COSTS.video_pro_4s);
    expect(calcCaspers('video', { ...baseVideoOptions, videoModel: 'cinema', duration: '8s' }, DEFAULT_CASPER_COSTS))
      .toBe(DEFAULT_CASPER_COSTS.video_pro_8s);
  });

  it('меняются вслед за costs — не зашиты в код', () => {
    const customCosts = { ...DEFAULT_CASPER_COSTS, image_generate: 999 };
    expect(calcCaspers('images', baseVideoOptions, customCosts)).toBe(999);
  });
});
