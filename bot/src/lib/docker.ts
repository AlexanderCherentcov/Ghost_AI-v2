// Docker-хелперы админ-бота (список контейнеров, логи, рестарт, статистика) —
// вынесены из admin-bot.ts, чтобы файл с командами не смешивал регистрацию
// хендлеров с низкоуровневой работой с Docker socket.
import { docker } from './admin-api.js';

const COMPOSE_PROJECT = process.env.COMPOSE_PROJECT ?? 'infra';

// ─── Списки сервисов ────────────────────────────────────────────────────────
// Раньше эти списки были продублированы по отдельности в 7 местах (команда +
// её callback-дубль для /restart, /logs, /sys, плюс containerLogs/allContainerStatuses)
// и незаметно разошлись. Три набора — не ошибка, а разный допустимый охват:

/** Все сервисы — для просмотра логов "вручную" и общего статуса. */
export const ALL_SERVICES: string[] = ['backend', 'bot', 'admin-bot', 'nginx', 'redis', 'postgres', 'certbot'];

/** Без postgres — рестарт БД через бота небезопасен, только руками на сервере. */
export const RESTARTABLE_SERVICES: string[] = ['backend', 'bot', 'nginx', 'redis', 'admin-bot', 'certbot'];

/** Без certbot — короткоживущий контейнер (запускается по крону и завершается), логи/статистика неинформативны. */
export const LOGGABLE_SERVICES: string[] = ['backend', 'bot', 'admin-bot', 'nginx', 'redis', 'postgres'];

function cname(svc: string): string {
  return `${COMPOSE_PROJECT}-${svc}-1`;
}

/** Разбирает мультиплексированный поток логов Docker (8-байтный заголовок на чанк). */
function parseDockerLogs(buf: Buffer): string {
  const lines: string[] = [];
  let i = 0;
  while (i + 8 <= buf.length) {
    const size = buf.readUInt32BE(i + 4);
    if (size === 0) { i += 8; continue; }
    const end = i + 8 + size;
    if (end > buf.length) break;
    lines.push(buf.slice(i + 8, end).toString('utf8').trimEnd());
    i = end;
  }
  return lines.join('\n');
}

export async function containerLogs(svc: string, tail = 60): Promise<string> {
  if (!ALL_SERVICES.includes(svc)) throw new Error(`Unknown service: ${svc}`);
  const res = await docker.get(
    `/containers/${cname(svc)}/logs?tail=${tail}&stdout=1&stderr=1&timestamps=1`,
    { responseType: 'arraybuffer' },
  );
  return parseDockerLogs(Buffer.from(res.data as ArrayBuffer));
}

export async function containerRestart(svc: string): Promise<void> {
  await docker.post(`/containers/${cname(svc)}/restart`);
}

export async function allContainerStatuses(): Promise<Record<string, string>> {
  const res  = await docker.get<any[]>('/containers/json?all=1');
  const out: Record<string, string> = {};
  for (const svc of ALL_SERVICES) {
    const needle = `/${cname(svc)}`;
    const c      = res.data.find((x: any) => (x.Names as string[])?.includes(needle));
    out[svc]     = c?.State ?? 'missing';
  }
  return out;
}

export async function containerStats(svc: string): Promise<{ cpu: string; memMb: string; memPct: string } | null> {
  try {
    const res = await docker.get<any>(`/containers/${cname(svc)}/stats?stream=false`);
    const s   = res.data;
    const cpuDelta    = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
    const systemDelta = s.cpu_stats.system_cpu_usage     - s.precpu_stats.system_cpu_usage;
    const cpus        = s.cpu_stats.online_cpus ?? 1;
    const cpu         = systemDelta > 0 ? ((cpuDelta / systemDelta) * cpus * 100).toFixed(1) : '0.0';
    const memMb  = ((s.memory_stats.usage ?? 0) / 1024 / 1024).toFixed(0);
    const memPct = s.memory_stats.limit > 0
      ? (((s.memory_stats.usage ?? 0) / s.memory_stats.limit) * 100).toFixed(1)
      : '?';
    return { cpu, memMb, memPct };
  } catch {
    return null;
  }
}
