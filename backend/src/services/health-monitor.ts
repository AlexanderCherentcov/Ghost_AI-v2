/**
 * Мониторинг ресурсов сервера
 * ───────────────────────────
 * Раз в 10 минут проверяет диск, свободную память и занятость Redis и шлёт алерт админам.
 * До этого единственным мониторингом были 12-часовые отчёты админ-бота — забитый диск
 * (был 81%, Postgres на полном диске ломается) или память мы бы заметили уже по поломке.
 */

import { readFile, statfs } from 'node:fs/promises';
import { redis } from '../lib/redis.js';
import { notifyAdmins } from './admin-notify.js';

const CHECK_INTERVAL_MS = 10 * 60_000;
// Повторный алерт по тому же поводу — не чаще, чем раз в 6 часов.
const ALERT_COOLDOWN_SECONDS = 6 * 3600;

// Том uploads лежит на том же корневом диске, что и Docker с Postgres — statfs по нему
// показывает заполненность именно того диска, который нас интересует.
const DISK_PATH = process.env.UPLOADS_DIR ?? '/app/uploads';

export const THRESHOLDS = {
  diskUsedPercent: 85,
  memAvailableMb: 200,
  // maxmemory Redis — 256 МБ (infra/docker-compose.yml), политика noeviction: на пределе
  // Redis начнёт отвергать запись, и логин сломается у всех (refresh-токены лежат в нём).
  redisUsedMb: 200,
} as const;

export interface Metrics {
  diskUsedPercent: number | null;
  diskFreeGb: number | null;
  memAvailableMb: number | null;
  redisUsedMb: number | null;
}

export interface Alert {
  key: string;
  text: string;
}

export function parseMemAvailableMb(meminfo: string): number | null {
  const match = /^MemAvailable:\s+(\d+)\s+kB/m.exec(meminfo);
  return match ? Math.round(parseInt(match[1], 10) / 1024) : null;
}

export function parseRedisUsedMb(info: string): number | null {
  const match = /^used_memory:(\d+)/m.exec(info);
  return match ? Math.round(parseInt(match[1], 10) / 1024 / 1024) : null;
}

/** Чистая функция: метрики → список алертов. null (не удалось измерить) алерт не порождает. */
export function evaluateHealth(m: Metrics): Alert[] {
  const alerts: Alert[] = [];

  if (m.diskUsedPercent !== null && m.diskUsedPercent >= THRESHOLDS.diskUsedPercent) {
    alerts.push({
      key: 'disk',
      text: `⚠️ <b>Диск сервера заполнен на ${m.diskUsedPercent}%</b>\nСвободно ${m.diskFreeGb} ГБ. Проверь <code>docker system df</code> и размер логов.`,
    });
  }
  if (m.memAvailableMb !== null && m.memAvailableMb < THRESHOLDS.memAvailableMb) {
    alerts.push({
      key: 'memory',
      text: `⚠️ <b>Мало свободной памяти: ${m.memAvailableMb} МБ</b>\nДальше — своп и риск OOM-kill. Проверь <code>docker stats</code>.`,
    });
  }
  if (m.redisUsedMb !== null && m.redisUsedMb >= THRESHOLDS.redisUsedMb) {
    alerts.push({
      key: 'redis',
      text: `⚠️ <b>Redis занял ${m.redisUsedMb} МБ из 256</b>\nПри 256 МБ он перестанет принимать запись — сломается вход у всех.`,
    });
  }
  return alerts;
}

async function collectMetrics(): Promise<Metrics> {
  const metrics: Metrics = { diskUsedPercent: null, diskFreeGb: null, memAvailableMb: null, redisUsedMb: null };

  try {
    const s = await statfs(DISK_PATH);
    metrics.diskUsedPercent = Math.round((1 - s.bavail / s.blocks) * 100);
    metrics.diskFreeGb = Math.round((s.bavail * s.bsize) / 1024 ** 3 * 10) / 10;
  } catch { /* путь недоступен — не алертим */ }

  try {
    metrics.memAvailableMb = parseMemAvailableMb(await readFile('/proc/meminfo', 'utf8'));
  } catch { /* не Linux — не алертим */ }

  try {
    metrics.redisUsedMb = parseRedisUsedMb(await redis.info('memory'));
  } catch { /* Redis недоступен — это ловит health-check, тут не дублируем */ }

  return metrics;
}

export async function runHealthCheck(): Promise<Alert[]> {
  const alerts = evaluateHealth(await collectMetrics());
  for (const alert of alerts) {
    // SET NX EX — повторные алерты по тому же поводу гасятся на 6 часов и переживают рестарт backend.
    const first = await redis.set(`health_alert:${alert.key}`, '1', 'EX', ALERT_COOLDOWN_SECONDS, 'NX').catch(() => null);
    if (first === 'OK') await notifyAdmins(alert.text);
  }
  return alerts;
}

export function startHealthMonitor(): void {
  const run = () => runHealthCheck().catch((err) => console.error('[HealthMonitor] Ошибка проверки:', err));
  setTimeout(run, 60_000).unref(); // не в момент старта, когда всё ещё поднимается
  setInterval(run, CHECK_INTERVAL_MS).unref();
}
