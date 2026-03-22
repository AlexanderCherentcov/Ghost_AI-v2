import { Worker, type Job } from 'bullmq';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateMusic } from '../services/providers/replicate.js';

interface SoundJob {
  jobId: string;
  userId: string;
  prompt: string;
  duration: number;
}

export function startSoundWorker() {
  const worker = new Worker<SoundJob>(
    'sound',
    async (job: Job<SoundJob>) => {
      const { jobId, prompt, duration } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      const mediaUrl = await generateMusic(prompt, duration);

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl },
      });

      return { mediaUrl };
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

  console.info('[SoundWorker] Started');
  return worker;
}
