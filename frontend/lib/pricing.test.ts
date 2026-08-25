import { describe, it, expect } from 'vitest';
import { calculateCasperPrice, pricePerCasper, fakeCyclePrice, freeTierTagline } from './pricing';
import type { CasperPriceTier } from './api';

// Те же тиры, что в backend/src/config/plans.ts CASPER_PRICE_TIERS —
// продублированы здесь намеренно (как реальный ответ /plans), чтобы тест не зависел от бэкенда.
const TIERS: CasperPriceTier[] = [
  { max: 100, price: 3.0 }, { max: 100, price: 2.9 }, { max: 100, price: 2.8 },
  { max: 100, price: 2.7 }, { max: 100, price: 2.6 }, { max: 100, price: 2.5 },
  { max: 100, price: 2.4 }, { max: 100, price: 2.3 }, { max: 100, price: 2.2 },
  { max: 100, price: 2.1 },
];

describe('calculateCasperPrice (frontend) — должна 1:1 совпадать с backend', () => {
  it('те же результаты, что у backend/src/config/plans.ts на тех же входных данных', () => {
    expect(calculateCasperPrice(0, TIERS)).toBe(0);
    expect(calculateCasperPrice(100, TIERS)).toBe(300);
    expect(calculateCasperPrice(150, TIERS)).toBe(445);
    expect(calculateCasperPrice(250, TIERS)).toBe(730);
    expect(calculateCasperPrice(1000, TIERS)).toBe(2550);
  });

  it('округляет до копеек, а не до целого рубля — раньше расходилось с реальным списанием', () => {
    const result = calculateCasperPrice(333, TIERS);
    expect(result).toBe(Math.round(result * 100) / 100);
  });

  it('пустой массив тиров (ответ /plans ещё не загрузился) — не падает, отдаёт 0', () => {
    expect(calculateCasperPrice(100, [])).toBe(0);
  });
});

describe('pricePerCasper', () => {
  it('цена за штуку падает с ростом объёма (эффект оптовой скидки)', () => {
    const small = pricePerCasper(50, TIERS);
    const large = pricePerCasper(1000, TIERS);
    expect(large).toBeLessThan(small);
  });

  it('для 0 — цена первой ступени', () => {
    expect(pricePerCasper(0, TIERS)).toBe(3.0);
  });
});

describe('fakeCyclePrice — маркетинговая зачёркнутая цена', () => {
  it('месяц = реальная цена × 2', () => {
    expect(fakeCyclePrice(790, 'monthly')).toBe(1580);
  });

  it('год = фейковая месячная × 12 (не реальная годовая × 12!)', () => {
    expect(fakeCyclePrice(790, 'yearly')).toBe(1580 * 12);
  });
});

describe('freeTierTagline — единственное место сборки этого текста', () => {
  it('подставляет реальный дневной лимит, а не захардкоженное число', () => {
    expect(freeTierTagline(10)).toBe('10 бесплатных сообщений в день · картинки и музыка за Caspers');
    expect(freeTierTagline(20)).toBe('20 бесплатных сообщений в день · картинки и музыка за Caspers');
  });
});
