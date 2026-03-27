/**
 * TTL Auto-Cleanup Worker
 * ────────────────────────
 * Автоматически удаляет устаревшие данные:
 *   • Сообщения и пустые чаты старше MESSAGE_TTL_DAYS (default 60)
 *   • Завершённые/упавшие задачи генерации старше JOB_TTL_DAYS (default 30)
 *   • Записи вектор-кэша старше VECTOR_CACHE_TTL_DAYS (default 90)
 *
 * Запускается при старте приложения и затем раз в сутки.
 */

import { prisma } from '../lib/prisma.js';

const MESSAGE_TTL_DAYS     = parseInt(process.env.MESSAGE_TTL_DAYS      ?? '60');
const JOB_TTL_DAYS         = parseInt(process.env.JOB_TTL_DAYS          ?? '30');
const VECTOR_CACHE_TTL_DAYS = parseInt(process.env.VECTOR_CACHE_TTL_DAYS ?? '90');

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export async function runCleanup(): Promise<void> {
  const startMs = Date.now();
  const messageCutoff = daysAgo(MESSAGE_TTL_DAYS);
  const jobCutoff     = daysAgo(JOB_TTL_DAYS);
  const vectorCutoff  = daysAgo(VECTOR_CACHE_TTL_DAYS);

  try {
    // 1. Удаляем старые сообщения
    const { count: deletedMessages } = await prisma.message.deleteMany({
      where: { createdAt: { lt: messageCutoff } },
    });

    // 2. Удаляем пустые чаты (все сообщения удалены или никогда не было)
    const { count: deletedChats } = await prisma.chat.deleteMany({
      where: {
        messages: { none: {} },
        updatedAt: { lt: messageCutoff },
      },
    });

    // 3. Удаляем завершённые/упавшие задачи генерации
    const { count: deletedJobs } = await prisma.generateJob.deleteMany({
      where: {
        status: { in: ['done', 'failed'] },
        updatedAt: { lt: jobCutoff },
      },
    });

    // 4. Истекаем пробные токены
    // Если trialExpiresAt < now И нет ни одной PURCHASE/SUBSCRIPTION транзакции →
    // обнуляем баланс (пробный период истёк, ничего не купил)
    let expiredTrials = 0;
    try {
      const expiredUsers = await prisma.user.findMany({
        where: {
          trialExpiresAt: { lt: new Date() },
          tokenBalance: { gt: 0 },
        },
        select: {
          id: true,
          tokenBalance: true,
          transactions: {
            where: { type: { in: ['PURCHASE', 'SUBSCRIPTION'] } },
            take: 1,
            select: { id: true },
          },
        },
      });

      for (const u of expiredUsers) {
        // Skip users who already bought tokens
        if (u.transactions.length > 0) continue;
        await prisma.$transaction([
          prisma.user.update({
            where: { id: u.id },
            data: { tokenBalance: 0, trialExpiresAt: null },
          }),
          prisma.tokenTransaction.create({
            data: {
              userId: u.id,
              amount: -u.tokenBalance,
              type: 'USAGE',
              meta: { reason: 'trial_expired' },
            },
          }),
        ]);
        expiredTrials++;
      }
    } catch (trialErr: any) {
      console.error('[Cleanup] Trial expiry error:', trialErr.message);
    }

    // 5. Удаляем старые записи вектор-кэша (если таблица существует)
    let deletedVectors = 0;
    try {
      const result = await prisma.$executeRaw`
        DELETE FROM cached_embeddings
        WHERE created_at < ${vectorCutoff}
      `;
      deletedVectors = Number(result);
    } catch {
      // Таблица может не существовать если pgvector не инициализирован
    }

    const elapsed = Date.now() - startMs;
    console.info(
      `[Cleanup] Done in ${elapsed}ms — messages: ${deletedMessages}, ` +
      `chats: ${deletedChats}, jobs: ${deletedJobs}, vectors: ${deletedVectors}, ` +
      `trialExpired: ${expiredTrials}`
    );
  } catch (err: any) {
    console.error('[Cleanup] Error during cleanup:', err.message);
  }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function startCleanupWorker(): void {
  // Запуск при старте — немного отложенный чтобы не мешать инициализации
  setTimeout(() => {
    runCleanup().catch((err) => console.error('[Cleanup] Startup run failed:', err));
  }, 30_000); // через 30 сек после старта

  // Раз в сутки
  const DAILY = 24 * 60 * 60 * 1000;
  setInterval(() => {
    runCleanup().catch((err) => console.error('[Cleanup] Scheduled run failed:', err));
  }, DAILY).unref(); // unref — не держит процесс если остальное завершилось

  console.info(
    `[Cleanup] Worker started — TTL: messages=${MESSAGE_TTL_DAYS}d, ` +
    `jobs=${JOB_TTL_DAYS}d, vectors=${VECTOR_CACHE_TTL_DAYS}d`
  );
}
