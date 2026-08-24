import { Worker, type Job } from 'bullmq';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateImageFlux } from '../services/providers/openrouter.js';
import { findModel } from '../config/models.js';
import { setMediaCached } from '../services/cache.js';
import { encrypt } from '../lib/crypto.js';
import { refundCaspers } from '../services/tokens.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'images');

function saveDataUri(dataUri: string): string {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const [header, base64] = dataUri.split(',');
  const ext = header.includes('png') ? 'png' : 'jpg';
  const filename = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(base64, 'base64'));
  return `${process.env.API_URL ?? 'http://localhost:4000'}/images/${filename}`;
}

interface VisionJob {
  jobId: string;
  userId: string;
  prompt: string;
  chatId: string | null;
  size: '1024x1024' | '1792x1024' | '1024x1792';
  modelId: string;
  mediaCacheMode: string;
  sourceImageUrl?: string; // режим редактирования изображения
  // Реально прокидывается только для Gemini-семейства (image_config.aspect_ratio
  // через OpenRouter chat/completions) — см. providerModel-проверку в generateImageFlux.
  imageAspectRatio?: string;
  // Сколько реально списано за этот job (routes/generate.ts:checkAndDeduct) — нужно
  // здесь, чтобы вернуть Caspers при падении ПОСЛЕ постановки в очередь (см.
  // worker.on('failed') ниже). Раньше возврат был только на ошибку постановки
  // в очередь (routes/generate.ts, до этого места) — если сам воркер падал
  // (таймаут/ошибка провайдера), Caspers списывались и терялись без возврата,
  // даже когда пользователь не получил вообще ничего.
  caspersSpent: number;
}

export function startVisionWorker() {
  const worker = new Worker<VisionJob>(
    'vision',
    async (job: Job<VisionJob>) => {
      const { jobId, userId, prompt, chatId, sourceImageUrl, modelId, mediaCacheMode, imageAspectRatio } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      const spec = findModel('image', modelId);
      if (!spec) throw new Error(`[VisionWorker] Unknown image model: ${modelId}`);

      let mediaUrl: string;
      try {
        mediaUrl = await generateImageFlux(prompt, spec.providerModel, sourceImageUrl, imageAspectRatio);
      } catch (err) {
        if (!spec.fallbackModel) throw err;
        console.warn(`[VisionWorker] ${spec.id} failed, falling back to ${spec.fallbackModel}:`, (err as Error).message);
        mediaUrl = await generateImageFlux(prompt, spec.fallbackModel, sourceImageUrl, imageAspectRatio);
      }

      // Всегда раздаём с нашего сервера — так избегаем проблем CORS/истечения ссылок на внешних CDN
      if (mediaUrl.startsWith('data:')) {
        mediaUrl = saveDataUri(mediaUrl);
      } else if (mediaUrl.startsWith('http')) {
        // Скачиваем внешний URL и сохраняем на диск
        const imgRes = await fetch(mediaUrl);
        if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
        const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' : 'jpg';
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        const filename = `${crypto.randomUUID()}.${ext}`;
        fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
        mediaUrl = `${process.env.API_URL ?? 'http://localhost:4000'}/images/${filename}`;
      }

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl },
      });

      // Сохраняем сообщение ассистента с изображением в историю чата
      if (chatId) {
        await prisma.message.create({
          data: { chatId, userId, role: 'assistant', content: encrypt(prompt), mode: 'vision', tokensCost: 0, mediaUrl, provider: spec.id },
        }).catch((e) => console.error('[VisionWorker] Failed to save assistant message:', e.message));
      }

      // Кэш ТОЛЬКО для генерации без исходного изображения. Раньше кэш срабатывал
      // и на правках, ключ был только по тексту промпта — двум разным правкам с
      // одинаковой текстовой инструкцией ("сделай ярче") мог прилететь чужой
      // результат чужого исходного фото. Реальная бага, не поведенческое изменение
      // ради изменения.
      if (!sourceImageUrl) {
        await setMediaCached(mediaCacheMode, prompt, mediaUrl).catch(() => {});
      }

      return { mediaUrl };
    },
    { connection: bullmqConnection, concurrency: 5 },
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      await prisma.generateJob.update({
        where: { id: job.data.jobId },
        data: { status: 'failed', error: err.message },
      });
      await refundCaspers(job.data.userId, job.data.caspersSpent, job.data.modelId).catch(() => {});
    }
    console.error(`[VisionWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.info(`[VisionWorker] Job ${job.id} completed`);
  });

  console.info('[VisionWorker] Started');
  return worker;
}
