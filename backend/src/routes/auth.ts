import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const telegramWebAppSchema = z.object({
  initData: z.string(),
});

const yandexCallbackSchema = z.object({
  code: z.string(),
});

const googleCallbackSchema = z.object({
  code: z.string(),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  birthDate: z.string().optional(),
  purposes: z.array(z.string()).optional(),
  responseStyle: z.string().optional(),
  onboardingDone: z.boolean().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signTokens(fastify: FastifyInstance, userId: string, email?: string) {
  const accessToken = fastify.jwt.sign(
    { userId, email },
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '15m' }
  );
  const refreshToken = fastify.jwt.sign(
    { userId, email } as { userId: string; email?: string },
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d' }
  );
  return { accessToken, refreshToken };
}

function verifyTelegramWebApp(initData: string): {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
} {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(process.env.TELEGRAM_BOT_TOKEN ?? '')
    .digest();

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (expectedHash !== hash) {
    throw new Error('Invalid Telegram auth');
  }

  const authDate = parseInt(params.get('auth_date') ?? '0');
  if (Date.now() / 1000 - authDate > 86400) {
    throw new Error('Telegram auth expired');
  }

  return JSON.parse(params.get('user') ?? '{}');
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default async function authRoutes(fastify: FastifyInstance) {
  // ── Telegram WebApp auth ──────────────────────────────────────────────────
  fastify.post('/auth/telegram-webapp', async (request, reply) => {
    const { initData } = telegramWebAppSchema.parse(request.body);

    const tgUser = verifyTelegramWebApp(initData);
    const telegramId = String(tgUser.id);

    let user = await prisma.user.findUnique({ where: { telegramId } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          name: tgUser.first_name,
          avatarUrl: tgUser.photo_url,
        },
      });
    }

    const tokens = signTokens(fastify, user.id);
    return { ...tokens, user, isNew: !user.onboardingDone };
  });

  // ── Yandex OAuth ─────────────────────────────────────────────────────────
  fastify.get('/auth/yandex', async (request, reply) => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.YANDEX_CLIENT_ID ?? '',
      redirect_uri: `${process.env.FRONTEND_URL}/api/auth/yandex/callback`,
    });
    return reply.redirect(`https://oauth.yandex.ru/authorize?${params}`);
  });

  fastify.get('/auth/yandex/callback', async (request, reply) => {
    const { code } = yandexCallbackSchema.parse(request.query);

    // Exchange code for token
    const tokenRes = await fetch('https://oauth.yandex.ru/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.YANDEX_CLIENT_ID ?? '',
        client_secret: process.env.YANDEX_CLIENT_SECRET ?? '',
      }),
    });

    const tokenData = (await tokenRes.json()) as { access_token: string };

    // Get user info
    const infoRes = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${tokenData.access_token}` },
    });

    const info = (await infoRes.json()) as {
      id: string;
      login: string;
      default_email?: string;
      real_name?: string;
      default_avatar_id?: string;
    };

    let user = await prisma.user.findFirst({
      where: { OR: [{ yandexId: info.id }, { email: info.default_email }] },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          yandexId: info.id,
          email: info.default_email,
          name: info.real_name,
          avatarUrl: info.default_avatar_id
            ? `https://avatars.yandex.net/get-yapic/${info.default_avatar_id}/islands-200`
            : undefined,
        },
      });
    } else if (!user.yandexId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { yandexId: info.id },
      });
    }

    const { accessToken, refreshToken } = signTokens(fastify, user.id, user.email ?? undefined);

    // Redirect to frontend with tokens in query (frontend stores in httpOnly cookie via API)
    const redirectUrl = user.onboardingDone ? '/chat' : '/onboarding/name';
    return reply.redirect(
      `${process.env.FRONTEND_URL}/auth/callback?access=${accessToken}&refresh=${refreshToken}&redirect=${redirectUrl}`
    );
  });

  // ── Google OAuth ──────────────────────────────────────────────────────────
  fastify.get('/auth/google', async (request, reply) => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: `${process.env.FRONTEND_URL}/api/auth/google/callback`,
      scope: 'openid email profile',
    });
    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  fastify.get('/auth/google/callback', async (request, reply) => {
    const { code } = googleCallbackSchema.parse(request.query);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.FRONTEND_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = (await tokenRes.json()) as { id_token: string; access_token: string };

    const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const info = (await infoRes.json()) as {
      id: string;
      email: string;
      name: string;
      picture: string;
    };

    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: info.id }, { email: info.email }] },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: info.id,
          email: info.email,
          name: info.name,
          avatarUrl: info.picture,
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: info.id },
      });
    }

    const { accessToken, refreshToken } = signTokens(fastify, user.id, user.email ?? undefined);

    const redirectUrl = user.onboardingDone ? '/chat' : '/onboarding/name';
    return reply.redirect(
      `${process.env.FRONTEND_URL}/auth/callback?access=${accessToken}&refresh=${refreshToken}&redirect=${redirectUrl}`
    );
  });

  // ── Refresh token ─────────────────────────────────────────────────────────
  fastify.post('/auth/refresh', async (request, reply) => {
    const body = request.body as { refreshToken?: string };
    if (!body?.refreshToken) return reply.code(400).send({ error: 'No refresh token' });

    try {
      const payload = fastify.jwt.verify<{ userId: string; type?: string }>(body.refreshToken);
      if (payload.type !== 'refresh') throw new Error('Not a refresh token');

      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user) throw new Error('User not found');

      const tokens = signTokens(fastify, user.id, user.email ?? undefined);
      return tokens;
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }
  });

  // ── Me endpoints ──────────────────────────────────────────────────────────
  fastify.get('/me', {
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      const { userId } = request.user;
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          tokenBalance: true,
          plan: true,
          planExpiresAt: true,
          purposes: true,
          responseStyle: true,
          onboardingDone: true,
          createdAt: true,
        },
      });
      return user;
    },
  });

  fastify.patch('/me', {
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      const { userId } = request.user;
      const data = updateProfileSchema.parse(request.body);

      const birthDate = data.birthDate ? new Date(data.birthDate) : undefined;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(data.name && { name: data.name }),
          ...(birthDate && { birthDate }),
          ...(data.purposes && { purposes: data.purposes }),
          ...(data.responseStyle && { responseStyle: data.responseStyle }),
          ...(data.onboardingDone !== undefined && { onboardingDone: data.onboardingDone }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          tokenBalance: true,
          plan: true,
          onboardingDone: true,
          purposes: true,
          responseStyle: true,
        },
      });

      return user;
    },
  });

  fastify.get('/me/transactions', {
    preHandler: [fastify.authenticate],
    handler: async (request) => {
      const { userId } = request.user;
      const query = request.query as { page?: string; limit?: string };
      const page = parseInt(query.page ?? '1');
      const limit = Math.min(parseInt(query.limit ?? '20'), 50);

      const [transactions, total] = await prisma.$transaction([
        prisma.tokenTransaction.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.tokenTransaction.count({ where: { userId } }),
      ]);

      return { transactions, total, page, limit };
    },
  });
}

// Extend Fastify with authenticate decorator
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
