/**
 * Галерея работ пользователей
 * ────────────────────────────
 * Пользователь делится готовой картинкой/видео (POST /gallery/share {jobId}) →
 * работа копируется в постоянное хранилище (независимое от TTL-очистки чатов,
 * см. GalleryItem в schema.prisma) → карточка с модерацией уходит всем админам
 * в личку админ-бота → «Одобрить»/«Отклонить» → одобренные видны в GET /gallery
 * с лайками. По образцу services/support-tickets.ts — тот же принцип: ничего
 * не хардкодится, токены/ID — из env, тексты не смешаны с бизнес-логикой.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import type { GalleryItem } from '@prisma/client';
import { findModel } from '../config/models.js';
import { sendTelegramPhoto, sendTelegramVideo, type InlineKeyboardMarkup } from '../lib/telegram-forum.js';
import { escHtml } from '../lib/admin-user-card.js';

const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? '';
const ADMIN_IDS = (process.env.ADMIN_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const API_URL = process.env.API_URL ?? 'https://api.ghostlineai.ru';

const GALLERY_DIR = path.join(process.cwd(), 'uploads', 'gallery');

export class GalleryError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// findModel() перегружен по литеральному типу domain — при вызове с обычной
// переменной ('image'|'video', не литералом) компилятор не может выбрать
// перегрузку. GalleryItem.domain в БД — просто string, поэтому явно сужаем.
function findGalleryModelSpec(domain: 'image' | 'video', id: string) {
  return domain === 'image' ? findModel('image', id) : findModel('video', id);
}

function galleryReviewKeyboard(itemId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[
      { text: '✅ Одобрить', callback_data: `gal_ok:${itemId}` },
      { text: '❌ Отклонить', callback_data: `gal_no:${itemId}` },
    ]],
  };
}

// Копирует уже сгенерированный файл в постоянную папку галереи — источник и так
// на нашем диске (uploads/images|videos/...), поэтому обычный fs.copyFile, без
// HTTP round-trip. Независимость от TTL-очистки исходного чата/видео — см.
// комментарий у модели GalleryItem в schema.prisma.
function copyToGalleryStorage(sourceUrl: string, domain: 'image' | 'video'): string {
  const sourceDir = domain === 'image' ? 'images' : 'videos';
  const filename = sourceUrl.split('/').pop();
  if (!filename) throw new GalleryError('INVALID_SOURCE', 'Некорректная ссылка на файл');
  const sourcePath = path.join(process.cwd(), 'uploads', sourceDir, filename);
  if (!fs.existsSync(sourcePath)) throw new GalleryError('SOURCE_MISSING', 'Исходный файл не найден на диске');

  fs.mkdirSync(GALLERY_DIR, { recursive: true });
  const newFilename = `${crypto.randomUUID()}${path.extname(filename)}`;
  fs.copyFileSync(sourcePath, path.join(GALLERY_DIR, newFilename));
  return `${API_URL}/gallery-media/${newFilename}`;
}

/** Публикует работу из уже завершённого job'а. Общий вход что для веба, что для бота — оба знают jobId. */
export async function shareToGallery(jobId: string, userId: string): Promise<GalleryItem> {
  const job = await prisma.generateJob.findFirst({ where: { id: jobId, userId } });
  if (!job) throw new GalleryError('JOB_NOT_FOUND', 'Задача не найдена');
  if (job.status !== 'done' || !job.mediaUrl) throw new GalleryError('JOB_NOT_DONE', 'Генерация ещё не завершена');
  if (job.mode !== 'vision' && job.mode !== 'reel') {
    throw new GalleryError('UNSUPPORTED_MODE', 'В галерею можно поделиться только картинкой или видео');
  }
  if (!job.modelId) throw new GalleryError('UNKNOWN_MODEL', 'Не удалось определить модель генерации');

  const domain: 'image' | 'video' = job.mode === 'vision' ? 'image' : 'video';
  const mediaUrl = copyToGalleryStorage(job.mediaUrl, domain);

  const item = await prisma.galleryItem.create({
    data: { userId, domain, modelId: job.modelId, prompt: job.prompt, mediaUrl, status: 'PENDING' },
  });

  await postReviewCard(item).catch((err: any) => {
    console.error('[Gallery] Failed to post review card:', err.message);
  });

  return item;
}

async function postReviewCard(item: GalleryItem): Promise<void> {
  if (!ADMIN_BOT_TOKEN || ADMIN_IDS.length === 0) return;

  const author = await prisma.user.findUnique({ where: { id: item.userId }, select: { name: true, email: true } });
  const spec = findGalleryModelSpec(item.domain as 'image' | 'video', item.modelId);

  const caption =
    `🖼 <b>Новая работа на модерацию</b>\n\n` +
    `👤 ${escHtml(author?.name ?? author?.email ?? 'Без имени')}\n` +
    `🤖 Модель: ${escHtml(spec?.label ?? item.modelId)}\n` +
    `💬 Промт: ${escHtml(item.prompt.slice(0, 300))}`;

  const send = item.domain === 'video' ? sendTelegramVideo : sendTelegramPhoto;
  const keyboard = galleryReviewKeyboard(item.id);
  await Promise.allSettled(
    ADMIN_IDS.map((adminId) => send(ADMIN_BOT_TOKEN, adminId, item.mediaUrl, caption, { replyMarkup: keyboard })),
  );
}

export async function approveItem(itemId: string): Promise<GalleryItem | null> {
  const item = await prisma.galleryItem.findUnique({ where: { id: itemId } });
  if (!item || item.status !== 'PENDING') return null;
  return prisma.galleryItem.update({
    where: { id: itemId },
    data: { status: 'APPROVED', reviewedAt: new Date() },
  });
}

export async function rejectItem(itemId: string): Promise<GalleryItem | null> {
  const item = await prisma.galleryItem.findUnique({ where: { id: itemId } });
  if (!item || item.status !== 'PENDING') return null;
  return prisma.galleryItem.update({
    where: { id: itemId },
    data: { status: 'REJECTED', reviewedAt: new Date() },
  });
}

/** Лайк — тумблер: повторный вызов снимает лайк. Денормализованный likesCount меняется в той же транзакции. */
export async function toggleLike(itemId: string, userId: string): Promise<{ liked: boolean; likesCount: number }> {
  const existing = await prisma.galleryLike.findUnique({
    where: { galleryItemId_userId: { galleryItemId: itemId, userId } },
  });

  if (existing) {
    const [, item] = await prisma.$transaction([
      prisma.galleryLike.delete({ where: { id: existing.id } }),
      prisma.galleryItem.update({ where: { id: itemId }, data: { likesCount: { decrement: 1 } } }),
    ]);
    return { liked: false, likesCount: item.likesCount };
  }

  const [, item] = await prisma.$transaction([
    prisma.galleryLike.create({ data: { galleryItemId: itemId, userId } }),
    prisma.galleryItem.update({ where: { id: itemId }, data: { likesCount: { increment: 1 } } }),
  ]);
  return { liked: true, likesCount: item.likesCount };
}

export type GallerySort = 'top' | 'new';

export interface GalleryListItem {
  id: string;
  domain: string;
  modelId: string;
  modelLabel: string;
  prompt: string;
  mediaUrl: string;
  likesCount: number;
  likedByMe: boolean;
  authorName: string;
  createdAt: Date;
}

/** Публичный список — только APPROVED. viewerUserId опционален (гость видит всё, но likedByMe всегда false). */
export async function listPublic(opts: {
  sort: GallerySort;
  page: number;
  limit: number;
  viewerUserId?: string;
}): Promise<{ items: GalleryListItem[]; total: number }> {
  const { sort, page, limit, viewerUserId } = opts;
  const where = { status: 'APPROVED' as const };

  const [rows, total] = await Promise.all([
    prisma.galleryItem.findMany({
      where,
      orderBy: sort === 'top' ? { likesCount: 'desc' } : { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { name: true } },
        likes: viewerUserId ? { where: { userId: viewerUserId }, select: { id: true } } : false,
      },
    }),
    prisma.galleryItem.count({ where }),
  ]);

  const items: GalleryListItem[] = rows.map((row) => {
    const spec = findGalleryModelSpec(row.domain as 'image' | 'video', row.modelId);
    return {
      id: row.id,
      domain: row.domain,
      modelId: row.modelId,
      modelLabel: spec?.label ?? row.modelId,
      prompt: row.prompt,
      mediaUrl: row.mediaUrl,
      likesCount: row.likesCount,
      likedByMe: Array.isArray(row.likes) ? row.likes.length > 0 : false,
      authorName: row.user.name ?? 'Без имени',
      createdAt: row.createdAt,
    };
  });

  return { items, total };
}
