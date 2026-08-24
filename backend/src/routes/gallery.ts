import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { checkBotSecret } from '../lib/bot-auth.js';
import {
  shareToGallery, approveItem, rejectItem, toggleLike, listPublic,
  GalleryError, type GallerySort,
} from '../services/gallery.js';

const shareSchema = z.object({
  jobId: z.string().min(1),
});

const listQuerySchema = z.object({
  sort:  z.enum(['top', 'new']).default('top'),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

const galleryRoutes: FastifyPluginAsync = async (fastify) => {
  // ── Поделиться завершённой генерацией — общий вход для веба и бота, оба знают jobId ──
  fastify.post('/gallery/share', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { jobId } = shareSchema.parse(request.body);
      try {
        const item = await shareToGallery(jobId, userId);
        return reply.code(202).send({ id: item.id, status: 'pending' });
      } catch (err: any) {
        if (err instanceof GalleryError) {
          return reply.code(400).send({ error: err.message, code: err.code });
        }
        throw err;
      }
    },
  });

  // ── Публичный список — без авторизации, но токен (если есть) даёт likedByMe ──
  fastify.get('/gallery', async (request, reply) => {
    const { sort, page, limit } = listQuerySchema.parse(request.query);

    let viewerUserId: string | undefined;
    try {
      await request.jwtVerify();
      viewerUserId = (request.user as unknown as { userId: string }).userId;
    } catch {
      // гость — список всё равно отдаём, просто без likedByMe
    }

    const { items, total } = await listPublic({ sort: sort as GallerySort, page, limit, viewerUserId });
    return reply.send({ items, total, page, limit });
  });

  // ── Лайк — тумблер, только для залогиненных ──
  fastify.post('/gallery/:id/like', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { id } = request.params as { id: string };
      const result = await toggleLike(id, userId);
      return reply.send(result);
    },
  });

  // ── Модерация из админ-бота (bot-secret, без JWT) ──
  fastify.post('/admin/gallery/:id/approve', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;
    const { id } = request.params as { id: string };
    const item = await approveItem(id);
    if (!item) return reply.code(409).send({ error: 'Работа не найдена или уже обработана' });
    return reply.send({ ok: true, item });
  });

  fastify.post('/admin/gallery/:id/reject', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;
    const { id } = request.params as { id: string };
    const item = await rejectItem(id);
    if (!item) return reply.code(409).send({ error: 'Работа не найдена или уже обработана' });
    return reply.send({ ok: true, item });
  });
};

export default galleryRoutes;
