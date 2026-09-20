/**
 * Сверка зависших генераций
 * ─────────────────────────
 * Воркеры запущены с maxStalledCount: 0 (повторный запуск job'а после падения воркера
 * означал бы двойную оплату провайдеру). Цена: если процесс убили посреди генерации
 * (деплой, OOM), BullMQ переводит job в failed, но событие 'failed' воркера при этом
 * НЕ срабатывает — GenerateJob навсегда остаётся processing, а Caspers не возвращаются.
 * Эта сверка находит такие строки и закрывает их с возвратом.
 */

import { prisma } from '../lib/prisma.js';
import { visionQueue, soundQueue, reelQueue } from '../lib/bullmq.js';
import { refundCaspers } from './tokens.js';

// Порог «задача зависла»: не короче реальной латентности модели, иначе легитимную
// долгую генерацию закроем раньше времени. Те же значения использует guard одновременных
// задач в routes/generate.ts.
export const STALE_JOB_MINUTES = {
  vision: 12,
  sound: 5,
  reel: 15,
} as const;

export type GenerateMode = keyof typeof STALE_JOB_MINUTES;

const QUEUES = { vision: visionQueue, sound: soundQueue, reel: reelQueue } as const;

// Состояния, в которых задачей ещё управляет BullMQ — не вмешиваемся.
const LIVE_STATES = new Set(['active', 'waiting', 'delayed', 'prioritized', 'waiting-children']);

const STALLED_JOB_MESSAGE = 'Генерация прервана из-за обновления сервиса — попробуйте ещё раз';
const BATCH_LIMIT = 100;
const RECONCILE_INTERVAL_MS = 2 * 60_000;

/** Возвращает число закрытых задач. */
export async function reconcileStuckJobs(): Promise<number> {
  let closed = 0;

  for (const mode of Object.keys(STALE_JOB_MINUTES) as GenerateMode[]) {
    const cutoff = new Date(Date.now() - STALE_JOB_MINUTES[mode] * 60_000);
    const stuck = await prisma.generateJob.findMany({
      where: { mode, status: { in: ['pending', 'processing'] }, createdAt: { lt: cutoff } },
      select: { id: true, bullJobId: true },
      take: BATCH_LIMIT,
    });

    for (const row of stuck) {
      const bullJob = row.bullJobId ? await QUEUES[mode].getJob(row.bullJobId) : undefined;
      const state = bullJob ? await bullJob.getState() : 'missing';

      if (LIVE_STATES.has(state)) continue;
      // completed — результат уже выдан воркером, статус в БД он проставит сам.
      if (state === 'completed') continue;

      // Атомарно «занимаем» закрытие: возврат делаем только тому, кто реально перевёл статус.
      const claimed = await prisma.generateJob.updateMany({
        where: { id: row.id, status: { in: ['pending', 'processing'] } },
        data: { status: 'failed', error: STALLED_JOB_MESSAGE },
      });
      if (claimed.count !== 1) continue;
      closed++;

      const data = bullJob?.data as { userId?: string; caspersSpent?: number; modelId?: string } | undefined;
      if (data?.userId && data.caspersSpent) {
        // Тот же reason, что у штатного возврата воркера (sound.worker.ts).
        await refundCaspers(data.userId, data.caspersSpent, data.modelId ?? (mode === 'sound' ? 'music_generate' : mode));
        console.warn(`[JobReconciler] ${mode} job ${row.id} закрыт как зависший, возвращено ${data.caspersSpent} Caspers`);
      } else {
        // Данные задачи уже вычищены из очереди — сумму списания восстановить нечем.
        console.warn(`[JobReconciler] ${mode} job ${row.id} закрыт как зависший БЕЗ возврата (нет данных о списании) — проверить вручную`);
      }
    }
  }

  return closed;
}

/** Первая сверка сразу при старте, дальше раз в 2 минуты; ошибки не роняют процесс. */
export function startJobReconciler(): void {
  const run = () => reconcileStuckJobs().catch((err) => console.error('[JobReconciler] Ошибка сверки:', err));
  void run();
  setInterval(run, RECONCILE_INTERVAL_MS).unref();
}
