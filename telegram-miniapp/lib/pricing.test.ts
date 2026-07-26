import { describe, it, expect } from 'vitest';
import { calculateCasperPrice, fakeCyclePrice, type CasperPriceTier } from './pricing';

// Те же тиры, что в backend/src/config/plans.ts CASPER_PRICE_TIERS.
const TIERS: CasperPriceTier[] = [
  { max: 100, price: 3.0 }, { max: 100, price: 2.9 }, { max: 100, price: 2.8 },
  { max: 100, price: 2.7 }, { max: 100, price: 2.6 }, { max: 100, price: 2.5 },
  { max: 100, price: 2.4 }, { max: 100, price: 2.3 }, { max: 100, price: 2.2 },
  { max: 100, price: 2.1 },
];

describe('calculateCasperPrice (miniapp) — должна 1:1 совпадать с backend и сайтом', () => {
  it('те же результаты на тех же входных данных', () => {
    expect(calculateCasperPrice(0, TIERS)).toBe(0);
    expect(calculateCasperPrice(100, TIERS)).toBe(300);
    expect(calculateCasperPrice(150, TIERS)).toBe(445);
    expect(calculateCasperPrice(1000, TIERS)).toBe(2550);
  });

  it('округляет до копеек — раньше миниапп округлял до целого рубля и расходился с реальным списанием', () => {
    const result = calculateCasperPrice(333, TIERS);
    expect(result).toBe(Math.round(result * 100) / 100);
  });
});

describe('fakeCyclePrice', () => {
  it('месяц = реальная цена × 2, год = фейковая месячная × 12', () => {
    expect(fakeCyclePrice(790, 'monthly')).toBe(1580);
    expect(fakeCyclePrice(790, 'yearly')).toBe(1580 * 12);
  });
});
