import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import fs from 'node:fs';
import path from 'node:path';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';

import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { authenticate } from './middleware/auth.js';
import { initVectorCache } from './services/vector-cache.js';
import { setupProxy } from './lib/proxy.js';

import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import uploadRoutes from './routes/upload.js';
import paymentRoutes from './routes/payments.js';
import generateRoutes from './routes/generate.js';
import supportRoutes from './routes/support.js';
import adminRoutes from './routes/admin.js';

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
    'https://miniapp.ghostlineai.ru',
  ].filter(Boolean));

  // Auto-add www. variants so both ghostlineai.ru and www.ghostlineai.ru are always accepted.
  // Skip localhost / 127.0.0.1 — www.localhost is not a valid origin.
  const extraOrigins: string[] = [];
  for (const o of corsOrigins) {
    const isLocal = o.includes('localhost') || o.includes('127.0.0.1');
    if (isLocal) continue;
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

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET env var is required — server refuses to start with a weak default');
  await fastify.register(jwt, { secret: jwtSecret });

  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
    skipOnError: true,
    // Use real client IP from nginx X-Real-IP header.
    // Without this, all users appear as the Docker bridge IP (172.18.0.x)
    // and share one rate-limit bucket, causing innocent users to get 429.
    keyGenerator: (req) =>
      (process.env.TRUST_PROXY === 'true' ? (req.headers['x-real-ip'] as string) : undefined) || req.ip,
    errorResponseBuilder: (_req, context) => ({
      error: `Слишком много запросов — повторите через ${context.after}`,
      code: 'RATE_LIMITED',
    }),
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

  // ── Stricter rate limit for auth endpoints (20 req/min per IP) ───────────
  await fastify.register(async (authScope) => {
    await authScope.register(rateLimit, {
      max: 20,
      timeWindow: '1 minute',
      skipOnError: true,
      keyGenerator: (req) =>
        (process.env.TRUST_PROXY === 'true' ? (req.headers['x-real-ip'] as string) : undefined) || req.ip,
      errorResponseBuilder: (_req, context) => ({
        error: `Слишком много запросов — повторите через ${context.after}`,
        code: 'RATE_LIMITED',
      }),
    });
    await authScope.register(authRoutes, { prefix: '/api' });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  await fastify.register(chatRoutes, { prefix: '/api' });
  await fastify.register(uploadRoutes, { prefix: '/api' });
  await fastify.register(paymentRoutes, { prefix: '/api' });
  await fastify.register(generateRoutes, { prefix: '/api' });
  await fastify.register(supportRoutes, { prefix: '/api' });
  await fastify.register(adminRoutes,   { prefix: '/api' });

  // ── Static image serving (generated images saved to disk) ────────────────
  fastify.get('/images/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    // Prevent path traversal
    if (filename.includes('/') || filename.includes('..')) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }
    const filepath = path.join(process.cwd(), 'uploads', 'images', filename);
    if (!fs.existsSync(filepath)) return reply.code(404).send({ error: 'Not found' });
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    reply.header('Content-Type', mime);
    reply.header('Cache-Control', 'public, max-age=31536000');
    // Allow cross-origin embedding (Helmet defaults to same-origin which blocks <img> from frontend domain)
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    return reply.send(fs.createReadStream(filepath));
  });

  // ── Static video serving (generated videos saved to disk) ─────────────────
  // Supports HTTP Range requests so <video> seeking works on mobile/Telegram.
  fastify.get('/videos/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    if (filename.includes('/') || filename.includes('..')) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }
    const filepath = path.join(process.cwd(), 'uploads', 'videos', filename);
    if (!fs.existsSync(filepath)) return reply.code(404).send({ error: 'Not found' });

    const stat = fs.statSync(filepath);
    const total = stat.size;
    const rangeHeader = (request.headers as Record<string, string>).range;

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', 'video/mp4');
    reply.header('Cache-Control', 'public, max-age=31536000');
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');

    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : total - 1;
      const chunkSize = end - start + 1;
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${total}`);
      reply.header('Content-Length', String(chunkSize));
      return reply.send(fs.createReadStream(filepath, { start, end }));
    }

    reply.header('Content-Length', String(total));
    return reply.send(fs.createReadStream(filepath));
  });

  // ── Static audio serving (generated tracks saved to disk) ────────────────
  fastify.get('/audio/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    if (filename.includes('/') || filename.includes('..')) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }
    const filepath = path.join(process.cwd(), 'uploads', 'audio', filename);
    if (!fs.existsSync(filepath)) return reply.code(404).send({ error: 'Not found' });

    const stat = fs.statSync(filepath);
    const ext = filename.split('.').pop()?.toLowerCase() ?? 'mp3';
    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
      flac: 'audio/flac', m4a: 'audio/mp4',
    };

    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', mimeMap[ext] ?? 'audio/mpeg');
    reply.header('Cache-Control', 'public, max-age=31536000');
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    reply.header('Content-Length', String(stat.size));
    return reply.send(fs.createReadStream(filepath));
  });

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
  // Set up outbound proxy FIRST — before any HTTP calls to AI APIs
  setupProxy();

  const fastify = await buildApp();

  // Connect to DB and Redis
  await prisma.$connect();
  await redis.connect();

  // Бэкфилл music_daily_limit для существующих пользователей (один раз при деплое)
  await prisma.$executeRaw`
    UPDATE "User" SET "music_daily_limit" = CASE
      WHEN plan = 'TRIAL'    THEN 1
      WHEN plan = 'BASIC'    THEN 2
      WHEN plan = 'STANDARD' THEN 5
      WHEN plan = 'PRO'      THEN 10
      WHEN plan = 'ULTRA'    THEN 20
      WHEN plan = 'TEAM'     THEN 20
      ELSE 0
    END
    WHERE "music_daily_limit" = 0 AND plan != 'FREE'
  `;

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
