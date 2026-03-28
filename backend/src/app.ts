import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';

import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { authenticate } from './middleware/auth.js';
import { initVectorCache } from './services/vector-cache.js';

import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import uploadRoutes from './routes/upload.js';
import paymentRoutes from './routes/payments.js';
import generateRoutes from './routes/generate.js';

import { startVisionWorker } from './workers/vision.worker.js';
import { startSoundWorker } from './workers/sound.worker.js';
import { startReelWorker } from './workers/reel.worker.js';
import { startCleanupWorker } from './services/cleanup.js';

// ─── Build app ────────────────────────────────────────────────────────────────

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  });

  // ── Plugins ───────────────────────────────────────────────────────────────
  await fastify.register(helmet, { global: true });

  // Support comma-separated CORS_ORIGINS env var, e.g.:
  // "https://ghostlineai.ru,https://www.ghostlineai.ru,https://t.me"
  const corsOrigins: Set<string> = new Set([
    ...(process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    process.env.FRONTEND_URL ?? 'http://localhost:3000',
    process.env.MINIAPP_URL ?? 'http://localhost:3001',
    // Production domains — always allowed regardless of env vars
    'https://ghostlineai.ru',
    'https://www.ghostlineai.ru',
  ].filter(Boolean));

  // Auto-add www. variants so both ghostlineai.ru and www.ghostlineai.ru are always accepted
  const extraOrigins: string[] = [];
  for (const o of corsOrigins) {
    if (o.includes('://www.')) extraOrigins.push(o.replace('://www.', '://'));
    else extraOrigins.push(o.replace('://', '://www.'));
  }
  extraOrigins.forEach((o) => corsOrigins.add(o));

  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, bot callbacks)
      if (!origin) { cb(null, true); return; }
      if (corsOrigins.has(origin)) { cb(null, true); return; }
      cb(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await fastify.register(cookie);

  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    skipOnError: true,
  });

  await fastify.register(websocket, {
    options: { maxPayload: 4194304 }, // 4MB — allows images as base64
  });

  // Multipart (file upload for document extraction)
  await fastify.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max file
  });

  // ── Decorators ────────────────────────────────────────────────────────────
  fastify.decorate('authenticate', authenticate);

  // ── Routes ────────────────────────────────────────────────────────────────
  await fastify.register(authRoutes, { prefix: '/api' });
  await fastify.register(chatRoutes, { prefix: '/api' });
  await fastify.register(uploadRoutes, { prefix: '/api' });
  await fastify.register(paymentRoutes, { prefix: '/api' });
  await fastify.register(generateRoutes, { prefix: '/api' });

  // ── Health check ──────────────────────────────────────────────────────────
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // ── Global error handler ──────────────────────────────────────────────────
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);

    if (error.name === 'ZodError') {
      return reply.code(400).send({
        error: 'Validation error',
        details: error.message,
      });
    }

    if (error.statusCode) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    // Custom application error codes (thrown without statusCode)
    const codeToStatus: Record<string, number> = {
      LIMIT_MESSAGES: 402,
      LIMIT_IMAGES: 402,
      UNAUTHORIZED: 401,
    };
    const code = (error as any).code as string | undefined;
    if (code && codeToStatus[code]) {
      return reply.code(codeToStatus[code]).send({ error: error.message, code });
    }

    return reply.code(500).send({ error: 'Internal server error' });
  });

  return fastify;
}

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  const fastify = await buildApp();

  // Connect to DB and Redis
  await prisma.$connect();
  await redis.connect();

  // Initialize optional vector cache (requires pgvector + EMBEDDING_API_KEY)
  await initVectorCache();

  // Start BullMQ workers
  startVisionWorker();
  startSoundWorker();
  startReelWorker();

  // Start TTL auto-cleanup (runs daily)
  startCleanupWorker();

  // Listen
  const port = parseInt(process.env.PORT ?? '4000');
  const host = process.env.HOST ?? '0.0.0.0';

  await fastify.listen({ port, host });
  fastify.log.info(`GhostLine backend running on http://${host}:${port}`);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  await redis.disconnect();
  process.exit(0);
});

start().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
