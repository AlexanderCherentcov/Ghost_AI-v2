import { Worker, type Job } from 'bullmq';
import { bullmqConnection } from '../lib/bullmq.js';
import { prisma } from '../lib/prisma.js';
import { generateImageFlux, OR_MODELS } from '../services/providers/openrouter.js';
import { setMediaCached } from '../services/cache.js';
import { encrypt } from '../lib/crypto.js';
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
  sourceImageUrl?: string; // image editing mode
}

export function startVisionWorker() {
  const worker = new Worker<VisionJob>(
    'vision',
    async (job: Job<VisionJob>) => {
      const { jobId, userId, prompt, chatId, sourceImageUrl } = job.data;

      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'processing' },
      });

      // For image editing use fluxFill (supports image-to-image); plain generation uses Gemini flash
      const model = sourceImageUrl ? OR_MODELS.fluxFill : OR_MODELS.flux;
      let mediaUrl = await generateImageFlux(prompt, model, sourceImageUrl);

      // Always serve from our own server — avoids CORS/expiry issues with external CDN URLs
      if (mediaUrl.startsWith('data:')) {
        mediaUrl = saveDataUri(mediaUrl);
      } else if (mediaUrl.startsWith('http')) {
        // Download external URL and save to disk
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

      // Save assistant message with image to chat history
      if (chatId) {
        await prisma.message.create({
          data: { chatId, userId, role: 'assistant', content: encrypt(prompt), mode: 'vision', tokensCost: 0, mediaUrl },
        }).catch((e) => console.error('[VisionWorker] Failed to save assistant message:', e.message));
      }

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
