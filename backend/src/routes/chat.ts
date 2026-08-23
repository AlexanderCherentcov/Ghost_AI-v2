import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { resolveChatModel } from '../services/ai-router.js';
import { AUTO_MODEL_ID, findChatModelByProviderModel, type ChatModelSpec } from '../config/models.js';
import { getTextCached, setTextCached, isShortPrompt } from '../services/cache.js';
import { getVectorCached, setVectorCached } from '../services/vector-cache.js';
import { checkResets, checkAndDeduct, refundCaspers, sanitizeInput } from '../services/tokens.js';
import { checkChatRateLimit, acquireChatLock, releaseChatLock } from '../services/user-limiter.js';
import { streamOpenRouter, type ChatMessage } from '../services/providers/openrouter.js';
import { streamCloudflare } from '../services/providers/cloudflare.js';
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
  // id модели из реестра (config/models.ts), 'auto' по умолчанию.
  model: z.string().optional(),
  prompt: z.string().min(0).max(32000),
  // max(10) — фронтенд и так режет историю до последних 10 сообщений
  // (ChatIdPage.tsx), но это клиентское ограничение; без зеркального лимита здесь
  // любой другой клиент (бот, мини-апп, прямой вызов API) мог прислать сколько угодно
  // сообщений и раздуть счёт за токены у моделей с большим контекстным окном.
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(8000),
  })).max(10).default([]),
  // ── Легаси-поля ──────────────────────────────────────────────────────────
  // Старые клиенты (открытые вкладки на момент деплоя) шлют это вместо `model`.
  // Убрать после того, как все клиенты обновятся — см. план в mellow-imagining-dawn.md.
  mode: z.enum(['chat', 'think']).optional(),
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

/** Легаси mode/preferredModel → id модели из реестра. Убрать вместе со схемой выше. */
function resolveLegacyModelId(mode?: 'chat' | 'think', preferredModel?: 'haiku' | 'deepseek'): string {
  if (mode === 'think' || preferredModel === 'deepseek') return 'deepseek-v3.2';
  return AUTO_MODEL_ID;
}

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

      const { chatId, history, imageUrl, fileContent, fileName, fileLang } = parsed;
      const prompt = sanitizeInput(parsed.prompt);
      const modelId = parsed.model ?? resolveLegacyModelId(parsed.mode, parsed.preferredModel);

      let caspersSpent = 0; // фактически списано — для честного refund при ошибке (см. tokens.ts)

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

        // Разрешаем модель: явный выбор уважается всегда (включая ошибку вместо
        // молчаливой подмены), 'auto' отдаём диспетчеру — см. ai-router.ts.
        let spec: ChatModelSpec;
        let billedCost: number;
        try {
          ({ spec, billedCost } = resolveChatModel(modelId, {
            prompt: effectivePrompt || fileName || 'анализ файла',
            hasImage: !!imageUrl,
            hasDocument: !!fileContent,
            plan,
            logger: fastify.log,
          }));
        } catch (routeErr: any) {
          send({ type: 'error', code: routeErr.code ?? 'UNKNOWN_MODEL', message: routeErr.message });
          return;
        }

        // Сбрасываем дневные/недельные/месячные счётчики, если период закончился
        await checkResets(userId);
        // Проверяем лимиты и списываем ДО вызова ИИ (с возвратом при ошибке).
        // billedCost, а не spec.cost — при «Авто» это минимум AUTO_MIN_COST,
        // даже если диспетчер выбрал бесплатную Llama (см. ai-router.ts).
        const deductResult = await checkAndDeduct(userId, 'chat', billedCost, spec.id);
        caspersSpent = deductResult.caspersSpent;

        // Контекст истории для ключа кэша
        const userHistoryContext = history
          .filter(m => m.role === 'user')
          .map(m => m.content);

        // ── Cache lookup (пропускаем при вложениях и коротких промптах) ────────
        const cacheDisabled = hasAttachment || isShortPrompt(effectivePrompt);

        // 1) Redis (точный составной ключ)
        const cached = cacheDisabled
          ? { hit: false as const }
          : await getTextCached(spec.id, effectivePrompt, userHistoryContext, responseStyle);

        // 2) Vector cache (семантический, если Redis не попал)
        const vecCached = (!cacheDisabled && !cached.hit)
          ? await getVectorCached(spec.id, effectivePrompt, userHistoryContext, responseStyle)
          : { hit: false as const };

        // Объединяем попадания в кэш
        const cacheHit = cached.hit ? cached : vecCached;
        if (cacheHit.hit) {
          const response = cacheHit.response as { content: string };

          // Caspers уже списаны выше (checkAndDeduct на строке 307) и здесь
          // НЕ возвращаются — по прямому решению Александра: попадание в кэш
          // платной модели списывается по полной цене, так же как у картинок/
          // видео/музыки (services/routes/generate.ts — там тот же принцип
          // с явным комментарием «это наша экономия, не пользователя»).
          // tokensCost:0 ниже — это про «не было нового обращения к провайдеру»,
          // а не про фактическое списание Caspers (оно уже отражено в
          // CasperTransaction из checkAndDeduct) — тот же смысл, что и в media-кэше.

          const userContent = prompt || (fileName ? `[Файл: ${fileName}]` : imageUrl ? '[Изображение]' : '');
          await prisma.$transaction([
            prisma.message.create({
              data: { chatId, userId, role: 'user', content: encrypt(userContent), mode: 'chat', tokensCost: 0, mediaUrl: imageUrl ?? null },
            }),
            prisma.message.create({
              data: {
                chatId,
                userId,
                role: 'assistant',
                content: encrypt(response.content),
                mode: 'chat',
                provider: spec.id,
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

        // Собираем массив сообщений для ИИ.
        // Системный промпт различает «обычный» и «глубокий» тон по цене модели —
        // раньше это решал флаг mode==='think', теперь платность самой выбранной
        // модели несёт тот же сигнал (см. lib/prompts.ts: ключ 'think' даёт
        // инструкцию рассуждать пошагово и структурировать ответ).
        const promptStyleKey = spec.cost > 0 ? 'think' : 'chat';
        const systemMsg: ChatMessage = { role: 'system', content: getSystemPrompt(promptStyleKey, responseStyle, plan) };
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
          data: { chatId, userId, role: 'user', content: encrypt(userContent), mode: 'chat', tokensCost: 0, mediaUrl: imageUrl ?? null },
        });

        // Стримим от провайдера
        let fullResponse = '';
        let usedProviderModel = spec.providerModel; // уточняется ниже событием used_model — какая модель реально ответила (могла сработать резервная из fallbackModels)

        // Потолок длины ответа — защита от расходов, а не свойство конкретной модели.
        // Раньше на платных тарифах max_tokens не передавался вообще (undefined
        // выпадал из тела запроса — см. streamOpenRouter ниже), то есть ответ был
        // НИЧЕМ не ограничен: при максимуме схемы (промт 32к симв. + история 10×8к +
        // файл 65к ≈ вход под завязку) это давало намного больший расход на сообщение,
        // чем предполагает Caspers-цена модели. 4000 токенов — с большим запасом
        // хватает на развёрнутый structured-ответ в режиме "think", но ограничивает
        // аномалии сверху.
        const maxTokens = plan === 'FREE' ? 400 : 4000;

        // Cloudflare — основной путь для бесплатной модели, резерв — OpenRouter.
        // Остальные модели — сразу OpenRouter с цепочкой резервных из реестра.
        async function* buildStream() {
          if (spec.provider !== 'cloudflare') {
            yield* streamOpenRouter(messages, spec.providerModel, maxTokens, spec.fallbackModels);
            return;
          }
          try {
            yield* streamCloudflare(messages, maxTokens);
          } catch {
            const cfFallback = spec.fallbackModels?.[0] ?? 'meta-llama/llama-3.1-8b-instruct';
            fastify.log.warn(`[chat] Cloudflare down, falling back to ${cfFallback}`);
            yield* streamOpenRouter(messages, cfFallback, maxTokens);
          }
        }

        try {
          for await (const chunk of buildStream()) {
            if (chunk.type === 'token' && chunk.data) {
              fullResponse += chunk.data;
              send({ type: 'token', data: chunk.data });
            } else if (chunk.type === 'used_model') {
              usedProviderModel = chunk.model;
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
            context: `model=${spec.id} provider=${spec.provider}`,
          }).catch(() => {});

          // Возвращаем Caspers, если операция была платной
          await refundCaspers(userId, caspersSpent, spec.id).catch(() => {});

          send({ type: 'error', code: 'SERVER_ERROR', message: 'Ошибка соединения, попробуйте позже' });
          return;
        }

        // Сверка биллинга с фактически ответившей моделью: если сработал резерв
        // из fallbackModels на модель ДЕШЕВЛЕ выбранной (например, Sonar → DeepSeek —
        // пользователь оплатил веб-поиск, а его не будет), разницу возвращаем. Если
        // резерв ДОРОЖЕ (DeepSeek → Gemini Flash) — доплату не берём: пользователь
        // согласился заплатить ровно billedCost за выбранную модель, а не больше
        // без нового согласия. Для «Авто»/бесплатной Llama (billedCost = AUTO_MIN_COST
        // либо 0) сверка не находит платную модель по providerModel и не срабатывает.
        if (usedProviderModel !== spec.providerModel) {
          const actualSpec = findChatModelByProviderModel(usedProviderModel);
          if (actualSpec && actualSpec.cost < billedCost) {
            await refundCaspers(userId, billedCost - actualSpec.cost, spec.id).catch(() => {});
          }
        }

        // Кэшируем ответ (пропускаем, если есть вложение)
        if (!hasAttachment && fullResponse) {
          await setTextCached(spec.id, effectivePrompt, { content: fullResponse }, userHistoryContext, responseStyle);
          await setVectorCached(spec.id, effectivePrompt, { content: fullResponse }, userHistoryContext, responseStyle);
        }

        // Сохраняем ответ ассистента. provider хранит РЕАЛЬНО ответившую модель
        // (usedProviderModel из события used_model), а не просто выбор пользователя —
        // если сработал резерв из fallbackModels, это будет видно в данных.
        await prisma.$transaction([
          prisma.message.create({
            data: {
              chatId,
              userId,
              role: 'assistant',
              content: encrypt(fullResponse),
              mode: 'chat',
              provider: usedProviderModel,
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
          await refundCaspers(userId, caspersSpent, modelId).catch(() => {});
        }

        // Отправляем пользователю сообщение (никогда не раскрываем детали провайдера/модели)
        send({ type: 'error', code: err.code ?? 'SERVER_ERROR', message: resolveChatErrorMessage(err.code, err.message) });
      } finally {
        await releaseChatLock(userId).catch(() => {});
      }
    });
  });
}
