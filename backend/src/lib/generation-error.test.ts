import { describe, it, expect } from 'vitest';
import { friendlyGenerationError } from './generation-error.js';

describe('friendlyGenerationError — классификация ошибок генерации (image/video/music/voice)', () => {
  it('503 внутри сырого JSON от GoAPI — считается перегрузкой', () => {
    const raw = 'GoAPI task failed: {"code":200,"data":{"status":"failed"},"logs":["internal server error\\nstatus code: 503","Internal upstream is busy (too many requests)."]}';
    expect(friendlyGenerationError(raw)).toBe('Сервера перегружены, попробуйте другую модель или повторите чуть позже');
  });

  it('таймаут — считается перегрузкой', () => {
    expect(friendlyGenerationError('OpenRouter image generation: timeout (120s)'))
      .toBe('Сервера перегружены, попробуйте другую модель или повторите чуть позже');
  });

  it('обычная ошибка без признаков перегрузки — текст не подменяется', () => {
    expect(friendlyGenerationError('Unknown image model: foo')).toBe('Unknown image model: foo');
  });
});
