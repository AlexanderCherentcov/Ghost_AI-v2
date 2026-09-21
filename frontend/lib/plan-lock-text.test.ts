import { describe, it, expect } from 'vitest';
import { lockedModelText, planName } from './plan-lock-text';

describe('lockedModelText', () => {
  it('называет модель, нужный и текущий тариф и успокаивает про Caspers', () => {
    const text = lockedModelText('GPT Image mini', 'BASIC', 'FREE');
    expect(text).toContain('«GPT Image mini»');
    expect(text).toContain('тарифа Basic и выше');
    expect(text).toContain('«Бесплатный»');
    expect(text).toContain('Caspers на балансе не пропадут');
  });

  it('без данных о модели и тарифе остаётся связным', () => {
    const text = lockedModelText();
    expect(text).toContain('Эта модель доступна с более высокого тарифа');
    expect(text).not.toContain('Сейчас у вас');
  });

  it('неизвестный ключ тарифа показывается как есть', () => {
    expect(planName('NEW_PLAN')).toBe('NEW_PLAN');
    expect(planName(undefined)).toBe('');
  });
});
