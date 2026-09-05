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
import promoRoutes from './routes/promo.js';
import supportRoutes from './routes/support.js';
import galleryRoutes from './routes/gallery.js';
import adminRoutes from './routes/admin.js';
import plansRoutes from './routes/plans.js';
import dispatchRoutes from './routes/dispatch.js';
import maintenanceRoutes from './routes/maintenance.js';

import { startVisionWorker } from './workers/vision.worker.js';
import { startSoundWorker } from './workers/sound.worker.js';
import { startReelWorker } from './workers/reel.worker.js';
import { startCleanupWorker } from './services/cleanup.js';

// ─── Сборка приложения ──────────────────────────────────────────────────────

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

  // ── Плагины ───────────────────────────────────────────────────────────────
  await fastify.register(helmet, { global: true });

  // Поддержка CORS_ORIGINS через запятую, например:
  // "https://ghostlineai.ru,https://www.ghostlineai.ru,https://t.me"
  const corsOrigins: Set<string> = new Set([
    ...(process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    process.env.FRONTEND_URL ?? 'http://localhost:3000',
    // Продовые домены — разрешены всегда, независимо от env-переменных
    'https://ghostlineai.ru',
    'https://www.ghostlineai.ru',
  ].filter(Boolean));

  // Автоматически добавляем www.-варианты, чтобы принимались и ghostlineai.ru, и www.ghostlineai.ru.
  // localhost / 127.0.0.1 пропускаем — www.localhost не валидный origin.
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
      // Разрешаем запросы без origin (мобильные приложения, коллбэки бота)
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
    // Берём реальный IP клиента из заголовка nginx X-Real-IP.
    // Без этого все пользователи выглядят как IP моста Docker (172.18.0.x)
    // и делят один rate-limit-бакет — из-за чего невиновным пользователям прилетает 429.
    keyGenerator: (req) =>
      (process.env.TRUST_PROXY === 'true' ? (req.headers['x-real-ip'] as string) : undefined) || req.ip,
    errorResponseBuilder: (_req, context) => ({
      error: `Слишком много запросов — повторите через ${context.after}`,
      code: 'RATE_LIMITED',
    }),
  });

  await fastify.register(websocket, {
    options: { maxPayload: 4194304 }, // 4MB — достаточно для изображений в base64
  });

  // Multipart (загрузка файлов для извлечения текста из документов)
  await fastify.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024 }, // максимум 20 МБ на файл
  });

  // ── Декораторы ────────────────────────────────────────────────────────────
  fastify.decorate('authenticate', authenticate);

  // ── Более строгий rate limit для auth-эндпоинтов (20 запросов/мин на IP) ──
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

  // ── Роуты ─────────────────────────────────────────────────────────────────
  await fastify.register(chatRoutes, { prefix: '/api' });
  await fastify.register(uploadRoutes, { prefix: '/api' });
  await fastify.register(paymentRoutes, { prefix: '/api' });
  await fastify.register(generateRoutes, { prefix: '/api' });
  await fastify.register(promoRoutes, { prefix: '/api' });
  await fastify.register(supportRoutes, { prefix: '/api' });
  await fastify.register(galleryRoutes, { prefix: '/api' });
  await fastify.register(adminRoutes,   { prefix: '/api' });
  await fastify.register(plansRoutes,    { prefix: '/api' });
  await fastify.register(dispatchRoutes, { prefix: '/api' });
  await fastify.register(maintenanceRoutes, { prefix: '/api' });

  // ── Раздача изображений (сгенерированные картинки, сохранённые на диск) ──
  fastify.get('/images/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    // Защита от path traversal
    if (filename.includes('/') || filename.includes('..')) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }
    const filepath = path.join(process.cwd(), 'uploads', 'images', filename);
    if (!fs.existsSync(filepath)) return reply.code(404).send({ error: 'Not found' });
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    reply.header('Content-Type', mime);
    reply.header('Cache-Control', 'public, max-age=31536000');
    // Разрешаем кросс-доменную вставку (Helmet по умолчанию ставит same-origin, что блокирует <img> с домена фронтенда)
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    // Content-Length — без него ответ уходит chunked, а Telegram при sendPhoto
    // по URL (бот отправляет результат генерации именно этой ссылкой) может
    // упасть с "failed to get HTTP url content" на chunked-ответах.
    reply.header('Content-Length', String(fs.statSync(filepath).size));
    return reply.send(fs.createReadStream(filepath));
  });

  // ── Раздача видео (сгенерированные ролики, сохранённые на диск) ──────────
  // Поддерживает HTTP Range-запросы, чтобы перемотка <video> работала на мобильных и в Telegram.
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

  // ── Раздача галереи (копии картинок/видео, опубликованных в GalleryItem) ──
  // Отдельная папка от /images и /videos (см. GalleryItem в schema.prisma) —
  // содержит и картинки, и видео вперемешку, поэтому тип отдаём по расширению,
  // с той же поддержкой Range для видео, что и в /videos выше.
  fastify.get('/gallery-media/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string };
    if (filename.includes('/') || filename.includes('..')) {
      return reply.code(400).send({ error: 'Invalid filename' });
    }
    const filepath = path.join(process.cwd(), 'uploads', 'gallery', filename);
    if (!fs.existsSync(filepath)) return reply.code(404).send({ error: 'Not found' });

    const ext = path.extname(filename).toLowerCase();
    const isVideo = ext === '.mp4';
    reply.header('Cache-Control', 'public, max-age=31536000');
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');

    if (!isVideo) {
      // Content-Length обязателен: без него ответ уходит как Transfer-Encoding:
      // chunked, а Telegram при sendPhoto/sendVideo по URL умеет падать с
      // "failed to get HTTP url content" именно на chunked-ответах без длины.
      reply.header('Content-Type', ext === '.png' ? 'image/png' : 'image/jpeg');
      reply.header('Content-Length', String(fs.statSync(filepath).size));
      return reply.send(fs.createReadStream(filepath));
    }

    const stat = fs.statSync(filepath);
    const total = stat.size;
    const rangeHeader = (request.headers as Record<string, string>).range;
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Type', 'video/mp4');
    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : total - 1;
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${total}`);
      reply.header('Content-Length', String(end - start + 1));
      return reply.send(fs.createReadStream(filepath, { start, end }));
    }
    reply.header('Content-Length', String(total));
    return reply.send(fs.createReadStream(filepath));
  });

  // ── Раздача аудио (сгенерированные треки, сохранённые на диск) ───────────
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

  // ── Глобальный обработчик ошибок ──────────────────────────────────────────
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

    // Собственные коды ошибок приложения (выбрасываются без statusCode)
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

// ─── Запуск ───────────────────────────────────────────────────────────────────

async function start() {
  // Настраиваем исходящий прокси ПЕРВЫМ — до любых HTTP-вызовов к AI API
  setupProxy();

  const fastify = await buildApp();

  // Подключаемся к БД и Redis
  await prisma.$connect();
  await redis.connect();

  // Обратный бэкфилл не нужен — миграция на систему Caspers сделана SQL-миграцией

  // Инициализируем опциональный векторный кэш (нужны pgvector + EMBEDDING_API_KEY)
  await initVectorCache();

  // Запускаем воркеры BullMQ
  startVisionWorker();
  startSoundWorker();
  startReelWorker();

  // Запускаем автоочистку по TTL (раз в день)
  startCleanupWorker();

  // Слушаем порт
  const port = parseInt(process.env.PORT ?? '4000');
  const host = process.env.HOST ?? '0.0.0.0';

  await fastify.listen({ port, host });
  fastify.log.info(`GhostLine backend running on http://${host}:${port}`);
}

// Плавное завершение работы
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  await redis.disconnect();
  process.exit(0);
});

start().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
