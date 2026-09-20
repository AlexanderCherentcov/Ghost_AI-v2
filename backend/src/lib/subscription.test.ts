import { describe, it, expect } from 'vitest';
import { computeNewExpiry } from './subscription.js';

const NOW = new Date('2026-09-20T12:00:00Z');

describe('computeNewExpiry', () => {
  it('продление того же плана прибавляется к остатку срока', () => {
    const result = computeNewExpiry({
      currentPlan: 'PRO', currentExpiresAt: new Date('2026-09-27T12:00:00Z'),
      newPlan: 'PRO', billing: 'MONTHLY', now: NOW,
    });
    expect(result.toISOString()).toBe('2026-10-27T12:00:00.000Z');
  });

  it('годовое продление не теряет остаток', () => {
    const result = computeNewExpiry({
      currentPlan: 'PRO', currentExpiresAt: new Date('2027-03-20T12:00:00Z'),
      newPlan: 'PRO', billing: 'YEARLY', now: NOW,
    });
    expect(result.toISOString()).toBe('2028-03-20T12:00:00.000Z');
  });

  it('смена плана начинает отсчёт от сегодняшнего дня', () => {
    const result = computeNewExpiry({
      currentPlan: 'BASIC', currentExpiresAt: new Date('2026-12-01T12:00:00Z'),
      newPlan: 'PRO', billing: 'MONTHLY', now: NOW,
    });
    expect(result.toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });

  it('истёкший срок и его отсутствие считаются от сегодняшнего дня', () => {
    const expired = computeNewExpiry({
      currentPlan: 'PRO', currentExpiresAt: new Date('2026-09-01T12:00:00Z'),
      newPlan: 'PRO', billing: 'MONTHLY', now: NOW,
    });
    const none = computeNewExpiry({
      currentPlan: 'FREE', currentExpiresAt: null,
      newPlan: 'PRO', billing: 'YEARLY', now: NOW,
    });
    expect(expired.toISOString()).toBe('2026-10-20T12:00:00.000Z');
    expect(none.toISOString()).toBe('2027-09-20T12:00:00.000Z');
  });

  it('не мутирует переданную дату', () => {
    const current = new Date('2026-09-27T12:00:00Z');
    computeNewExpiry({ currentPlan: 'PRO', currentExpiresAt: current, newPlan: 'PRO', billing: 'MONTHLY', now: NOW });
    expect(current.toISOString()).toBe('2026-09-27T12:00:00.000Z');
  });
});
