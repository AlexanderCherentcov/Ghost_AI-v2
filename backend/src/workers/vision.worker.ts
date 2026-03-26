import { Worker, type Job } from 'bullmq';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateImageFlux } from '../services/providers/openrouter.js';
import { setMediaCached } from '../services/cache.js';

interface VisionJob {
  jobId: string;
  userId: string;
  prompt: string;
  size: '1024x1024' | '1792x1024' | '1024x1792';
}

export function startVisionWorker() {
  const worker = new Worker<VisionJob>(
    'vision',
    async (job: Job<VisionJob>) => {
      const { jobId, prompt } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      const mediaUrl = await generateImageFlux(prompt);

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl },
      });

      // Cache for future identical prompts (30-day TTL)
      setMediaCached('vision', prompt, mediaUrl).catch(() => {});

      return { mediaUrl };
    },
    {
      connection: bullmqConnection,
      concurrency: 5,
    }
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      await prisma.generateJob.update({
        where: { id: job.data.jobId },
        data: { status: 'failed', error: err.message },
      });
    }
    console.error(`[VisionWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.info(`[VisionWorker] Job ${job.id} completed`);
  });

  console.info('[VisionWorker] Started (OpenRouter Flux)');
  return worker;
}
