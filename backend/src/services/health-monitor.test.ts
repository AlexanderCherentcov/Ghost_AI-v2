import { describe, it, expect, vi } from 'vitest';
import { evaluateHealth, parseMemAvailableMb, parseRedisUsedMb } from './health-monitor.js';

// Импорт модуля тянет Redis и Telegram — для чистых функций они не нужны (vi.mock поднимается выше импортов).
vi.mock('../lib/redis.js', () => ({ redis: {} }));
vi.mock('./admin-notify.js', () => ({ notifyAdmins: vi.fn() }));

const OK = { diskUsedPercent: 40, diskFreeGb: 18, memAvailableMb: 1200, redisUsedMb: 5 };

describe('evaluateHealth', () => {
  it('в норме алертов нет', () => {
    expect(evaluateHealth(OK)).toEqual([]);
  });

  it('диск: алерт на пороге 85% и выше, ниже — тишина', () => {
    expect(evaluateHealth({ ...OK, diskUsedPercent: 84 })).toEqual([]);
    const alerts = evaluateHealth({ ...OK, diskUsedPercent: 85, diskFreeGb: 4.5 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].key).toBe('disk');
    expect(alerts[0].text).toContain('85%');
  });

  it('память: алерт, когда доступно меньше 200 МБ', () => {
    expect(evaluateHealth({ ...OK, memAvailableMb: 200 })).toEqual([]);
    expect(evaluateHealth({ ...OK, memAvailableMb: 199 })[0].key).toBe('memory');
  });

  it('Redis: алерт от 200 МБ', () => {
    expect(evaluateHealth({ ...OK, redisUsedMb: 199 })).toEqual([]);
    expect(evaluateHealth({ ...OK, redisUsedMb: 200 })[0].key).toBe('redis');
  });

  it('не измеренная метрика (null) алерт не порождает', () => {
    expect(evaluateHealth({ diskUsedPercent: null, diskFreeGb: null, memAvailableMb: null, redisUsedMb: null })).toEqual([]);
  });

  it('несколько проблем сразу — несколько алертов', () => {
    const keys = evaluateHealth({ diskUsedPercent: 95, diskFreeGb: 1, memAvailableMb: 50, redisUsedMb: 250 }).map((a) => a.key);
    expect(keys).toEqual(['disk', 'memory', 'redis']);
  });
});

describe('парсеры', () => {
  it('MemAvailable из /proc/meminfo в МБ', () => {
    const meminfo = 'MemTotal:        2015232 kB\nMemFree:          600000 kB\nMemAvailable:    1310720 kB\nBuffers: 1 kB';
    expect(parseMemAvailableMb(meminfo)).toBe(1280);
    expect(parseMemAvailableMb('MemTotal: 1 kB')).toBeNull();
  });

  it('used_memory из INFO memory Redis в МБ', () => {
    expect(parseRedisUsedMb('# Memory\r\nused_memory:5242880\r\nused_memory_human:5.00M')).toBe(5);
    expect(parseRedisUsedMb('# Memory\r\n')).toBeNull();
  });
});
