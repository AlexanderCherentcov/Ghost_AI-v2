/**
 * TTL Auto-Cleanup Worker
 * ────────────────────────
 * Автоматически удаляет устаревшие данные:
 *   • Сообщения и пустые чаты старше MESSAGE_TTL_DAYS (default 60)
 *   • Завершённые/упавшие задачи генерации старше JOB_TTL_DAYS (default 30)
 *   • Записи вектор-кэша старше VECTOR_CACHE_TTL_DAYS (default 90)
 *   • Видеофайлы на диске старше VIDEO_TTL_DAYS (default 60) без ссылок в БД
 *
 * Запускается при старте приложения и затем раз в сутки.
 */

import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';

const MESSAGE_TTL_DAYS      = parseInt(process.env.MESSAGE_TTL_DAYS      ?? '60');
const JOB_TTL_DAYS          = parseInt(process.env.JOB_TTL_DAYS          ?? '30');
const VECTOR_CACHE_TTL_DAYS = parseInt(process.env.VECTOR_CACHE_TTL_DAYS ?? '90');
const VIDEO_TTL_DAYS        = parseInt(process.env.VIDEO_TTL_DAYS        ?? '60'); // ~2 месяца

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ─── Video file cleanup ───────────────────────────────────────────────────────
// Удаляет файлы из uploads/videos/ которые:
//   1. Старше VIDEO_TTL_DAYS дней по mtime
//   2. НЕ упоминаются ни в одном Message или GenerateJob в БД
// Безопасно: файл в использовании — не трогается.

async function cleanupVideoFiles(): Promise<number> {
  const videosDir = path.join(process.cwd(), 'uploads', 'videos');

  let filenames: string[];
  try {
    filenames = await readdir(videosDir);
  } catch {
    return 0; // директория ещё не создана
  }
  if (filenames.length === 0) return 0;

  const cutoff = daysAgo(VIDEO_TTL_DAYS);

  // Собираем все локальные URL видео из БД (и сообщения, и задачи)
  const [msgRows, jobRows] = await Promise.all([
    prisma.message.findMany({
      where: { mediaUrl: { contains: '/videos/' } },
      select: { mediaUrl: true },
    }),
    prisma.generateJob.findMany({
      where: { mediaUrl: { contains: '/videos/' } },
      select: { mediaUrl: true },
    }),
  ]);

  const referencedNames = new Set<string>();
  for (const { mediaUrl } of [...msgRows, ...jobRows]) {
    const name = mediaUrl?.split('/videos/').pop();
    if (name) referencedNames.add(name);
  }

  let deleted = 0;
  for (const filename of filenames) {
    if (referencedNames.has(filename)) continue; // ещё используется

    const filepath = path.join(videosDir, filename);
    try {
      const { mtime } = await stat(filepath);
      if (mtime < cutoff) {
        await unlink(filepath);
        deleted++;
      }
    } catch {
      // файл уже удалён другим процессом — игнорируем
    }
  }

  return deleted;
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

    // 4. Expired plan cleanup (plan expiry handled by webhook / future cron)
    const expiredTrials = 0;

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

    // 6. Удаляем видеофайлы старше VIDEO_TTL_DAYS без ссылок в БД
    const deletedVideos = await cleanupVideoFiles().catch((err) => {
      console.error('[Cleanup] Video cleanup error:', err.message);
      return 0;
    });

    const elapsed = Date.now() - startMs;
    console.info(
      `[Cleanup] Done in ${elapsed}ms — messages: ${deletedMessages}, ` +
      `chats: ${deletedChats}, jobs: ${deletedJobs}, vectors: ${deletedVectors}, ` +
      `videos: ${deletedVideos}, trialExpired: ${expiredTrials}`
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
    `jobs=${JOB_TTL_DAYS}d, vectors=${VECTOR_CACHE_TTL_DAYS}d, videos=${VIDEO_TTL_DAYS}d`
  );
}
