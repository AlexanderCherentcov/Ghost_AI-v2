import { describe, it, expect } from 'vitest';
import { calcCasperCost, videoDurationToBackend, DEFAULT_CASPER_COSTS } from './casper-costs';

describe('videoDurationToBackend', () => {
  it('маппит секунды мини-аппа на строковый формат бэкенда', () => {
    expect(videoDurationToBackend(5)).toBe('4s');
    expect(videoDurationToBackend(10)).toBe('8s');
  });
});

describe('calcCasperCost', () => {
  it('обычный чат бесплатный, Про-чат стоит chat_pro', () => {
    expect(calcCasperCost('chat', 'haiku', 5, DEFAULT_CASPER_COSTS)).toBe(0);
    expect(calcCasperCost('chat', undefined, 5, DEFAULT_CASPER_COSTS)).toBe(0);
    expect(calcCasperCost('chat', 'deepseek', 5, DEFAULT_CASPER_COSTS)).toBe(DEFAULT_CASPER_COSTS.chat_pro);
  });

  it('картинка и музыка — фиксированная цена', () => {
    expect(calcCasperCost('images', undefined, 5, DEFAULT_CASPER_COSTS)).toBe(DEFAULT_CASPER_COSTS.image_generate);
    expect(calcCasperCost('music', undefined, 5, DEFAULT_CASPER_COSTS)).toBe(DEFAULT_CASPER_COSTS.music_generate);
  });

  it('видео — цена зависит от длительности, всегда std-тариф (в мини-аппе нет выбора pro-модели)', () => {
    expect(calcCasperCost('video', undefined, 5, DEFAULT_CASPER_COSTS)).toBe(DEFAULT_CASPER_COSTS.video_std_4s);
    expect(calcCasperCost('video', undefined, 10, DEFAULT_CASPER_COSTS)).toBe(DEFAULT_CASPER_COSTS.video_std_8s);
  });
});
