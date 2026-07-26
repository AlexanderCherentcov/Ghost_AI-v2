import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { FREE_LIMITS } from '../config/plans.js';
import { USAGE_COUNTERS_SELECT } from '../lib/user-select.js';

const SUPPORT_BOT_TOKEN = process.env.SUPPORT_BOT_TOKEN ?? '';
const SUPPORT_GROUP_ID  = process.env.SUPPORT_GROUP_ID ?? '';

const bodySchema = z.object({
  message: z.string().min(5).max(2000),
  email:   z.string().email().optional(),
});

async function sendToTelegram(text: string) {
  if (!SUPPORT_BOT_TOKEN || !SUPPORT_GROUP_ID) return;
  await fetch(`https://api.telegram.org/bot${SUPPORT_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id:    SUPPORT_GROUP_ID,
      text,
      parse_mode: 'HTML',
    }),
  });
}

const supportRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/support/message — работает и для авторизованных, и для анонимных пользователей
  fastify.post('/support/message', async (request, reply) => {
    const body = bodySchema.parse(request.body);

    let userName  = 'Гость';
    let userEmail = body.email ?? 'не указан';
    let userPlan  = '—';
    let userId    = '—';
    let usage     = '';

    // Опциональная авторизация
    try {
      await request.jwtVerify();
      const sub = (request.user as unknown as { userId: string }).userId;
      const user = await prisma.user.findUnique({
        where: { id: sub },
        select: {
          id: true,
          name: true,
          email: true,
          plan: true,
          ...USAGE_COUNTERS_SELECT,
        },
      });
      if (user) {
        userId    = user.id;
        userName  = user.name ?? 'без имени';
        userEmail = user.email ?? userEmail;
        userPlan  = user.plan;
        usage = [
          `💬 Сообщения сегодня: ${user.std_messages_today}`,
          user.pro_messages_today > 0
            ? `⚡ Про сегодня: ${user.pro_messages_today}`
            : '',
          `Caspers: ${user.caspers_balance}/${user.caspers_monthly}/мес`,
          user.plan === 'FREE' ? `🖼 Картинки/нед: ${user.images_this_week}/${FREE_LIMITS.images_weekly}` : '',
          user.plan === 'FREE' ? `🎬 Видео/мес: ${user.videos_this_month}/${FREE_LIMITS.videos_monthly}` : '',
        ].filter(Boolean).join('\n');
      }
    } catch {
      // анонимный пользователь — используем email из тела запроса
    }

    const text =
      `📩 <b>Обращение в поддержку GhostLine</b>\n\n` +
      `👤 <b>Пользователь:</b> ${userName}\n` +
      `📧 <b>Email:</b> ${userEmail}\n` +
      `💎 <b>Тариф:</b> ${userPlan}\n` +
      `🆔 <b>ID:</b> <code>${userId}</code>\n` +
      (usage ? `\n📊 <b>Использование сегодня:</b>\n${usage}\n` : '') +
      `\n💬 <b>Сообщение:</b>\n${body.message}`;

    await sendToTelegram(text);

    return reply.send({ ok: true });
  });
};

export default supportRoutes;
