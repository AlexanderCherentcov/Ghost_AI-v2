import { Worker, type Job } from 'bullmq';
import { createWriteStream, mkdirSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateVideoKling, generateVideoHunyuan, generateMMAudio, type KlingVideoOptions } from '../services/providers/goapi.js';
import { routeVideo } from '../services/video-router.js';
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
  duration?: 5 | 10;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  enableAudio?: boolean;
  imageUrl?: string;
  cameraPreset?: string;
  negativePrompt?: string;
  cfgScale?: number;
}

export function startReelWorker() {
  const worker = new Worker<ReelJob>(
    'reel',
    async (job: Job<ReelJob>) => {
      const {
        jobId, userId, prompt, chatId,
        duration = 5, aspectRatio = '16:9',
        enableAudio = false, imageUrl,
        cameraPreset, negativePrompt, cfgScale,
      } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      // ── Роутер выбирает модель автоматически ──────────────────────────────────
      const route = routeVideo(prompt, !!imageUrl, duration, aspectRatio);
      console.info(`[ReelWorker] ${route.reason} | cost $${route.costUsd}`);

      // ── Авто-негативный промт: блокируем людей если они не нужны ───────────────
      const HUMAN_KEYWORDS = [
        'человек', 'люди', 'девушка', 'парень', 'мужчина', 'женщина', 'ребёнок', 'дети',
        'лицо', 'портрет', 'персонаж',
        'person', 'people', 'man', 'woman', 'girl', 'boy', 'child', 'face', 'portrait', 'character',
        'human', 'figure', 'silhouette',
      ];
      const NO_HUMANS_NEGATIVE = 'people, person, human, man, woman, face, body, figure';
      const promptLower = prompt.toLowerCase();
      const userWantsHumans = HUMAN_KEYWORDS.some((kw) => promptLower.includes(kw));
      const effectiveNegative = userWantsHumans
        ? (negativePrompt ?? '')
        : [negativePrompt, NO_HUMANS_NEGATIVE].filter(Boolean).join(', ');

      let externalUrl: string;

      if (route.model === 'kling_std') {
        // Kling V-2.5 — для людей, лиц, сложных сцен, 10s
        const opts: KlingVideoOptions = {
          duration, aspectRatio, enableAudio, imageUrl,
          cameraPreset, negativePrompt: effectiveNegative || undefined, cfgScale,
        };
        externalUrl = await generateVideoKling(prompt, opts);
      } else {
        // Hunyuan — fast / standard / img2video
        externalUrl = await generateVideoHunyuan(
          prompt,
          route.hunyuanMode ?? 'fast',
          imageUrl,
          aspectRatio,
          effectiveNegative || undefined,
        );
      }

      // ── MMAudio: добавляем атмосферный звук если не запрошен Kling Audio ────────
      // Только для Hunyuan-видео (Kling с enableAudio=true уже имеет звук)
      if (!enableAudio && route.model !== 'kling_std') {
        try {
          const videoWithAudio = await generateMMAudio(externalUrl, duration);
          externalUrl = videoWithAudio;
          console.info(`[ReelWorker] MMAudio added ambient sound to video`);
        } catch (e: any) {
          // MMAudio необязателен — продолжаем без звука
          console.warn(`[ReelWorker] MMAudio failed (non-fatal): ${e.message}`);
        }
      }

      // ── Сразу помечаем done с внешним URL — пользователь видит результат ──────
      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl: externalUrl },
      });

      // ── Сохраняем сообщение в историю чата ───────────────────────────────────
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

      // ── Кешируем только text-to-video без кастомных настроек ─────────────────
      if (!imageUrl) {
        setMediaCached('reel', prompt, externalUrl).catch(() => {});
      }

      // ── Скачиваем видео на сервер в фоне (GoAPI хранит только 3 дня!) ─────────
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

        if (!imageUrl) setMediaCached('reel', prompt, localUrl).catch(() => {});
        console.info(`[ReelWorker] Video saved to disk: ${filename}`);
      }).catch((err: any) => {
        console.warn('[ReelWorker] Background disk save failed, keeping external URL:', err.message);
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

  console.info('[ReelWorker] Started (GoAPI Smart Router: Hunyuan Fast/STD/img2video + Kling V2.5)');
  return worker;
}
