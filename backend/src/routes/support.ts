import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

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
  // POST /api/support/message  — works for both authenticated and anonymous users
  fastify.post('/support/message', async (request, reply) => {
    const body = bodySchema.parse(request.body);

    let userName  = 'Гость';
    let userEmail = body.email ?? 'не указан';
    let userPlan  = '—';
    let userId    = '—';
    let usage     = '';

    // Optional authentication
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
          std_messages_today:       true,
          pro_messages_today:       true,
          images_today:             true,
          videos_today:             true,
          std_messages_daily_limit: true,
          pro_messages_daily_limit: true,
          images_daily_limit:       true,
          videos_daily_limit:       true,
        },
      });
      if (user) {
        userId    = user.id;
        userName  = user.name ?? 'без имени';
        userEmail = user.email ?? userEmail;
        userPlan  = user.plan;
        usage = [
          `💬 Сообщения: ${user.std_messages_today}/${user.std_messages_daily_limit === -1 ? '∞' : user.std_messages_daily_limit}`,
          user.pro_messages_daily_limit > 0
            ? `⚡ Про: ${user.pro_messages_today}/${user.pro_messages_daily_limit}`
            : '',
          `🖼 Картинки: ${user.images_today}/${user.images_daily_limit}`,
          user.videos_daily_limit > 0
            ? `🎬 Видео: ${user.videos_today}/${user.videos_daily_limit}`
            : '',
        ].filter(Boolean).join('\n');
      }
    } catch {
      // anonymous — use email from body
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
