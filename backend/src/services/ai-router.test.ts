import { describe, it, expect } from 'vitest';
import { resolveChatModel, isSearchQuery, VisionNotSupportedError, UnknownModelError } from './ai-router.js';
import { AUTO_MODEL_ID, findModel } from '../config/models.js';

const baseCtx = { prompt: 'привет', hasImage: false, hasDocument: false, plan: 'FREE' };

describe('resolveChatModel — явный выбор модели уважается всегда', () => {
  it('явно выбранная модель возвращается как есть, viaAuto: false', () => {
    const { spec, viaAuto } = resolveChatModel('gpt-4o', baseCtx);
    expect(spec.id).toBe('gpt-4o');
    expect(viaAuto).toBe(false);
  });

  it('неизвестный id — бросает UnknownModelError, а не тихо откатывается на дефолт', () => {
    expect(() => resolveChatModel('not-a-real-model', baseCtx)).toThrow(UnknownModelError);
  });

  it('модель без vision + картинка в запросе — бросает ошибку вместо молчаливой подмены модели', () => {
    // deepseek-v3.2 не имеет capabilities.vision (см. config/models.ts)
    expect(() => resolveChatModel('deepseek-v3.2', { ...baseCtx, hasImage: true })).toThrow(VisionNotSupportedError);
  });

  it('модель с vision + картинка — работает без ошибки', () => {
    const { spec } = resolveChatModel('gpt-4o-mini', { ...baseCtx, hasImage: true });
    expect(spec.id).toBe('gpt-4o-mini');
  });

  // Регрессия: раньше explicit-выбор мог быть тихо переигран диспетчером (списание
  // по одной модели, ответ от другой) — здесь фиксируем, что cost всегда идёт от
  // РЕАЛЬНО возвращённого spec, а spec для explicit-выбора == сам выбор.
  it('cost возвращаемого spec совпадает с реестром для explicit-выбора', () => {
    const { spec } = resolveChatModel('gpt-4o', baseCtx);
    const registrySpec = findModel('chat', 'gpt-4o');
    expect(spec.cost).toBe(registrySpec!.cost);
  });
});

describe('resolveChatModel — режим «Авто» (только когда явно выбран AUTO_MODEL_ID)', () => {
  it('картинка в запросе — «Авто» подбирает vision-модель', () => {
    const { spec, viaAuto } = resolveChatModel(AUTO_MODEL_ID, { ...baseCtx, hasImage: true });
    expect(spec.capabilities?.vision).toBe(true);
    expect(viaAuto).toBe(true);
  });

  it('платный тариф + поисковый запрос — «Авто» выбирает Sonar', () => {
    const { spec } = resolveChatModel(AUTO_MODEL_ID, { ...baseCtx, plan: 'PRO', prompt: 'последние новости про ИИ' });
    expect(spec.id).toBe('sonar');
  });

  it('FREE-тариф + поисковый запрос — Sonar НЕ выбирается (платная модель для FREE через Авто недоступна)', () => {
    const { spec } = resolveChatModel(AUTO_MODEL_ID, { ...baseCtx, plan: 'FREE', prompt: 'последние новости про ИИ' });
    expect(spec.id).not.toBe('sonar');
  });

  it('документ или сложный запрос — «Авто» выбирает более сильную платную модель', () => {
    const { spec } = resolveChatModel(AUTO_MODEL_ID, { ...baseCtx, hasDocument: true });
    expect(spec.id).toBe('deepseek-v3.2');
  });

  it('простой короткий запрос — «Авто» экономит и выбирает бесплатную модель', () => {
    const { spec } = resolveChatModel(AUTO_MODEL_ID, baseCtx);
    expect(spec.id).toBe('llama-3.1-fast');
    expect(spec.cost).toBe(0);
  });
});

describe('isSearchQuery', () => {
  it('распознаёт русские и английские поисковые формулировки', () => {
    expect(isSearchQuery('какие сейчас последние новости')).toBe(true);
    expect(isSearchQuery('what is the current price of bitcoin')).toBe(true);
  });

  it('обычный вопрос не считается поисковым', () => {
    expect(isSearchQuery('расскажи анекдот')).toBe(false);
  });
});
