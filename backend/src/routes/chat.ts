import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { route } from '../services/ai-router.js';
import { getCached, setCached } from '../services/cache.js';
import { chargeTokens } from '../services/tokens.js';
import { streamGemini } from '../services/providers/gemini.js';
import { streamOpenAI } from '../services/providers/openai.js';
import { streamClaude } from '../services/providers/anthropic.js';
import type { SocketStream } from '@fastify/websocket';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createChatSchema = z.object({
  title: z.string().max(100).optional(),
  mode: z.enum(['chat', 'vision', 'sound', 'reel', 'think']).default('chat'),
});

const wsMessageSchema = z.object({
  chatId: z.string(),
  mode: z.enum(['chat', 'think']),
  prompt: z.string().min(1).max(32000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).default([]),
});

// ─── Provider stream factory ──────────────────────────────────────────────────

function getProviderStream(
  provider: string,
  messages: Array<{ role: string; content: string }>
) {
  switch (provider) {
    case 'gemini-flash':
      return streamGemini(messages, 'gemini-1.5-flash');
    case 'gpt4o-mini':
      return streamOpenAI(messages, 'gpt-4o-mini');
    case 'gpt4o':
      return streamOpenAI(messages, 'gpt-4o');
    case 'claude-sonnet':
    default:
      return streamClaude(messages);
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default async function chatRoutes(fastify: FastifyInstance) {
  // ── List chats ────────────────────────────────────────────────────────────
  fastify.get('/chats', {
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      const { userId } = request.user;
      const chats = await prisma.chat.findMany({
        where: { userId },
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

      return { messages };
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

      const { chatId, mode, prompt, history } = parsed;

      try {
        // Verify chat ownership
        const chat = await prisma.chat.findFirst({ where: { id: chatId, userId } });
        if (!chat) {
          send({ type: 'error', code: 'CHAT_NOT_FOUND' });
          return;
        }

        // Route request
        const { provider, complexity } = route(prompt, fastify.log);

        // Check cache
        const cached = await getCached(mode, complexity, prompt);

        if (cached.hit) {
          const response = cached.response as { content: string };

          // Charge tokens even on cache hit (our margin)
          const tokensCost = await chargeTokens(userId, mode, complexity);

          // Save messages
          await prisma.$transaction([
            prisma.message.create({
              data: { chatId, userId, role: 'user', content: prompt, mode, tokensCost: 0 },
            }),
            prisma.message.create({
              data: {
                chatId,
                userId,
                role: 'assistant',
                content: response.content,
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
        const messages = [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: 'user', content: prompt },
        ];

        // Charge tokens
        const tokensCost = await chargeTokens(userId, mode, complexity);

        // Save user message
        await prisma.message.create({
          data: { chatId, userId, role: 'user', content: prompt, mode, tokensCost: 0 },
        });

        // Stream from provider
        let fullResponse = '';
        const stream = getProviderStream(provider, messages);

        for await (const chunk of stream) {
          if (chunk.type === 'token' && chunk.data) {
            fullResponse += chunk.data;
            send({ type: 'token', data: chunk.data });
          }
        }

        // Cache the response
        await setCached(mode, complexity, prompt, { content: fullResponse });

        // Save assistant message
        await prisma.$transaction([
          prisma.message.create({
            data: {
              chatId,
              userId,
              role: 'assistant',
              content: fullResponse,
              mode,
              complexity,
              provider,
              cacheHit: false,
              tokensCost,
            },
          }),
          prisma.chat.update({ where: { id: chatId }, data: { updatedAt: new Date() } }),
        ]);

        send({ type: 'done', tokensCost, cacheHit: false });

        // Auto-generate title if first message
        const messageCount = await prisma.message.count({ where: { chatId } });
        if (messageCount <= 2 && chat.title === 'Новый чат') {
          const title = prompt.slice(0, 35) + (prompt.length > 35 ? '...' : '');
          await prisma.chat.update({ where: { id: chatId }, data: { title } });
        }
      } catch (err: any) {
        fastify.log.error(err, '[WS] Error processing message');
        send({ type: 'error', code: err.code ?? 'SERVER_ERROR', message: err.message });
      }
    });
  });
}
