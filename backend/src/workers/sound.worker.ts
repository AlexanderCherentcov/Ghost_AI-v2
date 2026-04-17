import { Worker, type Job } from 'bullmq';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateMusic } from '../services/providers/replicate.js';
import { setMediaCached } from '../services/cache.js';
import { encrypt } from '../lib/crypto.js';

interface SoundJob {
  jobId: string;
  userId: string;
  prompt: string;
  duration: number;
  chatId?: string | null;
}

export function startSoundWorker() {
  const worker = new Worker<SoundJob>(
    'sound',
    async (job: Job<SoundJob>) => {
      const { jobId, userId, prompt, duration, chatId } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      const mediaUrl = await generateMusic(prompt, duration);

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl },
      });

      // [H-05] Save assistant message with audio to chat history
      if (chatId) {
        await prisma.message.create({
          data: { chatId, userId, role: 'assistant', content: encrypt(prompt), mode: 'sound', tokensCost: 0, mediaUrl },
        }).catch((e) => console.error('[SoundWorker] Failed to save assistant message:', e.message));
      }

      // Cache for future identical prompts (7-day TTL)
      setMediaCached('sound', prompt, mediaUrl).catch(() => {});

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
