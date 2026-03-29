import { Worker, type Job } from 'bullmq';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateVideoKling, type KlingVideoOptions } from '../services/providers/kling.js';
import { setMediaCached } from '../services/cache.js';

interface ReelJob {
  jobId: string;
  userId: string;
  prompt: string;
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
      const { jobId, prompt, duration, aspectRatio, enableAudio, imageUrl, cameraPreset, negativePrompt, cfgScale } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      const options: KlingVideoOptions = { duration, aspectRatio, enableAudio, imageUrl, cameraPreset, negativePrompt, cfgScale };
      const mediaUrl = await generateVideoKling(prompt, options);

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl },
      });

      // Cache for future identical text-to-video prompts (7-day TTL — GoAPI video expiry)
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
