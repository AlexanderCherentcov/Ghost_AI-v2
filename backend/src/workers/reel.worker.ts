import { Worker, type Job } from 'bullmq';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateVideoKling } from '../services/providers/kling.js';
import { setMediaCached } from '../services/cache.js';

interface ReelJob {
  jobId: string;
  userId: string;
  prompt: string;
}

export function startReelWorker() {
  const worker = new Worker<ReelJob>(
    'reel',
    async (job: Job<ReelJob>) => {
      const { jobId, prompt } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      const mediaUrl = await generateVideoKling(prompt);

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl },
      });

      // Cache for future identical prompts (7-day TTL — GoAPI video expiry)
      setMediaCached('reel', prompt, mediaUrl).catch(() => {});

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
