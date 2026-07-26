import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { notifyNewUser } from '../services/admin-notify.js';
import { PLANS } from '../services/yokassa.js';
import { FREE_WELCOME_CASPERS } from '../config/plans.js';
import { redeemCaspersPromo, PromoError } from '../services/promo.js';
import { checkBotSecret } from '../lib/bot-auth.js';
import { USAGE_COUNTERS_SELECT } from '../lib/user-select.js';

// ─── Настройка нового пользователя ────────────────────────────────────────────

async function setupTrialForNewUser(userId: string): Promise<void> {
  // Приветственный бонус — сумма из config/plans.ts (FREE_WELCOME_CASPERS),
  // единственного места, где она задаётся.
  await prisma.user.update({
    where: { id: userId },
    data: { caspers_balance: { increment: FREE_WELCOME_CASPERS } },
  });
  await prisma.casperTransaction.create({
    data: { userId, amount: FREE_WELCOME_CASPERS, reason: 'welcome_bonus' },
  }).catch(() => {});
}

// ─── Схемы ─────────────────────────────────────────────────────────────────────

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

// ─── Вспомогательные функции ──────────────────────────────────────────────────

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

// ─── Плагин ───────────────────────────────────────────────────────────────────

export default async function authRoutes(fastify: FastifyInstance) {
  // ── Авторизация через Telegram WebApp ─────────────────────────────────────
  fastify.post('/auth/telegram-webapp', async (request, reply) => {
    const { initData } = telegramWebAppSchema.parse(request.body);

    const tgUser = verifyTelegramWebApp(initData);
    const telegramId = String(tgUser.id);

    let user = await prisma.user.findUnique({ where: { telegramId } });

    const isNew = !user;
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || null,
          avatarUrl: tgUser.photo_url,
        },
      });
      await setupTrialForNewUser(user.id);
      notifyNewUser({ ...user, source: 'telegram-webapp', telegramUsername: tgUser.username }).catch(() => {});
    }

    const tokens = signTokens(fastify, user.id);
    return { ...tokens, user, isNew: isNew || !user.onboardingDone };
  });

  // ── Yandex OAuth ─────────────────────────────────────────────────────────
  fastify.get('/auth/yandex', async (request, reply) => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.YANDEX_CLIENT_ID ?? '',
      redirect_uri: `${process.env.API_URL}/api/auth/yandex/callback`,
      force_confirm: 'yes', // Всегда показывать выбор аккаунта
    });
    return reply.redirect(`https://oauth.yandex.ru/authorize?${params}`);
  });

  fastify.get('/auth/yandex/callback', async (request, reply) => {
    const { code } = yandexCallbackSchema.parse(request.query);

    // Обмениваем код на токен
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

    // Получаем данные пользователя
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
      await setupTrialForNewUser(user.id);
      notifyNewUser({ ...user, source: 'yandex' }).catch(() => {});
    } else if (!user.yandexId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { yandexId: info.id },
      });
    }

    const { accessToken, refreshToken } = signTokens(fastify, user.id, user.email ?? undefined);

    // Редиректим на фронтенд с токенами в query (фронтенд сохраняет их в httpOnly cookie через API)
    const redirectUrl = user.onboardingDone ? '/chat' : '/onboarding/name';
    return reply.redirect(
      `${process.env.FRONTEND_URL}/auth/callback/#access=${accessToken}&refresh=${refreshToken}&redirect=${encodeURIComponent(redirectUrl)}`
    );
  });

  // ── Google OAuth ──────────────────────────────────────────────────────────
  fastify.get('/auth/google', async (request, reply) => {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: `${process.env.API_URL}/api/auth/google/callback`,
      scope: 'openid email profile',
      prompt: 'select_account', // Всегда показывать выбор аккаунта
      access_type: 'offline',
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
        redirect_uri: `${process.env.API_URL}/api/auth/google/callback`,
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
      await setupTrialForNewUser(user.id);
      notifyNewUser({ ...user, source: 'google' }).catch(() => {});
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: info.id },
      });
    }

    const { accessToken, refreshToken } = signTokens(fastify, user.id, user.email ?? undefined);

    const redirectUrl = user.onboardingDone ? '/chat' : '/onboarding/name';
    return reply.redirect(
      `${process.env.FRONTEND_URL}/auth/callback/#access=${accessToken}&refresh=${refreshToken}&redirect=${encodeURIComponent(redirectUrl)}`
    );
  });

  // ── Вход через Telegram-бота (вызывается ботом с заголовком x-bot-secret) ─
  fastify.post('/auth/telegram-bot', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;

    const body = request.body as {
      id: number; first_name?: string; last_name?: string;
      username?: string | null; photo_url?: string;
    };

    const telegramId = String(body.id);
    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          name: [body.first_name, body.last_name].filter(Boolean).join(' ') || null,
          avatarUrl: body.photo_url ?? null,
        },
      });
      await setupTrialForNewUser(user.id);
      notifyNewUser({ ...user, source: 'telegram-bot', telegramUsername: body.username }).catch(() => {});
    }

    const tokens = signTokens(fastify, user.id);
    return { ...tokens, isNew: !user.onboardingDone };
  });

  // ── Бот: получить данные пользователя по Telegram ID (план, имя, баланс) ──
  fastify.get('/bot/user-info', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;
    const { tgId } = request.query as { tgId?: string };
    if (!tgId) return reply.code(400).send({ error: 'tgId required' });

    const user = await prisma.user.findFirst({
      where: { telegramId: tgId },
      select: { plan: true, name: true, caspers_balance: true },
    });

    return {
      plan: user?.plan ?? 'FREE',
      name: user?.name ?? null,
      caspers_balance: user?.caspers_balance ?? 0,
    };
  });

  // ── Бот: активировать промокод CASPERS по Telegram ID ─────────────────────
  fastify.post('/bot/promo/redeem', async (request, reply) => {
    if (!checkBotSecret(request, reply)) return;
    const { tgId, code } = request.body as { tgId?: string; code?: string };
    if (!tgId || !code) return reply.code(400).send({ error: 'tgId и code обязательны' });

    const user = await prisma.user.findFirst({ where: { telegramId: tgId } });
    if (!user) return reply.code(404).send({ error: 'Сначала войдите через /start' });

    try {
      const result = await redeemCaspersPromo(code, user.id);
      return { ok: true, casperAmount: result.casperAmount };
    } catch (err: any) {
      if (err instanceof PromoError) return reply.code(400).send({ error: err.message, code: err.code });
      throw err;
    }
  });

  // ── Проверка Telegram OAuth (вызывается фронтендом после oauth.telegram.org) ─
  fastify.post('/auth/telegram/verify', async (request, reply) => {
    const body = request.body as Record<string, string>;
    const { hash, ...fields } = body;

    if (!hash || !fields.id) return reply.code(400).send({ error: 'Missing data' });

    const checkString = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
    const secretKey = crypto.createHash('sha256').update(process.env.TELEGRAM_BOT_TOKEN ?? '').digest();
    const expectedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    if (expectedHash !== hash) return reply.code(401).send({ error: 'Invalid hash' });
    if (Date.now() / 1000 - parseInt(fields.auth_date ?? '0') > 86400) return reply.code(401).send({ error: 'Expired' });

    const telegramId = String(fields.id);
    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          name: [fields.first_name, fields.last_name].filter(Boolean).join(' ') || null,
          avatarUrl: fields.photo_url ?? null,
        },
      });
      await setupTrialForNewUser(user.id);
      notifyNewUser({ ...user, source: 'telegram-verify', telegramUsername: fields.username }).catch(() => {});
    }

    const tokens = signTokens(fastify, user.id);
    return { ...tokens, user, isNew: !user.onboardingDone };
  });

  // ── Callback виджета Telegram OAuth ───────────────────────────────────────
  // Telegram редиректит сюда с query-параметрами: id, first_name, last_name,
  // username, photo_url, auth_date, hash
  fastify.get('/auth/telegram/callback', async (request, reply) => {
    const q = request.query as Record<string, string>;

    const { hash, ...fields } = q;
    if (!hash || !fields.id) {
      return reply.redirect(`${process.env.FRONTEND_URL}/login?error=no_data`);
    }

    // Проверяем HMAC-SHA256
    const checkString = Object.keys(fields)
      .sort()
      .map((k) => `${k}=${fields[k]}`)
      .join('\n');
    const secretKey = crypto
      .createHash('sha256')
      .update(process.env.TELEGRAM_BOT_TOKEN ?? '')
      .digest();
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    if (expectedHash !== hash) {
      return reply.redirect(`${process.env.FRONTEND_URL}/login?error=invalid_hash`);
    }
    if (Date.now() / 1000 - parseInt(fields.auth_date ?? '0') > 86400) {
      return reply.redirect(`${process.env.FRONTEND_URL}/login?error=expired`);
    }

    const telegramId = String(fields.id);
    let user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId,
          name: [fields.first_name, fields.last_name].filter(Boolean).join(' ') || null,
          avatarUrl: fields.photo_url ?? null,
        },
      });
      await setupTrialForNewUser(user.id);
      notifyNewUser({ ...user, source: 'telegram-oauth', telegramUsername: fields.username }).catch(() => {});
    }

    const { accessToken, refreshToken } = signTokens(fastify, user.id);
    const redirectUrl = user.onboardingDone ? '/chat' : '/onboarding/name';
    return reply.redirect(
      `${process.env.FRONTEND_URL}/auth/callback/#access=${accessToken}&refresh=${refreshToken}&redirect=${encodeURIComponent(redirectUrl)}`
    );
  });

  // ── Обновление токена ──────────────────────────────────────────────────────
  fastify.post('/auth/refresh', async (request, reply) => {
    const body = request.body as { refreshToken?: string };
    if (!body?.refreshToken) return reply.code(400).send({ error: 'No refresh token' });

    try {
      const payload = fastify.jwt.verify<{ userId: string }>(body.refreshToken);

      const user = await prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user) throw new Error('User not found');

      const tokens = signTokens(fastify, user.id, user.email ?? undefined);
      return tokens;
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }
  });

  // ── Эндпоинты профиля (/me) ────────────────────────────────────────────────
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
          birthDate: true,
          plan: true,
          planExpiresAt: true,
          billing: true,
          ...USAGE_COUNTERS_SELECT,
          // Метки начала периодов
          day_start: true,
          week_start: true,
          month_start: true,
          period_start: true,
          // Профиль
          purposes: true,
          responseStyle: true,
          onboardingDone: true,
          createdAt: true,
        },
      });
      // Автоисправление для старых пользователей: если есть имя — значит, онбординг пройден ещё до появления этого поля
      let onboardingDone = user.onboardingDone;
      if (!onboardingDone && user.name) {
        await prisma.user.update({ where: { id: userId }, data: { onboardingDone: true } });
        onboardingDone = true;
      }
      return { ...user, onboardingDone };
    },
  });

  fastify.patch('/me', {
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user;
      const data = updateProfileSchema.parse(request.body);

      let birthDate: Date | undefined;
      if (data.birthDate) {
        birthDate = new Date(data.birthDate);
        if (isNaN(birthDate.getTime())) {
          return reply.code(400).send({ error: 'Invalid birthDate' });
        }
      }

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
    handler: async () => {
      // История транзакций токенов удалена при рефакторинге биллинга
      return { transactions: [], total: 0, page: 1, limit: 20 };
    },
  });
}

// Расширяем Fastify декоратором authenticate
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
