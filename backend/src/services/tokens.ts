import { prisma } from '../lib/prisma.js';

export type RequestType = 'message' | 'message_with_file' | 'image_generate' | 'image_edit' | 'video_generate';

const DAILY_PLANS = ['FREE', 'PRO', 'ULTRA'] as const;

export function getDailyLimit(plan: string): number {
  return ({ FREE: 10, PRO: 200, ULTRA: 400 } as Record<string, number>)[plan] ?? 0;
}

// ─── Input sanitization ───────────────────────────────────────────────────────

export function sanitizeInput(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 2000);
}

// ─── Reset daily/monthly counters if period ended ─────────────────────────────

export async function checkResets(userId: string): Promise<void> {
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, dayStart: true, periodStart: true },
  });
  if (!user) return;

  const updates: Record<string, unknown> = {};

  // Daily reset (FREE / PRO / ULTRA)
  if (DAILY_PLANS.includes(user.plan as typeof DAILY_PLANS[number])) {
    const dayEnd = new Date(user.dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    if (now >= dayEnd) {
      updates.messagesToday = 0;
      updates.dayStart = now;
    }
  }

  // Monthly reset (all plans — images/files/videos)
  const periodEnd = new Date(user.periodStart);
  periodEnd.setDate(periodEnd.getDate() + 30);
  if (now >= periodEnd) {
    updates.messagesUsed = 0;
    updates.filesUsed    = 0;
    updates.imagesUsed   = 0;
    updates.videoUsed    = 0;
    updates.periodStart  = now;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: updates });
  }
}

// ─── Check limits & deduct counters (call BEFORE API request) ─────────────────

export async function checkAndDeduct(userId: string, requestType: RequestType): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      messagesUsed: true, filesUsed: true, imagesUsed: true, videoUsed: true,
      messagesToday: true,
      messagesLimit: true, filesLimit: true, imagesLimit: true, videoLimit: true,
    },
  });
  if (!user) throw Object.assign(new Error('User not found'), { code: 'UNAUTHORIZED' });

  const isImage = requestType === 'image_generate' || requestType === 'image_edit';
  const isVideo = requestType === 'video_generate';
  const isFile  = requestType === 'message_with_file';
  const isDaily = DAILY_PLANS.includes(user.plan as typeof DAILY_PLANS[number]);

  // ── Videos ──────────────────────────────────────────────────────────────────
  if (isVideo) {
    if ((user.videoLimit ?? 0) === 0) {
      throw Object.assign(new Error('LIMIT_VIDEOS_UNAVAILABLE'), { code: 'LIMIT_VIDEOS_UNAVAILABLE' });
    }
    if (user.videoUsed >= (user.videoLimit ?? 0)) {
      throw Object.assign(new Error('LIMIT_VIDEOS'), { code: 'LIMIT_VIDEOS' });
    }
    await prisma.user.update({ where: { id: userId }, data: { videoUsed: { increment: 1 } } });
    return;
  }

  // ── Images ──────────────────────────────────────────────────────────────────
  if (isImage) {
    if (user.imagesUsed >= user.imagesLimit) {
      throw Object.assign(new Error('LIMIT_IMAGES'), { code: 'LIMIT_IMAGES' });
    }
    await prisma.user.update({ where: { id: userId }, data: { imagesUsed: { increment: 1 } } });
    return;
  }

  // ── Check message limit ──────────────────────────────────────────────────────
  if (isDaily) {
    const dailyLimit = getDailyLimit(user.plan);
    if (user.messagesToday >= dailyLimit) {
      throw Object.assign(new Error('LIMIT_MESSAGES_DAILY'), { code: 'LIMIT_MESSAGES_DAILY' });
    }
  } else {
    if (user.messagesUsed >= user.messagesLimit) {
      throw Object.assign(new Error('LIMIT_MESSAGES'), { code: 'LIMIT_MESSAGES' });
    }
  }

  // ── Check file limit ─────────────────────────────────────────────────────────
  if (isFile) {
    if (user.filesUsed >= user.filesLimit) {
      throw Object.assign(new Error('LIMIT_FILES'), { code: 'LIMIT_FILES' });
    }
  }

  // ── Deduct ───────────────────────────────────────────────────────────────────
  const updates: Record<string, unknown> = {};
  if (isDaily) updates.messagesToday = { increment: 1 };
  else         updates.messagesUsed  = { increment: 1 };
  if (isFile)  updates.filesUsed     = { increment: 1 };

  await prisma.user.update({ where: { id: userId }, data: updates });
}

// ─── Refund on API error ──────────────────────────────────────────────────────

export async function refundCounter(userId: string, requestType: RequestType): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!user) return;

    const isImage = requestType === 'image_generate' || requestType === 'image_edit';
    const isVideo = requestType === 'video_generate';
    const isFile  = requestType === 'message_with_file';
    const isDaily = DAILY_PLANS.includes(user.plan as typeof DAILY_PLANS[number]);

    const updates: Record<string, unknown> = {};
    if (isVideo) {
      updates.videoUsed = { decrement: 1 };
    } else if (isImage) {
      updates.imagesUsed = { decrement: 1 };
    } else {
      if (isDaily) updates.messagesToday = { decrement: 1 };
      else         updates.messagesUsed  = { decrement: 1 };
      if (isFile)  updates.filesUsed     = { decrement: 1 };
    }
    await prisma.user.update({ where: { id: userId }, data: updates });
  } catch {
    // Refund is best-effort
  }
}

// ─── Apply plan limits (call on subscription webhook) ────────────────────────

export interface PlanLimits {
  messagesLimit: number;
  filesLimit:    number;
  imagesLimit:   number;
  videoLimit:    number;
}

export async function applyPlanLimits(userId: string, limits: PlanLimits, planName: string): Promise<void> {
  const now = new Date();
  const isDaily = DAILY_PLANS.includes(planName as typeof DAILY_PLANS[number]);
  await prisma.user.update({
    where: { id: userId },
    data: {
      messagesLimit: limits.messagesLimit,
      filesLimit:    limits.filesLimit,
      imagesLimit:   limits.imagesLimit,
      videoLimit:    limits.videoLimit,
      // Reset counters on plan change
      messagesUsed:  0,
      filesUsed:     0,
      imagesUsed:    0,
      videoUsed:     0,
      periodStart:   now,
      ...(isDaily ? { messagesToday: 0, dayStart: now } : {}),
    },
  });
}
