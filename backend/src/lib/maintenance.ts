// ─── Режим технических работ ──────────────────────────────────────────────────
// Единый флаг для сайта, бота и админ-бота — хранится в Redis (не в Postgres:
// это состояние типа "сейчас идут работы", терять его при рестарте Redis не
// страшно — просто вернётся active:false, а не наоборот). Читают все клиенты
// через публичный GET /api/maintenance, пишет только админ-бот через
// защищённый bot-secret'ом POST /api/admin/maintenance.

import { redis } from './redis.js';

const KEY = 'maintenance:state';

export interface MaintenanceState {
  active: boolean;
  /** ISO-строка, когда ожидается завершение работ. null — время не указано ("до отмены"). */
  until: string | null;
  /**
   * Одноразовый секрет обхода баннера для Александра — генерируется заново
   * при каждом включении тех.работ (см. routes/admin.ts) и живёт ровно
   * столько, сколько активно это состояние. NULL, когда тех.работы выключены —
   * обходить тогда нечего, и старая ссылка автоматически перестаёт работать.
   * Наружу (в /api/maintenance) никогда не отдаётся — только сверяется.
   */
  bypassToken: string | null;
}

const DEFAULT_STATE: MaintenanceState = { active: false, until: null, bypassToken: null };

export async function getMaintenanceState(): Promise<MaintenanceState> {
  try {
    const raw = await redis.get(KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as MaintenanceState;
    // Если срок вышел, а админ забыл выключить вручную — не подвешиваем
    // пользователей в тех.работах навсегда, считаем их автоматически снятыми.
    // Заодно "сжигает" протухшую ссылку-обход — она была рассчитана на этот срок.
    if (parsed.active && parsed.until && new Date(parsed.until).getTime() < Date.now()) {
      return DEFAULT_STATE;
    }
    return parsed;
  } catch {
    return DEFAULT_STATE;
  }
}

export async function setMaintenanceState(state: MaintenanceState): Promise<void> {
  await redis.set(KEY, JSON.stringify(state));
}
