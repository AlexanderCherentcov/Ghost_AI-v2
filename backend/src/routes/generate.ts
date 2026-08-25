import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { checkResets, checkAndDeduct, refundCaspers } from '../services/tokens.js';
import { CASPER_COSTS, planAtLeast } from '../config/plans.js';
import { findModel, DEFAULT_IMAGE_MODEL_ID, DEFAULT_VIDEO_MODEL_ID, type VideoDurationChoice } from '../config/models.js';
import { visionQueue, soundQueue, reelQueue, voiceQueue } from '../lib/bullmq.js';
import { getMediaCached } from '../services/cache.js';
import { checkGenRateLimit, checkVideoRateLimit } from '../services/user-limiter.js';
import { generateLipSync } from '../services/providers/goapi.js';
import { callCloudflareJSON } from '../services/providers/cloudflare.js';
import { encrypt } from '../lib/crypto.js';
import { notifyApiError } from '../services/admin-notify.js';
import crypto from 'crypto';

// Порог "протухания" активной задачи. Раньше guard ниже блокировал новые запросы,
// пока есть job в статусе pending/processing БЕЗ ограничения по времени — если
// воркер завис (реальный случай: providers/openrouter.ts:generateImageFlux без
// таймаута на fetch к OpenRouter держал промис вечно нерешённым), BullMQ
// worker.on('failed') не срабатывает никогда (для зависшего промиса это событие
// просто не наступает), job навсегда остаётся processing, и пользователь
// блокировался от повторных попыток НАВСЕГДА — ровно то, что случилось на проде
// 2026-08-24 с job cmt7ehgdj0005fj442gztkgtb.
//
// vision:12 — НЕ меньше таймаута fetch в generateImageFlux (600с/10мин, см. его
// комментарий): живое подтверждение по логам OpenRouter — openai/gpt-5-image
// успешно, БЕЗ ошибки, отгенерировал картинку за 372с (6.2 мин), это не
// зависание, а реальная латентность модели. Порог короче таймаута означал бы,
// что guard пропускает второй запрос, пока первый ещё легитимно работает.
const STALE_JOB_MINUTES: Record<string, number> = {
  vision: 12,
  sound: 5,
  reel: 15,
  voice: 3,
};

async function findActiveJob(userId: string, mode: keyof typeof STALE_JOB_MINUTES) {
  const staleCutoff = new Date(Date.now() - STALE_JOB_MINUTES[mode] * 60_000);
  return prisma.generateJob.findFirst({
    where: { userId, mode, status: { in: ['pending', 'processing'] }, createdAt: { gt: staleCutoff } },
    select: { id: true },
  });
}

const generateSchema = z.object({
  prompt: z.string().min(1).max(2000),
  chatId: z.string().optional(),
  style: z.string().optional(),
  duration: z.number().int().min(5).max(30).optional(),
  size: z.enum(['1024x1024', '1792x1024', '1024x1792']).optional(),
  sourceImageUrl: z.string().url().optional(), // для режима редактирования изображения
  // id модели из реестра (config/models.ts) — для картинок и видео.
  model: z.string().optional(),
  // Соотношение сторон для картинок — реально прокидывается только для Gemini-семейства
  // (image_config.aspect_ratio через OpenRouter chat/completions, подтверждено в доках
  // openrouter.ai на момент добавления); для остальных моделей поле молча игнорируется
  // на стороне vision.worker.ts, не выдаём ошибку, чтобы не ломать уже существующие клиенты.
  imageAspectRatio: z.enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']).optional(),
  // Опции для видео — расширенный набор соотношений/разрешений отражает реальные
  // возможности конкретных моделей (сверено с доками goapi.ai на момент добавления,
  // см. per-model таблицу в frontend/lib/video-model-params.ts); конкретная модель
  // использует только свою часть набора, буду отклонена goapi при явном рассинхроне.
  videoDuration: z.enum(['4s', '8s']).optional(),
  videoAspectRatio: z.enum(['16:9', '9:16', '1:1', '21:9', '9:21', '4:3', '3:4']).optional(),
  videoEnableAudio: z.boolean().optional(),
  videoResolution: z.enum(['480p', '720p', '1080p', '768p']).optional(),
  videoImageUrl: z.string().url().optional(), // исходное изображение для image-to-video
  negativePrompt: z.string().max(2500).optional(),
  // Только Kling — простой пресет камеры (см. buildCameraControl в providers/goapi.ts).
  videoCameraPreset: z.enum(['static', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'orbit']).optional(),
  // Опции для музыки
  musicMode: z.enum(['short', 'long', 'quality', 'suno']).optional(),
  musicDuration: z.number().int().min(15).max(60).optional(),
  lyrics: z.string().max(10000).optional(),
  styleAudio: z.string().url().max(2000).optional(),
  // Опции, специфичные для Suno
  sunoStyle: z.string().max(200).optional(),
  sunoTitle: z.string().max(100).optional(),
  sunoInstrumental: z.boolean().optional(),
  // Голосовой чат: URL записанного голосового сообщения (уже загружен через /upload/audio)
  audioUrl: z.string().url().optional(),
});

/**
 * Имитирует задержку генерации при попадании в кэш, чтобы UI показал анимацию загрузки.
 */
function completeCachedJobAfterDelay(
  jobId: string,
  mediaUrl: string,
  delayMs: number,
  chatMsg?: { chatId: string; userId: string; prompt: string; mode: string },
) {
  setTimeout(async () => {
    try {
      await prisma.generateJob.update({
        where: { id: jobId },
        data: { status: 'done', mediaUrl },
      });
      if (chatMsg) {
        await prisma.message.create({
          data: {
            chatId: chatMsg.chatId,
            userId: chatMsg.userId,
            role: 'assistant',
            content: encrypt(chatMsg.prompt),
            mode: chatMsg.mode,
            tokensCost: 0,
            mediaUrl,
          },
        }).catch(() => {});
      }
    } catch {}
  }, delayMs);
}

export default async function generateRoutes(fastify: FastifyInstance) {
  // ── Vision (генерация изображений) ────────────────────────────────────────
  fastify.post('/generate/vision', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { prompt, chatId, sourceImageUrl, model, imageAspectRatio } = generateSchema.parse(request.body);

      const modelId = model ?? DEFAULT_IMAGE_MODEL_ID;
      const spec = findModel('image', modelId);
      if (!spec) return reply.code(400).send({ error: 'Неизвестная модель изображения', code: 'UNKNOWN_MODEL' });

      const userPlan = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
      if (!userPlan || !planAtLeast(userPlan.plan, spec.minPlan)) {
        return reply.code(403).send({ error: `Модель «${spec.label}» доступна с тарифа ${spec.minPlan}`, code: 'PLAN_RESTRICTED' });
      }
      if (sourceImageUrl && !spec.capabilities?.edit) {
        return reply.code(400).send({ error: `Модель «${spec.label}» не поддерживает редактирование изображений`, code: 'MODEL_NO_EDIT' });
      }

      // Rate limit на пользователя (3 изображения/мин)
      if (!await checkGenRateLimit(userId)) {
        return reply.code(429).send({ error: 'Слишком много запросов. Подождите минуту.', code: 'RATE_LIMITED' });
      }

      // Блокировка задачи: отклоняем, если у пользователя уже выполняется vision-задача
      const activeJob = await findActiveJob(userId, 'vision');
      if (activeJob) {
        return reply.code(409).send({ error: 'Задача уже выполняется. Подождите.', code: 'TASK_IN_PROGRESS', jobId: activeJob.id });
      }

      // Сбрасываем счётчики, если период закончился
      await checkResets(userId);

      // ── Проверка кэша изображений ──────────────────────────────────────────
      // Ключ кэша включает модель и соотношение сторон — иначе запрос 9:16 мог бы
      // вернуть закэшированную картинку 16:9 от того же промпта.
      const mediaCacheMode = `vision:${modelId}:${imageAspectRatio ?? 'default'}`;
      const promptHash = crypto.createHash('sha256').update(`${modelId}:${imageAspectRatio ?? 'default'}:${prompt.trim().toLowerCase()}`).digest('hex');

      const userMadeThis = await prisma.userImageRequest.findUnique({
        where: { userId_promptHash: { userId, promptHash } },
      });

      if (!userMadeThis) {
        // Проверяем общий кэш (сгенерировано любым пользователем на этой же модели)
        const mediaCached = await getMediaCached(mediaCacheMode, prompt);
        if (mediaCached.hit) {
          // Попадание в кэш — Caspers всё равно списываем (это наша экономия, не пользователя)
          let deductResult;
          try {
            deductResult = await checkAndDeduct(userId, 'image', spec.cost, spec.id);
          } catch (err: any) {
            return reply.code(403).send({ error: err.message, code: err.code ?? 'LIMIT_IMAGES' });
          }
          await prisma.userImageRequest.create({ data: { userId, promptHash } }).catch(() => {});
          if (chatId) {
            await prisma.message.create({
              data: { chatId, userId, role: 'user', content: encrypt(prompt), mode: 'vision', tokensCost: 0, mediaUrl: null },
            }).catch(() => {});
            await prisma.message.create({
              data: { chatId, userId, role: 'assistant', content: encrypt(prompt), mode: 'vision', tokensCost: 0, mediaUrl: mediaCached.url, provider: modelId },
            }).catch(() => {});
          }
          const job = await prisma.generateJob.create({
            data: { userId, mode: 'vision', prompt, status: 'processing' },
          });
          completeCachedJobAfterDelay(job.id, mediaCached.url, 5_000 + Math.random() * 4_000);
          void deductResult;
          return reply.code(202).send({ jobId: job.id });
        }
      }

      // ── Новая генерация — проверка лимитов и списание ──────────────────────
      let deductResult;
      try {
        deductResult = await checkAndDeduct(userId, 'image', spec.cost, spec.id);
      } catch (err: any) {
        return reply.code(403).send({ error: err.message, code: err.code ?? 'LIMIT_IMAGES' });
      }

      // Сохраняем сообщение пользователя в историю чата
      if (chatId) {
        await prisma.message.create({
          data: { chatId, userId, role: 'user', content: encrypt(prompt), mode: 'vision', tokensCost: 0, mediaUrl: sourceImageUrl ?? null },
        }).catch((e) => console.error('[generate/vision] Failed to save user message:', e.message));
      }

      const effectiveSize = userPlan.plan === 'FREE' ? '1024x1024' : '1024x1024'; // все текущие image-модели квадратные — см. TODO в models.ts про соотношения сторон

      const job = await prisma.generateJob.create({
        data: { userId, mode: 'vision', prompt },
      });

      const bullJob = await visionQueue.add('generate-image', {
        jobId: job.id,
        userId,
        prompt,
        chatId: chatId ?? null,
        size: effectiveSize,
        modelId,
        mediaCacheMode,
        caspersSpent: deductResult.caspersSpent,
        ...(sourceImageUrl ? { sourceImageUrl } : {}),
        ...(imageAspectRatio ? { imageAspectRatio } : {}),
      }).catch(async (err: any) => {
        // Ошибка очереди: возвращаем Caspers и уведомляем админа
        await refundCaspers(userId, deductResult.caspersSpent, spec.id).catch(() => {});
        const userInfo = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null);
        notifyApiError({
          userId,
          userName: userInfo?.name,
          operation: 'image_gen',
          error: err.message,
        }).catch(() => {});
        throw err;
      });

      await prisma.generateJob.update({
        where: { id: job.id },
        data: { bullJobId: bullJob.id },
      });

      await prisma.userImageRequest.create({ data: { userId, promptHash } }).catch(() => {});

      return reply.code(202).send({ jobId: job.id });
    },
  });

  // ── Sound (генерация музыки) ──────────────────────────────────────────────
  fastify.post('/generate/sound', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { prompt, chatId, musicMode, musicDuration, lyrics, styleAudio, sunoStyle, sunoTitle, sunoInstrumental } = generateSchema.parse(request.body);

      // Сбрасываем счётчики, если период закончился
      await checkResets(userId);

      // Rate limit на пользователя
      if (!await checkGenRateLimit(userId)) {
        return reply.code(429).send({ error: 'Слишком много запросов. Подождите минуту.', code: 'RATE_LIMITED' });
      }

      // Блокировка задачи: отклоняем, если у пользователя уже выполняется sound-задача
      const activeJob = await findActiveJob(userId, 'sound');
      if (activeJob) {
        return reply.code(409).send({ error: 'Задача уже выполняется. Подождите.', code: 'TASK_IN_PROGRESS', jobId: activeJob.id });
      }

      // Проверяем лимиты музыки и списываем.
      // Музыка пока вне реестра моделей (см. план) — фикс. цена из config/plans.ts.
      let deductResult;
      try {
        deductResult = await checkAndDeduct(userId, 'music', CASPER_COSTS.music_generate, 'music_generate');
      } catch (err: any) {
        return reply.code(403).send({ error: err.message, code: err.code ?? 'LIMIT_MUSIC' });
      }

      // Проверяем кэш медиа уже после списания
      const mediaCached = await getMediaCached('sound', prompt);

      if (mediaCached.hit) {
        const job = await prisma.generateJob.create({
          data: { userId, mode: 'sound', prompt, status: 'processing' },
        });
        completeCachedJobAfterDelay(
          job.id, mediaCached.url, 8_000 + Math.random() * 6_000,
          chatId ? { chatId, userId, prompt, mode: 'sound' } : undefined,
        );
        return reply.code(202).send({ jobId: job.id });
      }

      // Сохраняем сообщение пользователя в историю чата
      if (chatId) {
        await prisma.message.create({
          data: { chatId, userId, role: 'user', content: encrypt(prompt), mode: 'sound', tokensCost: 0, mediaUrl: null },
        }).catch((e) => console.error('[generate/sound] Failed to save user message:', e.message));
      }

      const job = await prisma.generateJob.create({
        data: { userId, mode: 'sound', prompt },
      });

      const bullJob = await soundQueue.add('generate-music', {
        jobId: job.id,
        userId,
        prompt,
        musicMode: musicMode ?? 'short',
        musicDuration: musicDuration,
        chatId: chatId ?? null,
        lyrics: lyrics,
        styleAudio: styleAudio,
        sunoStyle: sunoStyle,
        sunoTitle: sunoTitle,
        sunoInstrumental: sunoInstrumental,
        caspersSpent: deductResult.caspersSpent,
      }).catch(async (err: any) => {
        await refundCaspers(userId, deductResult.caspersSpent, 'music_generate').catch(() => {});
        const userInfo = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null);
        notifyApiError({
          userId,
          userName: userInfo?.name,
          operation: 'music_gen',
          error: err.message,
        }).catch(() => {});
        throw err;
      });

      await prisma.generateJob.update({
        where: { id: job.id },
        data: { bullJobId: bullJob.id },
      });

      return reply.code(202).send({ jobId: job.id });
    },
  });

  // ── Reel (генерация видео) ────────────────────────────────────────────────
  fastify.post('/generate/reel', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { prompt, chatId, model, videoDuration, videoAspectRatio, videoEnableAudio, videoResolution, videoImageUrl, negativePrompt, videoCameraPreset } = generateSchema.parse(request.body);

      const modelId = model ?? DEFAULT_VIDEO_MODEL_ID;
      const spec = findModel('video', modelId);
      if (!spec) return reply.code(400).send({ error: 'Неизвестная видео-модель', code: 'UNKNOWN_MODEL' });

      const effectiveDuration: VideoDurationChoice = videoDuration ?? '8s';

      const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
      const userPlan = userRecord?.plan ?? 'FREE';

      // Явный лок вместо молчаливой подмены модели: если план не дотягивает —
      // говорим прямо, а не тихо генерируем на Kling по цене выбранной модели.
      if (!planAtLeast(userPlan, spec.minPlan)) {
        return reply.code(403).send({ error: `Модель «${spec.label}» доступна с тарифа ${spec.minPlan}`, code: 'PLAN_RESTRICTED' });
      }
      if (videoImageUrl && !spec.capabilities?.imageToVideo) {
        return reply.code(400).send({ error: `Модель «${spec.label}» не поддерживает image-to-video`, code: 'MODEL_NO_IMG2VIDEO' });
      }
      // SkyReels/Framepack у провайдера вообще не имеют text-to-video режима —
      // без этой проверки запрос без картинки долетел бы до GoAPI и упал там
      // с невнятной 4xx вместо понятного сообщения пользователю здесь.
      if (!videoImageUrl && spec.capabilities?.imageRequired) {
        return reply.code(400).send({ error: `Модель «${spec.label}» работает только по фото — прикрепите изображение`, code: 'MODEL_IMAGE_REQUIRED' });
      }
      // Caspers-цена не зависит от разрешения (см. models.ts) — она посчитана под
      // конкретный набор resolutions в ui-параметрах модели. Список в UI можно обойти
      // прямым запросом к API, поэтому здесь та же проверка, что уже стоит для imageUrl —
      // без нее подмена resolution на более дорогое по факту у провайдера продаёт видео
      // ниже себестоимости.
      if (videoResolution && spec.ui.resolutions.length > 0 && !spec.ui.resolutions.includes(videoResolution)) {
        return reply.code(400).send({ error: `Модель «${spec.label}» не поддерживает разрешение ${videoResolution}`, code: 'MODEL_UNSUPPORTED_RESOLUTION' });
      }

      const cost = spec.cost(effectiveDuration);

      // Сбрасываем счётчики, если период закончился
      await checkResets(userId);

      // Rate limit на видео для пользователя (1/мин)
      if (!await checkVideoRateLimit(userId)) {
        return reply.code(429).send({ error: 'Слишком много запросов. Подождите минуту.', code: 'RATE_LIMITED' });
      }

      // Блокировка задачи: отклоняем, если у пользователя уже выполняется reel-задача
      const activeJob = await findActiveJob(userId, 'reel');
      if (activeJob) {
        return reply.code(409).send({ error: 'Задача уже выполняется. Подождите.', code: 'TASK_IN_PROGRESS', jobId: activeJob.id });
      }

      // Проверка кэша только для text-to-video (image-to-video кэш не использует)
      const mediaCacheMode = `reel:${modelId}:${effectiveDuration}`;
      if (!videoImageUrl) {
        const mediaCached = await getMediaCached(mediaCacheMode, prompt);
        if (mediaCached.hit) {
          try {
            await checkAndDeduct(userId, 'video', cost, spec.id);
          } catch (err: any) {
            return reply.code(403).send({ error: err.message, code: err.code ?? 'LIMIT_VIDEOS' });
          }
          const job = await prisma.generateJob.create({
            data: { userId, mode: 'reel', prompt, status: 'processing' },
          });
          completeCachedJobAfterDelay(
            job.id, mediaCached.url, 10_000 + Math.random() * 8_000,
            chatId ? { chatId, userId, prompt, mode: 'reel' } : undefined,
          );
          return reply.code(202).send({ jobId: job.id });
        }
      }

      // Проверяем лимиты и списываем
      let deductResult;
      try {
        deductResult = await checkAndDeduct(userId, 'video', cost, spec.id);
      } catch (err: any) {
        return reply.code(403).send({ error: err.message, code: err.code ?? 'LIMIT_VIDEOS' });
      }

      // Сохраняем сообщение пользователя в историю чата
      if (chatId) {
        await prisma.message.create({
          data: { chatId, userId, role: 'user', content: encrypt(prompt), mode: 'reel', tokensCost: 0, mediaUrl: videoImageUrl ?? null },
        }).catch((e) => console.error('[generate/reel] Failed to save user message:', e.message));
      }

      const job = await prisma.generateJob.create({
        data: { userId, mode: 'reel', prompt },
      });

      const bullJob = await reelQueue.add('generate-video', {
        jobId: job.id,
        userId,
        prompt,
        chatId: chatId ?? null,
        modelId,
        mediaCacheMode,
        duration: effectiveDuration,
        aspectRatio: videoAspectRatio ?? '16:9',
        // GoAPI берёт за звук отдельно (у Kling/Veo — 2x надбавка) — наша Caspers-цена
        // это не учитывает, поэтому доверять клиентскому videoEnableAudio нельзя: включаем
        // звук только там, где модель реально заявлена как поддерживающая его в реестре.
        enableAudio: spec.capabilities?.audio ? (videoEnableAudio ?? false) : false,
        resolution: videoResolution ?? '720p',
        imageUrl: videoImageUrl ?? null,
        negativePrompt,
        cameraPreset: videoCameraPreset,
        caspersSpent: deductResult.caspersSpent,
      }).catch(async (err: any) => {
        await refundCaspers(userId, deductResult.caspersSpent, spec.id).catch(() => {});
        const userInfo = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null);
        notifyApiError({
          userId,
          userName: userInfo?.name,
          operation: 'video_gen',
          error: err.message,
          context: `model=${modelId} duration=${effectiveDuration}`,
        }).catch(() => {});
        throw err;
      });

      await prisma.generateJob.update({
        where: { id: job.id },
        data: { bullJobId: bullJob.id },
      });

      return reply.code(202).send({ jobId: job.id });
    },
  });

  // ── Voice (голосовой чат) ─────────────────────────────────────────────────
  // ⚠️ Цена voice_exchange в CASPER_COSTS — заглушка, см. комментарий в config/plans.ts.
  fastify.post('/generate/voice', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { chatId, audioUrl } = generateSchema.parse(request.body);

      if (!audioUrl) return reply.code(400).send({ error: 'audioUrl обязателен', code: 'INVALID_REQUEST' });

      // Сбрасываем счётчики, если период закончился
      await checkResets(userId);

      // Rate limit — тот же лимит, что у картинок (3/мин)
      if (!await checkGenRateLimit(userId)) {
        return reply.code(429).send({ error: 'Слишком много запросов. Подождите минуту.', code: 'RATE_LIMITED' });
      }

      // Блокировка задачи: отклоняем, если уже выполняется голосовая задача
      const activeJob = await findActiveJob(userId, 'voice');
      if (activeJob) {
        return reply.code(409).send({ error: 'Задача уже выполняется. Подождите.', code: 'TASK_IN_PROGRESS', jobId: activeJob.id });
      }

      let deductResult;
      try {
        deductResult = await checkAndDeduct(userId, 'voice', CASPER_COSTS.voice_exchange, 'voice_exchange');
      } catch (err: any) {
        return reply.code(403).send({ error: err.message, code: err.code ?? 'LIMIT_VOICE' });
      }

      // prompt пока пуст — заполнится транскриптом в voice.worker.ts после распознавания речи
      const job = await prisma.generateJob.create({
        data: { userId, mode: 'voice', prompt: '' },
      });

      const bullJob = await voiceQueue.add('generate-voice', {
        jobId: job.id,
        userId,
        chatId: chatId ?? null,
        audioUrl,
        caspersSpent: deductResult.caspersSpent,
      }).catch(async (err: any) => {
        await refundCaspers(userId, deductResult.caspersSpent, 'voice_exchange').catch(() => {});
        const userInfo = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null);
        notifyApiError({
          userId,
          userName: userInfo?.name,
          operation: 'voice_gen',
          error: err.message,
        }).catch(() => {});
        throw err;
      });

      await prisma.generateJob.update({
        where: { id: job.id },
        data: { bullJobId: bullJob.id },
      });

      return reply.code(202).send({ jobId: job.id });
    },
  });

  // ── Генератор текста песни ────────────────────────────────────────────────
  fastify.post('/generate/lyrics', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { topic, style, instrumental } = z.object({
        topic: z.string().min(1).max(300),
        style: z.string().max(100).optional(),
        instrumental: z.boolean().optional(),
      }).parse(request.body);

      if (instrumental) {
        return reply.send({ lyrics: '' });
      }

      const styleHint = style ? ` in ${style} style` : '';
      const systemMsg = `You are a professional songwriter. Write song lyrics${styleHint} about: "${topic}".
Rules:
- 2-3 verses + 1 chorus, total ~12-16 lines
- No section headers like [Verse] or [Chorus]
- No timestamps
- Emotional, vivid imagery
- Match the style/genre if specified
- Respond in the same language as the topic
Return ONLY the lyrics text, nothing else.`;

      try {
        const lyrics = await callCloudflareJSON(
          [{ role: 'user', content: systemMsg }],
          512,
        );
        return reply.send({ lyrics: lyrics.trim() });
      } catch {
        return reply.code(502).send({ error: 'Не удалось сгенерировать текст' });
      }
    },
  });

  // ── Синхронизация губ (Lip Sync) ──────────────────────────────────────────
  fastify.post('/generate/lipsync', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { videoUrl, audioUrl, chatId } = z.object({
        videoUrl: z.string().url(),
        audioUrl: z.string().url(),
        chatId:   z.string().optional(),
      }).parse(request.body);

      // Только платные планы
      const userPlan = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
      if (userPlan?.plan === 'FREE') {
        return reply.code(403).send({ error: 'Генерация провалась, попробуйте позже', code: 'PLAN_RESTRICTED' });
      }

      // Rate limit (1/мин)
      if (!await checkVideoRateLimit(userId)) {
        return reply.code(429).send({ error: 'Слишком много запросов. Подождите минуту.', code: 'RATE_LIMITED' });
      }

      await checkResets(userId);

      // Списываем как стандартное 4-секундное видео (используем цену Kling 4s из реестра,
      // чтобы не заводить отдельную магическую константу).
      const lipsyncCost = findModel('video', 'kling-v2.5')!.cost('4s');
      let deductResult;
      try {
        deductResult = await checkAndDeduct(userId, 'video', lipsyncCost, 'lipsync');
      } catch (err: any) {
        return reply.code(403).send({ error: err.message, code: err.code ?? 'LIMIT_VIDEOS' });
      }

      let resultUrl: string;
      try {
        resultUrl = await generateLipSync(videoUrl, audioUrl);
      } catch (err: any) {
        await refundCaspers(userId, deductResult.caspersSpent, 'lipsync').catch(() => {});
        const userInfo = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null);
        notifyApiError({
          userId,
          userName: userInfo?.name,
          operation: 'video_gen',
          error: err.message,
          context: 'lipsync',
        }).catch(() => {});
        return reply.code(502).send({ error: 'Генерация провалась, попробуйте позже' });
      }

      if (chatId) {
        await prisma.message.create({
          data: { chatId, userId, role: 'assistant', content: encrypt('lip sync'), mode: 'reel', tokensCost: 0, mediaUrl: resultUrl },
        }).catch(() => {});
      }

      return { mediaUrl: resultUrl };
    },
  });

  // ── Статус задачи ─────────────────────────────────────────────────────────
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
        // Нужна фронту для аватар-анимации свежесгенерированного сообщения
        // (MessageAvatar/modelParticleShape) — раньше поля тут не было вообще,
        // и аватар картинки/видео до перезагрузки страницы всегда падал на
        // общий "мозг", даже у моделей со своим лого (напр. gpt-image/chatgpt).
        modelId: job.modelId,
        error: job.error ? 'Генерация провалась, попробуйте позже' : null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };
    },
  });

  // ── Список задач пользователя ─────────────────────────────────────────────
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
