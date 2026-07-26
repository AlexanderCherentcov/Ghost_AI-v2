import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { route } from '../services/ai-router.js';
import { getTextCached, setTextCached, isShortPrompt } from '../services/cache.js';
import { getVectorCached, setVectorCached } from '../services/vector-cache.js';
import { checkResets, checkAndDeduct, refundCaspers, sanitizeInput } from '../services/tokens.js';
import type { RequestType } from '../services/tokens.js';
import { checkChatRateLimit, acquireChatLock, releaseChatLock } from '../services/user-limiter.js';
import { streamOpenRouter, type ChatMessage } from '../services/providers/openrouter.js';
import { streamCloudflare } from '../services/providers/cloudflare.js';
import { OR_MODELS } from '../services/providers/openrouter.js';
import { getSystemPrompt } from '../lib/prompts.js';
import { encrypt, safeDecrypt } from '../lib/crypto.js';
import { notifyApiError } from '../services/admin-notify.js';
import { shouldRefundCaspers, resolveChatErrorMessage } from '../lib/chat-errors.js';
import { generateChatTitle } from './dispatch.js';
import type { SocketStream } from '@fastify/websocket';

// ─── Схемы ─────────────────────────────────────────────────────────────────────

const createChatSchema = z.object({
  title: z.string().max(100).optional(),
  mode: z.enum(['chat', 'vision', 'sound', 'reel', 'think']).default('chat'),
});

const wsMessageSchema = z.object({
  chatId: z.string(),
  mode: z.enum(['chat', 'think']),
  prompt: z.string().min(0).max(32000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).default([]),
  preferredModel: z.enum(['haiku', 'deepseek']).optional(),
  // Изображение: base64 data URL (макс. ~3МБ после ресайза)
  imageUrl: z.string().max(3145728).optional(),
  // Документ: извлечённый текст
  fileContent: z.string().max(65536).optional(),
  // Исходное имя файла (показывается в чате + используется для определения языка)
  fileName: z.string().max(255).optional(),
  // Язык для блока кода (js, python и т.д.)
  fileLang: z.string().max(32).optional(),
});

// ─── Плагин ───────────────────────────────────────────────────────────────────

export default async function chatRoutes(fastify: FastifyInstance) {
  // ── Список чатов ──────────────────────────────────────────────────────────
  fastify.get('/chats', {
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      const { userId } = request.user;
      const chats = await prisma.chat.findMany({
        where: { userId, messages: { some: {} } },
        orderBy: { updatedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          title: true,
          mode: true,
          updatedAt: true,
          _count: { select: { messages: true } },
        },
      });
      return { chats };
    },
  });

  // ── Создание чата ─────────────────────────────────────────────────────────
  fastify.post('/chats', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const data = createChatSchema.parse(request.body);

      const chat = await prisma.chat.create({
        data: { userId, ...data },
      });

      return reply.code(201).send(chat);
    },
  });

  // ── Получение сообщений чата ──────────────────────────────────────────────
  fastify.get('/chats/:id/messages', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { id } = request.params as { id: string };
      const query = request.query as { before?: string; limit?: string };
      const limit = Math.min(parseInt(query.limit ?? '50'), 100);

      const chat = await prisma.chat.findFirst({ where: { id, userId } });
      if (!chat) return reply.code(404).send({ error: 'Chat not found' });

      const messages = await prisma.message.findMany({
        where: {
          chatId: id,
          ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: {
          id: true,
          role: true,
          content: true,
          mode: true,
          tokensCost: true,
          cacheHit: true,
          mediaUrl: true,
          createdAt: true,
        },
      });

      // Расшифровываем содержимое (мягко — старые незашифрованные сообщения возвращаются как есть)
      const decrypted = messages.map((m) => ({ ...m, content: safeDecrypt(m.content) }));

      return { messages: decrypted };
    },
  });

  // ── Автогенерация заголовка чата по промту изображения/видео/музыки ──────
  fastify.post('/chats/:id/auto-title', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { id } = request.params as { id: string };
      const { prompt } = request.body as { prompt: string };

      if (!prompt?.trim()) return reply.code(400).send({ error: 'prompt required' });

      const chat = await prisma.chat.findFirst({ where: { id, userId } });
      if (!chat) return reply.code(404).send({ error: 'Chat not found' });

      // Автогенерация заголовка только если он ещё дефолтный и сообщений мало (первая генерация)
      if (chat.title !== 'Новый чат') return reply.send({ title: chat.title });
      const msgCount = await prisma.message.count({ where: { chatId: id } });
      if (msgCount > 4) return reply.send({ title: chat.title });

      const title = await generateChatTitle(prompt);
      await prisma.chat.update({ where: { id }, data: { title } });
      return reply.send({ title });
    },
  });

  // ── Обновление заголовка чата ─────────────────────────────────────────────
  fastify.patch('/chats/:id', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { id } = request.params as { id: string };
      const body = request.body as { title?: string };

      const chat = await prisma.chat.findFirst({ where: { id, userId } });
      if (!chat) return reply.code(404).send({ error: 'Chat not found' });

      const updated = await prisma.chat.update({
        where: { id },
        data: { title: body.title },
      });

      return updated;
    },
  });

  // ── Удаление чата ─────────────────────────────────────────────────────────
  fastify.delete('/chats/:id', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const { id } = request.params as { id: string };

      const chat = await prisma.chat.findFirst({ where: { id, userId } });
      if (!chat) return reply.code(404).send({ error: 'Chat not found' });

      await prisma.chat.delete({ where: { id } });
      return reply.code(204).send();
    },
  });

  // ── WebSocket: стриминг ответа ИИ ─────────────────────────────────────────
  fastify.get('/chat/stream', { websocket: true }, async (connection: SocketStream, request) => {
    const socket = connection.socket;
    const send = (data: object) => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(data));
      }
    };

    socket.on('message', async (rawMessage: Buffer) => {
      let parsed: z.infer<typeof wsMessageSchema> & { jwt?: string };

      try {
        parsed = JSON.parse(rawMessage.toString());
        wsMessageSchema.parse(parsed);
      } catch {
        send({ type: 'error', code: 'INVALID_REQUEST' });
        return;
      }

      // Проверяем JWT
      let userId: string;
      try {
        const payload = fastify.jwt.verify<{ userId: string }>(parsed.jwt ?? '');
        userId = payload.userId;
      } catch {
        send({ type: 'error', code: 'UNAUTHORIZED' });
        return;
      }

      // ── [H-01] Проверка бана через Redis ───────────────────────────────────
      {
        const redis = (await import('../lib/redis.js')).redis;
        const isBanned = await redis.exists(`banned:${userId}`);
        if (isBanned) {
          send({ type: 'error', code: 'BANNED' });
          socket.close();
          return;
        }
      }

      // ── Rate limit на пользователя ──────────────────────────────────────────
      if (!await checkChatRateLimit(userId)) {
        send({ type: 'error', code: 'RATE_LIMITED', message: 'Слишком много сообщений. Подождите минуту.' });
        return;
      }

      // ── In-flight lock (один запрос одновременно на пользователя) ─────────
      if (!await acquireChatLock(userId)) {
        send({ type: 'error', code: 'TASK_IN_PROGRESS', message: 'Подождите завершения предыдущего запроса.' });
        return;
      }

      const { chatId, mode, history, imageUrl, fileContent, fileName, fileLang, preferredModel } = parsed;
      const prompt = sanitizeInput(parsed.prompt);

      let requestType: RequestType = 'chat_std';

      try {
        // Проверяем владение чатом + загружаем профиль пользователя
        const [chat, userProfile] = await Promise.all([
          prisma.chat.findFirst({ where: { id: chatId, userId } }),
          prisma.user.findUnique({ where: { id: userId }, select: { responseStyle: true, plan: true } }),
        ]);
        if (!chat) {
          send({ type: 'error', code: 'CHAT_NOT_FOUND' });
          return;
        }
        const responseStyle = userProfile?.responseStyle ?? null;
        const plan = userProfile?.plan ?? 'FREE';

        // Вложения-файлы требуют платного тарифа
        if (fileContent && plan === 'FREE') {
          send({ type: 'error', code: 'FREE_LOCKED', message: 'Файлы доступны с платного тарифа.' });
          return;
        }

        // Итоговый промт для ИИ
        const effectivePrompt = prompt
          || (imageUrl ? 'Опиши что изображено на картинке.' : '')
          || (fileContent ? 'Проанализируй содержимое прикреплённого файла.' : '');

        // Собираем блок контекста файла
        let fileBlock = '';
        if (fileContent && fileName) {
          const lang = fileLang ?? 'text';
          fileBlock = `Пользователь прикрепил файл «${fileName}»:\n\`\`\`${lang}\n${fileContent}\n\`\`\`\n\n`;
        }

        const hasAttachment = !!(imageUrl || fileContent);

        // Маршрутизируем запрос
        const { provider, complexity, model, fallbackModels, maxTokens } = route(
          effectivePrompt || fileName || 'анализ файла',
          !!fileContent,
          fastify.log,
          !!imageUrl,
          plan,
          preferredModel,
          mode,
        );

        // Определяем тип запроса
        // sonar (веб-поиск) и режим think считаются про-запросами
        const isProRequest = mode === 'think' || model === OR_MODELS.sonar;
        requestType = isProRequest ? 'chat_pro' : 'chat_std';

        // Сбрасываем дневные/недельные/месячные счётчики, если период закончился
        await checkResets(userId);
        // Проверяем лимиты и списываем ДО вызова ИИ (с возвратом при ошибке)
        await checkAndDeduct(userId, requestType, 1, !!fileContent);

        // Контекст истории для ключа кэша
        const userHistoryContext = history
          .filter(m => m.role === 'user')
          .map(m => m.content);

        // ── Cache lookup (пропускаем при вложениях и коротких промптах) ────────
        const cacheDisabled = hasAttachment || isShortPrompt(effectivePrompt);

        // 1) Redis (точный составной ключ)
        const cached = cacheDisabled
          ? { hit: false as const }
          : await getTextCached(mode, complexity, effectivePrompt, userHistoryContext, responseStyle);

        // 2) Vector cache (семантический, если Redis не попал)
        const vecCached = (!cacheDisabled && !cached.hit)
          ? await getVectorCached(mode, effectivePrompt, userHistoryContext, responseStyle)
          : { hit: false as const };

        // Объединяем попадания в кэш
        const cacheHit = cached.hit ? cached : vecCached;
        if (cacheHit.hit) {
          const response = cacheHit.response as { content: string };

          const userContent = prompt || (fileName ? `[Файл: ${fileName}]` : imageUrl ? '[Изображение]' : '');
          await prisma.$transaction([
            prisma.message.create({
              data: { chatId, userId, role: 'user', content: encrypt(userContent), mode, tokensCost: 0, mediaUrl: imageUrl ?? null },
            }),
            prisma.message.create({
              data: {
                chatId,
                userId,
                role: 'assistant',
                content: encrypt(response.content),
                mode,
                complexity,
                provider,
                cacheHit: true,
                tokensCost: 0,
              },
            }),
            prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
          ]);

          // Стримим кэшированный ответ токен за токеном
          for (const char of response.content) {
            send({ type: 'token', data: char });
          }
          send({ type: 'done', tokensCost: 0, cacheHit: true });
          return;
        }

        // Собираем массив сообщений для ИИ
        const systemMsg: ChatMessage = { role: 'system', content: getSystemPrompt(mode, responseStyle, plan) };
        const historyMsgs: ChatMessage[] = history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        let userMsg: ChatMessage;
        if (imageUrl && !fileContent) {
          // Мультимодально: текст + изображение (только для vision-моделей OpenRouter)
          const textPart = effectivePrompt.trim() || 'Опиши что изображено на картинке.';
          userMsg = {
            role: 'user',
            content: [
              { type: 'text', text: textPart },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'auto' } },
            ],
          };
        } else {
          userMsg = { role: 'user', content: (fileBlock + effectivePrompt).trim() };
        }

        const messages: ChatMessage[] = [systemMsg, ...historyMsgs, userMsg];

        // Сохраняем сообщение пользователя
        const userContent = prompt || (imageUrl ? '[Изображение]' : '');
        await prisma.message.create({
          data: { chatId, userId, role: 'user', content: encrypt(userContent), mode, tokensCost: 0, mediaUrl: imageUrl ?? null },
        });

        // Стримим от провайдера
        let fullResponse = '';

        // Обычный чат: основной Cloudflare Llama, резерв OpenRouter Llama если CF недоступен
        // Про/think: OpenRouter с цепочкой резервных моделей
        async function* buildStream() {
          if (provider !== 'cloudflare') {
            yield* streamOpenRouter(messages, model, maxTokens, fallbackModels);
            return;
          }
          try {
            yield* streamCloudflare(messages, maxTokens);
          } catch {
            const cfFallback = fallbackModels?.[0] ?? OR_MODELS.llama;
            fastify.log.warn(`[chat] Cloudflare down, falling back to ${cfFallback}`);
            yield* streamOpenRouter(messages, cfFallback, maxTokens);
          }
        }

        try {
          for await (const chunk of buildStream()) {
            if (chunk.type === 'token' && chunk.data) {
              fullResponse += chunk.data;
              send({ type: 'token', data: chunk.data });
            }
          }
        } catch (streamErr: any) {
          // Ошибка API во время стриминга: уведомляем админов с деталями, пользователю — общее сообщение
          const userInfo = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null);
          notifyApiError({
            userId,
            userName: userInfo?.name,
            operation: 'chat',
            error: streamErr.message ?? String(streamErr),
            context: `mode=${mode} provider=${provider} model=${model}`,
          }).catch(() => {});

          // Возвращаем Caspers, если операция была платной
          await refundCaspers(userId, requestType).catch(() => {});

          send({ type: 'error', code: 'SERVER_ERROR', message: 'Ошибка соединения, попробуйте позже' });
          return;
        }

        // Кэшируем ответ (пропускаем, если есть вложение)
        if (!hasAttachment && fullResponse) {
          await setTextCached(mode, complexity, effectivePrompt, { content: fullResponse }, userHistoryContext, responseStyle);
          await setVectorCached(mode, effectivePrompt, { content: fullResponse }, userHistoryContext, responseStyle);
        }

        // Сохраняем ответ ассистента
        await prisma.$transaction([
          prisma.message.create({
            data: {
              chatId,
              userId,
              role: 'assistant',
              content: encrypt(fullResponse),
              mode,
              complexity,
              provider,
              cacheHit: false,
              tokensCost: 0,
            },
          }),
          prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
        ]);

        // Отправляем done сразу — это сразу разблокирует ввод у пользователя
        send({ type: 'done', tokensCost: 0, cacheHit: false });

        // Автогенерация заголовка в фоне (не блокирует)
        const messageCount = await prisma.message.count({ where: { chatId } });
        if (messageCount <= 2 && chat.title === 'Новый чат') {
          const textSource = prompt || null;
          const fallback = textSource
            ? textSource.slice(0, 50) + (textSource.length > 50 ? '...' : '')
            : fileName ? `📎 ${fileName}` : '📎 Изображение';

          (textSource ? generateChatTitle(textSource) : Promise.resolve(fallback))
            .catch(() => fallback)
            .then(async (title) => {
              await prisma.chat.update({ where: { id: chatId }, data: { title } }).catch(() => {});
              // Отправляем заголовок в ещё открытый WS, чтобы сайдбар обновился без перезагрузки
              send({ type: 'title', chatId, title } as any);
            });
        }
      } catch (err: any) {
        fastify.log.error(err, '[WS] Error processing message');
        // Классификация кода ошибки — см. lib/chat-errors.ts (протестировано отдельно,
        // расхождение этого списка с tokens.ts уже один раз пряталось от пользователя).
        if (userId && shouldRefundCaspers(err.code)) {
          await refundCaspers(userId, requestType).catch(() => {});
        }

        // Отправляем пользователю сообщение (никогда не раскрываем детали провайдера/модели)
        send({ type: 'error', code: err.code ?? 'SERVER_ERROR', message: resolveChatErrorMessage(err.code, err.message) });
      } finally {
        await releaseChatLock(userId).catch(() => {});
      }
    });
  });
}
