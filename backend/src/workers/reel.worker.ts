import { Worker, type Job } from 'bullmq';
import { createWriteStream, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateVideoVeo3, generateVideoKling, generateVideoGeneric, type VideoAspectRatio, type VideoResolution } from '../services/providers/goapi.js';
import { generateVideoSora, type SoraModel } from '../services/providers/openai-video.js';
import { findModel, type VideoDurationChoice } from '../config/models.js';
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

/** Sora отдаёт готовые байты сразу (нет промежуточного внешнего URL от GoAPI) — пишем напрямую. */
function saveVideoBufferToDisk(buffer: Buffer): string {
  const dir = path.join(process.cwd(), 'uploads', 'videos');
  mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.mp4`;
  writeFileSync(path.join(dir, filename), buffer);
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

      // Sora — прямой провайдер OpenAI, отдаёт готовые байты, а не URL у GoAPI.
      // Локальный путь сразу окончательный, фонового докачивания не требуется.
      if (spec.provider === 'openai-direct') {
        const soraModel = spec.providerModel as SoraModel | undefined;
        if (soraModel !== 'sora-2' && soraModel !== 'sora-2-pro') {
          throw new Error(`[ReelWorker] ${spec.id}: providerModel не задан или не Sora`);
        }
        // Sora реально поддерживает только 16:9/9:16 (см. openai-video.ts) — наш общий
        // тип соотношений шире (для других моделей), сужаем здесь с безопасным дефолтом.
        const soraAspectRatio = aspectRatio === '9:16' ? '9:16' : '16:9';
        const buffer = await generateVideoSora(soraModel, prompt, { duration, aspectRatio: soraAspectRatio });
        const filename = saveVideoBufferToDisk(buffer);
        const API_BASE = process.env.API_URL ?? 'https://api.ghostlineai.ru';
        const localUrl = `${API_BASE}/videos/${filename}`;

        await finalizeJob(jobId, chatId, userId, prompt, spec.id, localUrl, mediaCacheMode, !imageUrl);
        return { mediaUrl: localUrl };
      }

      // ── GoAPI (Kling / Veo3.1 / Seedance / Hailuo / Wan) ────────────────────
      let externalUrl: string;
      if (spec.goapiModel === 'kling') {
        const klingDuration = duration === '4s' ? 5 : 10;
        externalUrl = await generateVideoKling(prompt, {
          duration: klingDuration,
          aspectRatio,
          enableAudio,
          imageUrl: imageUrl ?? undefined,
          negativePrompt: negativePrompt || undefined,
          cameraPreset: cameraPreset || undefined,
          mode: spec.klingMode,
          version: spec.klingVersion,
        });
      } else if (spec.goapiModel === 'veo3.1') {
        const veoModel: 'standard' | 'pro' = spec.goapiTaskType === 'veo3.1-video' ? 'pro' : 'standard';
        externalUrl = await generateVideoVeo3(prompt, {
          model: veoModel,
          duration,
          aspectRatio,
          generateAudio: enableAudio,
          resolution,
          imageUrl: imageUrl ?? undefined,
          negativePrompt: negativePrompt || undefined,
        });
      } else {
        externalUrl = await generateVideoGeneric(spec.goapiModel, {
          prompt, duration, aspectRatio, enableAudio, resolution,
          imageUrl: imageUrl ?? undefined,
          negativePrompt,
        });
      }

      // Сразу помечаем done с внешним URL — не ждём фоновой докачки, чтобы
      // пользователь увидел результат как можно раньше.
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
