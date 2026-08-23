import { describe, it, expect } from 'vitest';
import {
  CHAT_MODELS, IMAGE_MODELS, VIDEO_MODELS,
  AUTO_MODEL_ID, DEFAULT_CHAT_MODEL_ID, DEFAULT_IMAGE_MODEL_ID, DEFAULT_VIDEO_MODEL_ID,
  findModel, autoEligibleChatModels,
} from './models.js';

// Регрессионные проверки целостности реестра — единого источника правды для
// сайта/бота/будущих приложений (см. routes/plans.ts). Опечатка в id здесь
// молча ломает выбор модели везде одновременно, а не только в одном клиенте.

describe('реестр моделей — целостность id', () => {
  it('id уникальны внутри каждого домена', () => {
    for (const list of [CHAT_MODELS, IMAGE_MODELS, VIDEO_MODELS]) {
      const ids = list.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('ни одна модель не использует зарезервированный id "auto"', () => {
    expect(CHAT_MODELS.some((m) => m.id === AUTO_MODEL_ID)).toBe(false);
  });

  it('дефолтные id ссылаются на реально существующие модели', () => {
    expect(DEFAULT_CHAT_MODEL_ID).toBe(AUTO_MODEL_ID);
    expect(findModel('image', DEFAULT_IMAGE_MODEL_ID)).toBeDefined();
    expect(findModel('video', DEFAULT_VIDEO_MODEL_ID)).toBeDefined();
  });

  it('findModel находит существующую модель и не находит несуществующую', () => {
    expect(findModel('chat', 'gpt-4o')?.id).toBe('gpt-4o');
    expect(findModel('chat', 'no-such-model')).toBeUndefined();
  });
});

describe('реестр моделей — цены', () => {
  it('бесплатная модель чата (Llama) действительно бесплатна и участвует в «Авто»', () => {
    const llama = findModel('chat', 'llama-3.1-fast');
    expect(llama?.cost).toBe(0);
    expect(llama?.autoEligible).toBe(true);
  });

  it('платные чат-модели имеют положительную цену', () => {
    for (const m of CHAT_MODELS.filter((m) => m.id !== 'llama-3.1-fast')) {
      expect(m.cost).toBeGreaterThan(0);
    }
  });

  it('видео: 8-секундный ролик не дешевле 4-секундного той же модели', () => {
    for (const m of VIDEO_MODELS) {
      expect(m.cost('8s')).toBeGreaterThanOrEqual(m.cost('4s'));
    }
  });

  it('картинки: у всех моделей положительная цена', () => {
    for (const m of IMAGE_MODELS) {
      expect(m.cost).toBeGreaterThan(0);
    }
  });
});

describe('autoEligibleChatModels', () => {
  it('возвращает только модели с autoEligible: true', () => {
    const pool = autoEligibleChatModels();
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((m) => m.autoEligible)).toBe(true);
  });
});
