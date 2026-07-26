import { describe, it, expect } from 'vitest';
import { PLAN_KEYS, PLANS, FREE_LIMITS, FREE_WELCOME_CASPERS, CASPER_PRICE_TIERS, calculateCasperPrice } from './plans.js';

describe('calculateCasperPrice', () => {
  it('возвращает 0 для нуля и отрицательных значений', () => {
    expect(calculateCasperPrice(0)).toBe(0);
    expect(calculateCasperPrice(-10)).toBe(0);
  });

  it('считает по первой ступени (3.0₽/Casper) для количества внутри одной ступени', () => {
    expect(calculateCasperPrice(50)).toBe(150);
    expect(calculateCasperPrice(100)).toBe(300);
  });

  it('переходит на следующую ступень при пересечении границы 100', () => {
    // 100*3.0 + 50*2.9 = 300 + 145
    expect(calculateCasperPrice(150)).toBe(445);
  });

  it('корректно суммирует несколько ступеней без ошибок плавающей точки', () => {
    // 100*3.0 + 100*2.9 + 50*2.8 = 300 + 290 + 140
    expect(calculateCasperPrice(250)).toBe(730);
  });

  it('считает максимум (1000 = все 10 ступеней)', () => {
    const sumOfTierPrices = CASPER_PRICE_TIERS.reduce((s, t) => s + t.max * t.price, 0);
    expect(calculateCasperPrice(1000)).toBeCloseTo(sumOfTierPrices, 2);
    expect(calculateCasperPrice(1000)).toBe(2550);
  });

  it('округляет результат до копеек (2 знака) — фронтенд и бот обязаны показывать то же число', () => {
    const result = calculateCasperPrice(333);
    expect(result).toBe(Math.round(result * 100) / 100);
  });
});

describe('PLANS — целостность конфигурации', () => {
  it('PLAN_KEYS 1:1 совпадает с ключами PLANS', () => {
    expect(Object.keys(PLANS).sort()).toEqual([...PLAN_KEYS].sort());
  });

  it('price_yearly = price * 12 * 0.8 для каждого платного плана — иначе фронтенд/бот разойдутся с реальным биллингом', () => {
    for (const key of PLAN_KEYS) {
      const plan = PLANS[key];
      const expectedYearly = Math.round(plan.price * 12 * 0.8);
      expect(plan.price_yearly, `${key}.price_yearly`).toBe(expectedYearly);
    }
  });

  it('FREE ничего не стоит и не даёт платных Caspers/мес', () => {
    expect(PLANS.FREE.price).toBe(0);
    expect(PLANS.FREE.caspers_monthly).toBe(0);
  });

  it('у каждого платного плана положительная цена и положительный caspers_monthly', () => {
    for (const key of PLAN_KEYS) {
      if (key === 'FREE') continue;
      expect(PLANS[key].price).toBeGreaterThan(0);
      expect(PLANS[key].caspers_monthly).toBeGreaterThan(0);
    }
  });

  it('ULTRA — единственный план с безлимитным Про чатом (pro_free_daily = -1)', () => {
    const unlimited = PLAN_KEYS.filter((k) => PLANS[k].pro_free_daily === -1);
    expect(unlimited).toEqual(['ULTRA']);
  });

  it('текст фич FREE-плана берёт числа из FREE_WELCOME_CASPERS/FREE_LIMITS, а не задублирован как отдельные цифры', () => {
    // Регрессия: routes/auth.ts когда-то держал свою копию 100 — если кто-то поменяет
    // сумму бонуса только в auth.ts (или только в тексте фичи), этот тест упадёт.
    expect(PLANS.FREE.features[0]).toBe(`${FREE_WELCOME_CASPERS} Caspers при регистрации`);
    expect(PLANS.FREE.features[1]).toBe(`Стандартный чат: ${FREE_LIMITS.std_messages_daily} сообщений/день`);
  });
});
