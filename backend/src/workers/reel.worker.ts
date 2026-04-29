import { Worker, type Job } from 'bullmq';
import { createWriteStream, mkdirSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateVideoVeo3, type VeoModel, type VeoDuration, type VeoResolution } from '../services/providers/goapi.js';
import { setMediaCached } from '../services/cache.js';
import { encrypt } from '../lib/crypto.js';

// ── Video сохраняем на наш сервер — GoAPI хранит файлы только 3 дня ───────────
async function saveVideoToDisk(url: string): Promise<string> {
  const dir = path.join(process.cwd(), 'uploads', 'videos');
  mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.mp4`;
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

interface ReelJob {
  jobId: string;
  userId: string;
  prompt: string;
  chatId: string | null;
  videoModel?: VeoModel;
  duration?: VeoDuration;
  aspectRatio?: '16:9' | '9:16';
  enableAudio?: boolean;
  resolution?: VeoResolution;
  imageUrl?: string | null;
  negativePrompt?: string;
}

export function startReelWorker() {
  const worker = new Worker<ReelJob>(
    'reel',
    async (job: Job<ReelJob>) => {
      const {
        jobId, userId, prompt, chatId,
        videoModel = 'standard',
        duration = '8s',
        aspectRatio = '16:9',
        enableAudio = false,
        resolution = '720p',
        imageUrl,
        negativePrompt,
      } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      const genMode = imageUrl ? 'img2video' : 'txt2video';
      console.info(`[ReelWorker] Veo3.1 ${videoModel} | ${genMode} | ${duration} | ${resolution} | audio=${enableAudio}`);

      const externalUrl = await generateVideoVeo3(prompt, {
        model: videoModel,
        duration,
        aspectRatio,
        generateAudio: enableAudio,
        resolution,
        imageUrl: imageUrl ?? undefined,
        negativePrompt: negativePrompt || undefined,
      });

      // ── Сразу помечаем done с внешним URL ──────────────────────────────────
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
            content: encrypt(prompt), mode: 'reel',
            tokensCost: 0, mediaUrl: externalUrl,
          },
        }).catch((e) => {
          console.error('[ReelWorker] Failed to save assistant message:', e.message);
          return null;
        });
        messageId = msg?.id;
      }

      // ── Кешируем только text-to-video (image-to-video зависит от картинки) ─
      if (!imageUrl) setMediaCached('reel', prompt, externalUrl).catch(() => {});

      // ── Скачиваем видео на сервер в фоне (GoAPI хранит только 3 дня!) ───────
      saveVideoToDisk(externalUrl).then(async (filename) => {
        const API_BASE = process.env.API_URL ?? 'https://api.ghostlineai.ru';
        const localUrl = `${API_BASE}/videos/${filename}`;

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

        setMediaCached('reel', prompt, localUrl).catch(() => {});
        console.info(`[ReelWorker] Video saved to disk: ${filename}`);
      }).catch((err: any) => {
        console.warn('[ReelWorker] Background disk save failed:', err.message);
      });

      return { mediaUrl: externalUrl };
    },
    {
      connection: bullmqConnection,
      concurrency: 2,
    }
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      await prisma.generateJob.update({
        where: { id: job.data.jobId },
        data: { status: 'failed', error: err.message },
      });
    }
    console.error(`[ReelWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.info(`[ReelWorker] Job ${job.id} completed`);
  });

  console.info('[ReelWorker] Started (Veo3 Standard/Pro)');
  return worker;
}
