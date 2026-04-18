import { Worker, type Job } from 'bullmq';
import { createWriteStream, mkdirSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateVideoKling, type KlingVideoOptions } from '../services/providers/kling.js';
import { setMediaCached } from '../services/cache.js';
import { encrypt } from '../lib/crypto.js';

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
      const { jobId, userId, prompt, chatId, duration, aspectRatio, enableAudio, imageUrl, cameraPreset, negativePrompt, cfgScale } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      const options: KlingVideoOptions = { duration, aspectRatio, enableAudio, imageUrl, cameraPreset, negativePrompt, cfgScale };
      const externalUrl = await generateVideoKling(prompt, options);

      // Download video to local disk so it persists and users can download it
      let mediaUrl = externalUrl;
      try {
        const filename = await saveVideoToDisk(externalUrl);
        const API_BASE = process.env.API_URL ?? 'https://api.ghostlineai.ru';
        mediaUrl = `${API_BASE}/videos/${filename}`;
      } catch (err: any) {
        console.warn('[ReelWorker] Failed to save video to disk, using external URL:', err.message);
      }

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl },
      });

      // Save assistant message with video to chat history
      if (chatId) {
        await prisma.message.create({
          data: { chatId, userId, role: 'assistant', content: encrypt(prompt), mode: 'reel', tokensCost: 0, mediaUrl },
        }).catch((e) => console.error('[ReelWorker] Failed to save assistant message:', e.message));
      }

      // Cache for future identical text-to-video prompts
      // Skip cache for image-to-video (unique per image)
      if (!imageUrl) {
        setMediaCached('reel', prompt, mediaUrl).catch(() => {});
      }

      return { mediaUrl };
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

  console.info('[ReelWorker] Started (GoAPI Kling V2.5)');
  return worker;
}
