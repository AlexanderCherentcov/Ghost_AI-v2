import { describe, it, expect } from 'vitest';
import { resolveLegacyModelId } from './legacy-chat-model.js';
import { AUTO_MODEL_ID, FREE_CHAT_MODEL_ID } from '../config/models.js';

describe('resolveLegacyModelId', () => {
  it('«Стандарт» (haiku) — бесплатная модель, а не платный «Авто»', () => {
    expect(resolveLegacyModelId('chat', 'haiku')).toBe(FREE_CHAT_MODEL_ID);
    expect(resolveLegacyModelId(undefined, 'haiku')).toBe(FREE_CHAT_MODEL_ID);
  });

  it('«Про» и старый режим think — DeepSeek', () => {
    expect(resolveLegacyModelId('chat', 'deepseek')).toBe('deepseek-v3.2');
    expect(resolveLegacyModelId('think')).toBe('deepseek-v3.2');
  });

  it('явный «Авто» (ни mode-стандарта, ни haiku) остаётся платным диспетчером', () => {
    expect(resolveLegacyModelId()).toBe(AUTO_MODEL_ID);
    expect(resolveLegacyModelId('chat')).toBe(AUTO_MODEL_ID);
  });
});
