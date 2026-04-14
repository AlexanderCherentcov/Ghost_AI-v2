import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { route } from '../services/ai-router.js';
import { getTextCached, setTextCached, isShortPrompt } from '../services/cache.js';
import { getVectorCached, setVectorCached } from '../services/vector-cache.js';
import { checkResets, checkAndDeduct, refundCounter, sanitizeInput } from '../services/tokens.js';
import type { RequestType } from '../services/tokens.js';
import { checkChatRateLimit, acquireChatLock, releaseChatLock } from '../services/user-limiter.js';
import { streamOpenRouter, type ChatMessage } from '../services/providers/openrouter.js';
import { OR_MODELS } from '../services/providers/openrouter.js';
import { getSystemPrompt } from '../lib/prompts.js';
import { encrypt, safeDecrypt } from '../lib/crypto.js';
import type { SocketStream } from '@fastify/websocket';

// ─── Schemas ──────────────────────────────────────────────────────────────────

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
  // Image: base64 data URL (max ~3MB after resize)
  imageUrl: z.string().max(3145728).optional(),
  // Document: extracted text content
  fileContent: z.string().max(65536).optional(),
  // Original file name (shown in chat + used for lang detection)
  fileName: z.string().max(255).optional(),
  // Code-fence language (js, python, etc.)
  fileLang: z.string().max(32).optional(),
});

// ─── Provider stream factory ──────────────────────────────────────────────────

function getProviderStream(model: string, messages: ChatMessage[], maxTokens?: number, fallbackModel?: string) {
  return streamOpenRouter(messages, model, maxTokens, fallbackModel);
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default async function chatRoutes(fastify: FastifyInstance) {
  // ── List chats ────────────────────────────────────────────────────────────
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

  // ── Create chat ───────────────────────────────────────────────────────────
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

  // ── Get chat messages ─────────────────────────────────────────────────────
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

      // Decrypt message content (graceful — legacy unencrypted messages returned as-is)
      const decrypted = messages.map((m) => ({ ...m, content: safeDecrypt(m.content) }));

      return { messages: decrypted };
    },
  });

  // ── Update chat title ─────────────────────────────────────────────────────
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

  // ── Delete chat ───────────────────────────────────────────────────────────
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

  // ── WebSocket: stream AI response ─────────────────────────────────────────
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

      // Verify JWT
      let userId: string;
      try {
        const payload = fastify.jwt.verify<{ userId: string }>(parsed.jwt ?? '');
        userId = payload.userId;
      } catch {
        send({ type: 'error', code: 'UNAUTHORIZED' });
        return;
      }

      // ── Per-user rate limit ────────────────────────────────────────────────
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

      try {
        // Verify chat ownership + load user profile
        const [chat, userProfile] = await Promise.all([
          prisma.chat.findFirst({ where: { id: chatId, userId } }),
          prisma.user.findUnique({ where: { id: userId }, select: { responseStyle: true, plan: true, files_monthly_limit: true } }),
        ]);
        if (!chat) {
          send({ type: 'error', code: 'CHAT_NOT_FOUND' });
          return;
        }
        const responseStyle = userProfile?.responseStyle ?? null;
        const plan = userProfile?.plan ?? 'FREE';

        // FREE plan: only chat mode allowed
        if (plan === 'FREE' && mode !== 'chat') {
          send({ type: 'error', code: 'PLAN_RESTRICTED', message: 'Обновите тариф для использования этой функции.' });
          return;
        }

        // FREE plan: no file attachments (files_monthly_limit = 0)
        if (fileContent && (userProfile?.files_monthly_limit ?? 0) === 0) {
          send({ type: 'error', code: 'FREE_LOCKED', message: 'Файлы доступны с платного тарифа.' });
          return;
        }

        // Effective prompt for AI
        const effectivePrompt = prompt
          || (imageUrl ? 'Опиши что изображено на картинке.' : '')
          || (fileContent ? 'Проанализируй содержимое прикреплённого файла.' : '');

        // Build file context block
        let fileBlock = '';
        if (fileContent && fileName) {
          const lang = fileLang ?? 'text';
          fileBlock = `Пользователь прикрепил файл «${fileName}»:\n\`\`\`${lang}\n${fileContent}\n\`\`\`\n\n`;
        }

        const hasAttachment = !!(imageUrl || fileContent);

        // Route request
        const { provider, complexity, model, fallbackModel, maxTokens } = route(
          effectivePrompt || fileName || 'анализ файла',
          !!fileContent,
          fastify.log,
          !!imageUrl,
          plan,
          preferredModel
        );

        // Determine request type based on which model was selected
        const isProModel = model === OR_MODELS.deepseek;
        const requestType: RequestType = isProModel ? 'chat_pro' : 'chat_std';

        // Reset daily counters if period ended
        await checkResets(userId);
        // Check limits and deduct BEFORE calling AI (with refund on 5xx)
        await checkAndDeduct(userId, requestType, 1, !!fileContent);

        // History context for cache key: последние user-сообщения (без текущего)
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

        // Merge cache hits — TypeScript-safe narrowing through a single variable
        const cacheHit = cached.hit ? cached : vecCached;
        if (cacheHit.hit) {
          const response = cacheHit.response as { content: string };

          // No token deduction on cache hits
          const tokensCost = 0;

          // Save messages
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
                tokensCost,
              },
            }),
            prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
          ]);

          // Stream cached response token by token
          for (const char of response.content) {
            send({ type: 'token', data: char });
          }
          send({ type: 'done', tokensCost, cacheHit: true });
          return;
        }

        // Build messages array for AI
        // When imageUrl present: build multimodal content array (Sonnet vision)
        const systemMsg: ChatMessage = { role: 'system', content: getSystemPrompt(mode, responseStyle, plan) };
        const historyMsgs: ChatMessage[] = history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        let userMsg: ChatMessage;
        if (imageUrl && !fileContent) {
          // Multimodal: text + image
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

        // Save user message (include image URL if attached)
        const userContent = prompt || (imageUrl ? '[Изображение]' : '');
        await prisma.message.create({
          data: { chatId, userId, role: 'user', content: encrypt(userContent), mode, tokensCost: 0, mediaUrl: imageUrl ?? null },
        });

        // Stream from provider (maxTokens is set for FREE plan)
        let fullResponse = '';
        const stream = streamOpenRouter(messages, model, maxTokens, fallbackModel);

        for await (const chunk of stream) {
          if (chunk.type === 'token' && chunk.data) {
            fullResponse += chunk.data;
            send({ type: 'token', data: chunk.data });
          }
        }

        // No token deduction — counters already deducted before API call
        const tokensCost = 0;

        // Cache the response (skip if any attachment present)
        if (!hasAttachment) {
          await setTextCached(mode, complexity, effectivePrompt, { content: fullResponse }, userHistoryContext, responseStyle);
          await setVectorCached(mode, effectivePrompt, { content: fullResponse }, userHistoryContext, responseStyle);
        }

        // Save assistant message
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
              tokensCost,
            },
          }),
          prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
        ]);

        // Auto-generate title from first message
        let newTitle: string | undefined;
        const messageCount = await prisma.message.count({ where: { chatId } });
        if (messageCount <= 2 && chat.title === 'Новый чат') {
          const titleSource = prompt || (fileName ? `📎 ${fileName}` : '📎 Изображение');
          newTitle = titleSource.slice(0, 40) + (titleSource.length > 40 ? '...' : '');
          await prisma.chat.update({ where: { id: chatId }, data: { title: newTitle } });
        }

        send({ type: 'done', tokensCost, cacheHit: false, title: newTitle });
      } catch (err: any) {
        fastify.log.error(err, '[WS] Error processing message');
        // If it's a server error (not a limit error), refund the counter
        const limitCodes = ['LIMIT_FREE_MESSAGES', 'LIMIT_STD_MESSAGES', 'LIMIT_PRO_MESSAGES', 'LIMIT_PRO_UNAVAILABLE', 'LIMIT_FILES', 'LIMIT_IMAGES', 'FREE_LOCKED', 'PLAN_RESTRICTED'];
        if (userId && !limitCodes.includes(err.code)) {
          const isProModel = parsed ? OR_MODELS.deepseek === route(parsed.prompt || '', !!parsed.fileContent, undefined, !!parsed.imageUrl, undefined, parsed.preferredModel).model : false;
          const rt: RequestType = isProModel ? 'chat_pro' : 'chat_std';
          await refundCounter(userId, rt, 1, !!parsed?.fileContent).catch(() => {});
        }
        send({ type: 'error', code: err.code ?? 'SERVER_ERROR', message: err.message });
      } finally {
        // Всегда освобождаем лок — даже при ошибке или стриминге кэша
        await releaseChatLock(userId);
      }
    });
  });
}
