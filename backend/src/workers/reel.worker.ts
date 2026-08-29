import { Worker, type Job } from 'bullmq';
import { createWriteStream, mkdirSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateVideoVeo3, generateVideoKling, generateVideoGeneric, type VideoAspectRatio, type VideoResolution } from '../services/providers/goapi.js';
import { findModel, type VideoDurationChoice, type VideoModelSpec } from '../config/models.js';
import { setMediaCached } from '../services/cache.js';
import { encrypt } from '../lib/crypto.js';
import { refundCaspers } from '../services/tokens.js';
import { friendlyGenerationError } from '../lib/generation-error.js';

// ── Video сохраняем на наш сервер — GoAPI хранит файлы только 3 дня ───────────
async function saveVideoUrlToDisk(url: string): Promise<string> {
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
  modelId: string;
  mediaCacheMode: string;
  duration: VideoDurationChoice;
  aspectRatio: VideoAspectRatio;
  enableAudio: boolean;
  resolution: VideoResolution;
  imageUrl?: string | null;
  negativePrompt?: string;
  /** Только Kling — простой пресет камеры, см. buildCameraControl в providers/goapi.ts. */
  cameraPreset?: string;
  // См. комментарий у одноимённого поля в vision.worker.ts — нужно для возврата
  // Caspers при падении job'а после списания.
  caspersSpent: number;
}

// Диспетчер по конкретному GoAPI-провайдеру — вынесен из воркера отдельной
// функцией, чтобы её можно было вызвать дважды: на исходной модели и (если та
// упала) на fallbackModelId (см. VideoModelSpec.fallbackModelId в config/models.ts).
async function generateViaGoapi(
  spec: VideoModelSpec,
  opts: {
    prompt: string;
    duration: VideoDurationChoice;
    aspectRatio: VideoAspectRatio;
    enableAudio: boolean;
    resolution: VideoResolution;
    imageUrl?: string;
    negativePrompt?: string;
    cameraPreset?: string;
  },
): Promise<string> {
  if (spec.goapiModel === 'kling') {
    const klingDuration = opts.duration === '4s' ? 5 : 10;
    return generateVideoKling(opts.prompt, {
      duration: klingDuration,
      aspectRatio: opts.aspectRatio,
      enableAudio: opts.enableAudio,
      imageUrl: opts.imageUrl,
      negativePrompt: opts.negativePrompt || undefined,
      cameraPreset: opts.cameraPreset || undefined,
      mode: spec.klingMode,
      version: spec.klingVersion,
    });
  }
  if (spec.goapiModel === 'veo3.1') {
    const veoModel: 'standard' | 'pro' = spec.goapiTaskType === 'veo3.1-video' ? 'pro' : 'standard';
    return generateVideoVeo3(opts.prompt, {
      model: veoModel,
      duration: opts.duration,
      aspectRatio: opts.aspectRatio,
      generateAudio: opts.enableAudio,
      resolution: opts.resolution,
      imageUrl: opts.imageUrl,
      negativePrompt: opts.negativePrompt || undefined,
    });
  }
  return generateVideoGeneric(spec.goapiModel, {
    prompt: opts.prompt,
    duration: opts.duration,
    aspectRatio: opts.aspectRatio,
    enableAudio: opts.enableAudio,
    resolution: opts.resolution,
    imageUrl: opts.imageUrl,
    negativePrompt: opts.negativePrompt,
  });
}

export function startReelWorker() {
  const worker = new Worker<ReelJob>(
    'reel',
    async (job: Job<ReelJob>) => {
      const {
        jobId, userId, prompt, chatId, modelId, mediaCacheMode,
        duration, aspectRatio, enableAudio, resolution, imageUrl, negativePrompt, cameraPreset,
      } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      const spec = findModel('video', modelId);
      if (!spec) throw new Error(`[ReelWorker] Unknown video model: ${modelId}`);

      const genMode = imageUrl ? 'img2video' : 'txt2video';
      console.info(`[ReelWorker] ${spec.id} | ${genMode} | ${duration} | ${resolution} | audio=${enableAudio}`);

      // ── GoAPI (Kling / Veo3.1 / Sora 2 / Seedance / Hailuo / Wan / ...) ─────
      let externalUrl: string;
      try {
        externalUrl = await generateViaGoapi(spec, {
          prompt, duration, aspectRatio, enableAudio, resolution,
          imageUrl: imageUrl ?? undefined, negativePrompt, cameraPreset,
        });
      } catch (err) {
        // 2026-08-29: Sora/Veo — единственные видео-модели без fallbackModelId (пока
        // не было прецедента их нестабильности) — по прямому указанию Александра
        // после реального падения Sora/Veo от перегрузки GoAPI ("нельзя терять
        // клиентов"): при сбое подставляем Kling Pro/Std того же ценового уровня
        // (см. fallbackModelId в config/models.ts), тем же промптом. Списание уже
        // произошло по цене ИСХОДНОЙ модели (routes/generate.ts, до постановки в
        // очередь) — пользователь платит и видит в истории как за Sora/Veo,
        // независимо от того, кто реально сгенерировал ролик. Редкий путь: если
        // упадёт и резервная модель — ошибка уйдёт наверх как обычно, с полным
        // возвратом Caspers (worker.on('failed') ниже).
        if (!spec.fallbackModelId) throw err;
        const fallbackSpec = findModel('video', spec.fallbackModelId);
        if (!fallbackSpec) throw err;
        console.warn(`[ReelWorker] ${spec.id} failed, falling back to ${fallbackSpec.id}:`, (err as Error).message);
        externalUrl = await generateViaGoapi(fallbackSpec, {
          prompt, duration, aspectRatio, enableAudio, resolution,
          imageUrl: imageUrl ?? undefined, negativePrompt, cameraPreset,
        });
      }

      // Сразу помечаем done с внешним URL — не ждём фоновой докачки, чтобы
      // пользователь увидел результат как можно раньше. modelId — ВСЕГДА исходно
      // запрошенный spec.id (не usedSpec) — фолбэк невидим для пользователя/биллинга,
      // тот же принцип, что у ImageModelSpec.fallbackModel в vision.worker.ts.
      const messageId = await finalizeJob(jobId, chatId, userId, prompt, spec.id, externalUrl, mediaCacheMode, !imageUrl);

      // Скачиваем видео на сервер в фоне (GoAPI хранит только 3 дня!)
      saveVideoUrlToDisk(externalUrl).then(async (filename) => {
        const API_BASE = process.env.API_URL ?? 'https://api.ghostlineai.ru';
        const localUrl = `${API_BASE}/videos/${filename}`;

        await prisma.generateJob.update({ where: { id: jobId }, data: { mediaUrl: localUrl } }).catch(() => {});
        if (messageId) {
          await prisma.message.update({ where: { id: messageId }, data: { mediaUrl: localUrl } }).catch(() => {});
        }
        if (!imageUrl) setMediaCached(mediaCacheMode, prompt, localUrl).catch(() => {});
        console.info(`[ReelWorker] Video saved to disk: ${filename}`);
      }).catch((err: any) => {
        console.warn('[ReelWorker] Background disk save failed:', err.message);
      });

      return { mediaUrl: externalUrl };
    },
    { connection: bullmqConnection, concurrency: 2 },
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      await prisma.generateJob.update({
        where: { id: job.data.jobId },
        data: { status: 'failed', error: friendlyGenerationError(err.message) },
      });
      await refundCaspers(job.data.userId, job.data.caspersSpent, job.data.modelId).catch(() => {});
    }
    console.error(`[ReelWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.info(`[ReelWorker] Job ${job.id} completed`);
  });

  console.info('[ReelWorker] Started');
  return worker;
}

async function finalizeJob(
  jobId: string,
  chatId: string | null,
  userId: string,
  prompt: string,
  modelId: string,
  mediaUrl: string,
  mediaCacheMode: string,
  cacheable: boolean,
): Promise<string | undefined> {
  await prisma.generateJob.update({
    where: { id: jobId },
    data: { status: 'done', mediaUrl, modelId },
  });

  let messageId: string | undefined;
  if (chatId) {
    const msg = await prisma.message.create({
      data: {
        chatId, userId, role: 'assistant',
        content: encrypt(prompt), mode: 'reel',
        tokensCost: 0, mediaUrl, provider: modelId,
      },
    }).catch((e) => {
      console.error('[ReelWorker] Failed to save assistant message:', e.message);
      return null;
    });
    messageId = msg?.id;
  }

  if (cacheable) setMediaCached(mediaCacheMode, prompt, mediaUrl).catch(() => {});
  return messageId;
}
