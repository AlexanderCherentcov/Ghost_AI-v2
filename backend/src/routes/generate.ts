import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { deductByModel, refreshFreeQuota } from '../services/tokens.js';
import { visionQueue, soundQueue, reelQueue } from '../lib/bullmq.js';
import { getMediaCached } from '../services/cache.js';
import { checkGenRateLimit } from '../services/user-limiter.js';
import { encrypt } from '../lib/crypto.js';

const generateSchema = z.object({
  prompt: z.string().min(1).max(2000),
  chatId: z.string().optional(),
  style: z.string().optional(),
  duration: z.number().int().min(5).max(30).optional(),
  size: z.enum(['1024x1024', '1792x1024', '1024x1792']).optional(),
  sourceImageUrl: z.string().url().optional(), // for image editing mode
});

export default async function generateRoutes(fastify: FastifyInstance) {
  // ── Vision (image generation) ─────────────────────────────────────────────
  fastify.post('/generate/vision', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { prompt, size, chatId, sourceImageUrl } = generateSchema.parse(request.body);

      // FREE plan: refresh monthly image quota (3/month)
      const userPlan = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
      await refreshFreeQuota(userId, userPlan?.plan ?? 'FREE');

      // Per-user rate limit
      if (!await checkGenRateLimit(userId)) {
        return reply.code(429).send({ error: 'Слишком много запросов. Подождите минуту.', code: 'RATE_LIMITED' });
      }

      // Job lock: reject if a vision job is already running for this user
      const activeJob = await prisma.generateJob.findFirst({
        where: { userId, mode: 'vision', status: { in: ['pending', 'processing'] } },
        select: { id: true },
      });
      if (activeJob) {
        return reply.code(409).send({ error: 'Задача уже выполняется. Подождите.', code: 'TASK_IN_PROGRESS', jobId: activeJob.id });
      }

      // Save user message to chat history (if chatId provided)
      if (chatId) {
        await prisma.message.create({
          data: { chatId, userId, role: 'user', content: encrypt(prompt), mode: 'vision', tokensCost: 0 },
        }).catch((e) => console.error('[generate/vision] Failed to save user message:', e.message));
      }

      // Check media cache first (saves real generation credits)
      const mediaCached = await getMediaCached('vision', prompt);
      if (mediaCached.hit) {
        // TODO: re-enable after testing: await deductByModel(userId, 'black-forest-labs/flux-1.1-pro');
        if (chatId) {
          await prisma.message.create({
            data: { chatId, userId, role: 'assistant', content: encrypt(prompt), mode: 'vision', tokensCost: 0, mediaUrl: mediaCached.url },
          }).catch((e) => console.error('[generate/vision] Failed to save cached assistant message:', e.message));
        }
        const job = await prisma.generateJob.create({
          data: { userId, mode: 'vision', prompt, status: 'done', mediaUrl: mediaCached.url },
        });
        return reply.code(202).send({ jobId: job.id });
      }

      // TODO: re-enable after testing: await deductByModel(userId, 'black-forest-labs/flux-1.1-pro');

      const job = await prisma.generateJob.create({
        data: { userId, mode: 'vision', prompt },
      });

      // FREE plan: quality locked to 1024x1024 (no HD sizes)
      const effectiveSize = userPlan?.plan === 'FREE' ? '1024x1024' : (size ?? '1024x1024');

      const bullJob = await visionQueue.add('generate-image', {
        jobId: job.id,
        userId,
        prompt,
        chatId: chatId ?? null,
        size: effectiveSize,
        ...(sourceImageUrl ? { sourceImageUrl } : {}),
      });

      await prisma.generateJob.update({
        where: { id: job.id },
        data: { bullJobId: bullJob.id },
      });

      return reply.code(202).send({ jobId: job.id });
    },
  });

  // ── Sound (music generation) ──────────────────────────────────────────────
  fastify.post('/generate/sound', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { prompt, duration } = generateSchema.parse(request.body);

      // FREE plan: no sound generation
      const userPlanS = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
      if (userPlanS?.plan === 'FREE') {
        return reply.code(403).send({ error: 'Обновите тариф для генерации музыки.', code: 'PLAN_RESTRICTED' });
      }

      // Per-user rate limit
      if (!await checkGenRateLimit(userId)) {
        return reply.code(429).send({ error: 'Слишком много запросов. Подождите минуту.', code: 'RATE_LIMITED' });
      }

      // Job lock: reject if a sound job is already running for this user
      const activeJob = await prisma.generateJob.findFirst({
        where: { userId, mode: 'sound', status: { in: ['pending', 'processing'] } },
        select: { id: true },
      });
      if (activeJob) {
        return reply.code(409).send({ error: 'Задача уже выполняется. Подождите.', code: 'TASK_IN_PROGRESS', jobId: activeJob.id });
      }

      // Check media cache first
      const mediaCached = await getMediaCached('sound', prompt);
      if (mediaCached.hit) {
        await deductByModel(userId, 'black-forest-labs/flux-1.1-pro');
        const job = await prisma.generateJob.create({
          data: { userId, mode: 'sound', prompt, status: 'done', mediaUrl: mediaCached.url },
        });
        return reply.code(202).send({ jobId: job.id });
      }

      await deductByModel(userId, 'black-forest-labs/flux-1.1-pro');

      const job = await prisma.generateJob.create({
        data: { userId, mode: 'sound', prompt },
      });

      const bullJob = await soundQueue.add('generate-music', {
        jobId: job.id,
        userId,
        prompt,
        duration: duration ?? 15,
      });

      await prisma.generateJob.update({
        where: { id: job.id },
        data: { bullJobId: bullJob.id },
      });

      return reply.code(202).send({ jobId: job.id });
    },
  });

  // ── Reel (video generation) ───────────────────────────────────────────────
  fastify.post('/generate/reel', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { prompt, duration } = generateSchema.parse(request.body);

      // FREE plan: no reel generation
      const userPlanR = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
      if (userPlanR?.plan === 'FREE') {
        return reply.code(403).send({ error: 'Обновите тариф для генерации видео.', code: 'PLAN_RESTRICTED' });
      }

      // Per-user rate limit
      if (!await checkGenRateLimit(userId)) {
        return reply.code(429).send({ error: 'Слишком много запросов. Подождите минуту.', code: 'RATE_LIMITED' });
      }

      // Job lock: reject if a reel job is already running for this user
      const activeJob = await prisma.generateJob.findFirst({
        where: { userId, mode: 'reel', status: { in: ['pending', 'processing'] } },
        select: { id: true },
      });
      if (activeJob) {
        return reply.code(409).send({ error: 'Задача уже выполняется. Подождите.', code: 'TASK_IN_PROGRESS', jobId: activeJob.id });
      }

      // Check media cache first
      const mediaCached = await getMediaCached('reel', prompt);
      if (mediaCached.hit) {
        await deductByModel(userId, 'black-forest-labs/flux-1.1-pro');
        const job = await prisma.generateJob.create({
          data: { userId, mode: 'reel', prompt, status: 'done', mediaUrl: mediaCached.url },
        });
        return reply.code(202).send({ jobId: job.id });
      }

      await deductByModel(userId, 'black-forest-labs/flux-1.1-pro');

      const job = await prisma.generateJob.create({
        data: { userId, mode: 'reel', prompt },
      });

      const bullJob = await reelQueue.add('generate-video', {
        jobId: job.id,
        userId,
        prompt,
        duration: (duration === 10 ? 10 : 5) as 5 | 10,
      });

      await prisma.generateJob.update({
        where: { id: job.id },
        data: { bullJobId: bullJob.id },
      });

      return reply.code(202).send({ jobId: job.id });
    },
  });

  // ── Job status ────────────────────────────────────────────────────────────
  fastify.get('/generate/:jobId', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { jobId } = request.params as { jobId: string };

      const job = await prisma.generateJob.findFirst({
        where: { id: jobId, userId },
      });

      if (!job) return reply.code(404).send({ error: 'Job not found' });

      return {
        id: job.id,
        status: job.status,
        mode: job.mode,
        prompt: job.prompt,
        mediaUrl: job.mediaUrl,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };
    },
  });

  // ── User jobs list ────────────────────────────────────────────────────────
  fastify.get('/generate', {
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      const { userId } = request.user;
      const query = request.query as { mode?: string; page?: string };
      const page = parseInt(query.page ?? '1');

      const jobs = await prisma.generateJob.findMany({
        where: {
          userId,
          ...(query.mode ? { mode: query.mode } : {}),
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
      });

      return { jobs };
    },
  });
}
