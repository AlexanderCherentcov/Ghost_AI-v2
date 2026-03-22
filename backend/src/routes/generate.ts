import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { chargeTokens } from '../services/tokens.js';
import { visionQueue, soundQueue, reelQueue } from '../lib/bullmq.js';

const generateSchema = z.object({
  prompt: z.string().min(1).max(2000),
  style: z.string().optional(),
  duration: z.number().int().min(5).max(30).optional(),
  size: z.enum(['1024x1024', '1792x1024', '1024x1792']).optional(),
});

export default async function generateRoutes(fastify: FastifyInstance) {
  // ── Vision (image generation) ─────────────────────────────────────────────
  fastify.post('/generate/vision', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { prompt, size } = generateSchema.parse(request.body);

      await chargeTokens(userId, 'vision');

      const job = await prisma.generateJob.create({
        data: { userId, mode: 'vision', prompt },
      });

      const bullJob = await visionQueue.add('generate-image', {
        jobId: job.id,
        userId,
        prompt,
        size: size ?? '1024x1024',
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

      await chargeTokens(userId, 'sound');

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

      await chargeTokens(userId, 'reel');

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
