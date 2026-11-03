import { describe, it, expect } from 'vitest';
import { moscowDayStart, moscowMonthStart } from './msk-day.js';

describe('границы суток по Москве', () => {
  it('после полуночи МСК день уже новый, хотя в UTC ещё предыдущие сутки', () => {
    // 3 ноября 2026, 00:30 МСК = 2 ноября 21:30 UTC
    const now = new Date('2026-11-02T21:30:00Z');
    expect(moscowDayStart(now).toISOString()).toBe('2026-11-02T21:00:00.000Z');
    expect(moscowMonthStart(now).toISOString()).toBe('2026-10-31T21:00:00.000Z');
  });

  it('за 30 минут до полуночи МСК день ещё вчерашний', () => {
    // 2 ноября 2026, 23:30 МСК = 2 ноября 20:30 UTC
    const now = new Date('2026-11-02T20:30:00Z');
    expect(moscowDayStart(now).toISOString()).toBe('2026-11-01T21:00:00.000Z');
  });
});
