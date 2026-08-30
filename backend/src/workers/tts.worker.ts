import { Worker, type Job } from 'bullmq';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { synthesizeSpeech } from '../services/providers/openrouter.js';
import { encrypt } from '../lib/crypto.js';
import { refundCaspers } from '../services/tokens.js';
import { friendlyGenerationError } from '../lib/generation-error.js';
import { saveAudioDataUri } from '../lib/audio-storage.js';
import { DEFAULT_TTS_VOICE } from '../config/tts-voices.js';

interface TtsJob {
  jobId: string;
  userId: string;
  chatId: string | null;
  text: string;
  voice: string;
  // См. комментарий у одноимённого поля в vision.worker.ts — нужно для возврата
  // Caspers при падении job'а после списания.
  caspersSpent: number;
}

export function startTtsWorker() {
  const worker = new Worker<TtsJob>(
    'tts',
    async (job: Job<TtsJob>) => {
      const { jobId, userId, chatId, text, voice } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      const speechDataUri = await synthesizeSpeech(text, voice || DEFAULT_TTS_VOICE);
      const mediaUrl = saveAudioDataUri(speechDataUri);

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl },
      });

      if (chatId) {
        await prisma.message.create({
          data: { chatId, userId, role: 'assistant', content: encrypt(text), mode: 'tts', tokensCost: 0, mediaUrl, provider: voice },
        }).catch((e) => console.error('[TtsWorker] Failed to save message:', e.message));
      }

      return { mediaUrl };
    },
    { connection: bullmqConnection, concurrency: 3 },
  );

  worker.on('failed', async (job, err) => {
    if (job) {
      await prisma.generateJob.update({
        where: { id: job.data.jobId },
        data: { status: 'failed', error: friendlyGenerationError(err.message) },
      });
      await refundCaspers(job.data.userId, job.data.caspersSpent, 'tts_generate').catch(() => {});
    }
    console.error(`[TtsWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.info(`[TtsWorker] Job ${job.id} completed`);
  });

  console.info('[TtsWorker] Started');
  return worker;
}
