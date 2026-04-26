import { Worker, type Job } from 'bullmq';
import { createWriteStream, mkdirSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateMusicDiffRhythm, generateMusicUdio } from '../services/providers/goapi.js';
import { routeAudio } from '../services/audio-router.js';
import { setMediaCached } from '../services/cache.js';
import { encrypt } from '../lib/crypto.js';

// ── Сохраняем аудио на диск — GoAPI хранит файлы только 3 дня ───────────────
async function saveAudioToDisk(url: string): Promise<string> {
  const dir = path.join(process.cwd(), 'uploads', 'audio');
  mkdirSync(dir, { recursive: true });

  // Определяем расширение из URL
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? 'mp3';
  const safeExt = ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext) ? ext : 'mp3';

  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${safeExt}`;
  const filepath = path.join(dir, filename);

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);

  const writeStream = createWriteStream(filepath);
  try {
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), writeStream);
  } catch (err) {
    writeStream.destroy();
    try { unlinkSync(filepath); } catch {}
    throw err;
  }
  return filename;
}

interface SoundJob {
  jobId: string;
  userId: string;
  prompt: string;
  duration: number;
  musicMode?: 'short' | 'long' | 'quality';
  chatId?: string | null;
}

export function startSoundWorker() {
  const worker = new Worker<SoundJob>(
    'sound',
    async (job: Job<SoundJob>) => {
      const { jobId, userId, prompt, musicMode = 'short', chatId } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      // ── Выбор модели по режиму пользователя (fallback: авто-роутер) ────────
      let externalUrl: string;

      if (musicMode === 'quality') {
        console.info(`[SoundWorker] quality mode → Udio | cost $0.05`);
        externalUrl = await generateMusicUdio(prompt);
      } else if (musicMode === 'long') {
        console.info(`[SoundWorker] long mode → DiffRhythm Full | cost $0.02`);
        externalUrl = await generateMusicDiffRhythm(prompt, 'full');
      } else {
        // 'short' или неизвестный — авто-роутер
        const route = routeAudio(prompt);
        console.info(`[SoundWorker] short/auto → ${route.reason} | cost $${route.costUsd}`);
        if (route.model === 'udio') {
          externalUrl = await generateMusicUdio(prompt);
        } else {
          externalUrl = await generateMusicDiffRhythm(prompt, route.diffRhythmMode ?? 'base');
        }
      }

      // ── Сразу помечаем done с внешним URL — пользователь слышит результат ─
      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl: externalUrl },
      });

      // ── Сохраняем сообщение в историю чата ─────────────────────────────────
      let messageId: string | undefined;
      if (chatId) {
        const msg = await prisma.message.create({
          data: {
            chatId, userId, role: 'assistant',
            content: encrypt(prompt), mode: 'sound',
            tokensCost: 0, mediaUrl: externalUrl,
          },
        }).catch((e) => {
          console.error('[SoundWorker] Failed to save assistant message:', e.message);
          return null;
        });
        messageId = msg?.id;
      }

      // Cache for future identical prompts
      setMediaCached('sound', prompt, externalUrl).catch(() => {});

      // ── Скачиваем аудио на сервер в фоне (GoAPI хранит только 3 дня!) ──────
      saveAudioToDisk(externalUrl).then(async (filename) => {
        const API_BASE = process.env.API_URL ?? 'https://api.ghostlineai.ru';
        const localUrl = `${API_BASE}/audio/${filename}`;

        await prisma.generateJob.update({
          where: { id: jobId },
          data: { mediaUrl: localUrl },
        }).catch(() => {});

        if (messageId) {
          await prisma.message.update({
            where: { id: messageId },
            data: { mediaUrl: localUrl },
          }).catch(() => {});
        }

        setMediaCached('sound', prompt, localUrl).catch(() => {});
        console.info(`[SoundWorker] Audio saved to disk: ${filename}`);
      }).catch((err: any) => {
        console.warn('[SoundWorker] Background disk save failed, keeping external URL:', err.message);
      });

      return { mediaUrl: externalUrl };
    },
    {
      connection: bullmqConnection,
      concurrency: 3,
    }
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      await prisma.generateJob.update({
        where: { id: job.data.jobId },
        data: { status: 'failed', error: err.message },
      });
    }
    console.error(`[SoundWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.info(`[SoundWorker] Job ${job.id} completed`);
  });

  console.info('[SoundWorker] Started (Audio Router: DiffRhythm Base/Full + Udio)');
  return worker;
}
