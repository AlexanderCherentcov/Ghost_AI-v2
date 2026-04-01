import { prisma } from '../lib/prisma.js';

export type RequestType =
  | 'chat_std'
  | 'chat_pro'
  | 'image_generate'
  | 'image_edit'
  | 'video_generate';

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
    select: { day_start: true, period_start: true },
  });
  if (!user) return;

  const updates: Record<string, unknown> = {};

  // Daily reset
  const dayEnd = new Date(user.day_start);
  dayEnd.setDate(dayEnd.getDate() + 1);
  if (now >= dayEnd) {
    updates.std_messages_today = 0;
    updates.pro_messages_today = 0;
    updates.images_today       = 0;
    updates.videos_today       = 0;
    updates.day_start          = now;
  }

  // Monthly reset (files only)
  const periodEnd = new Date(user.period_start);
  periodEnd.setDate(periodEnd.getDate() + 30);
  if (now >= periodEnd) {
    updates.files_used    = 0;
    updates.period_start  = now;
  }

  if (Object.keys(updates).length > 0) {
    await prisma.user.update({ where: { id: userId }, data: updates });
  }
}

// ─── Check limits & deduct counters (call BEFORE API request) ─────────────────
// hasFile: also check/deduct files_used when true

export async function checkAndDeduct(
  userId: string,
  requestType: RequestType,
  count = 1,
  hasFile = false,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      std_messages_today:       true,
      pro_messages_today:       true,
      images_today:             true,
      videos_today:             true,
      files_used:               true,
      std_messages_daily_limit: true,
      pro_messages_daily_limit: true,
      images_daily_limit:       true,
      videos_daily_limit:       true,
      files_monthly_limit:      true,
    },
  });
  if (!user) throw Object.assign(new Error('User not found'), { code: 'UNAUTHORIZED' });

  const updates: Record<string, unknown> = {};

  // ── Videos ──────────────────────────────────────────────────────────────────
  if (requestType === 'video_generate') {
    if (user.videos_daily_limit === 0) {
      throw Object.assign(new Error('LIMIT_VIDEOS_UNAVAILABLE'), { code: 'LIMIT_VIDEOS_UNAVAILABLE' });
    }
    if (user.videos_daily_limit !== -1 && user.videos_today + count > user.videos_daily_limit) {
      throw Object.assign(new Error('LIMIT_VIDEOS'), { code: 'LIMIT_VIDEOS' });
    }
    await prisma.user.update({ where: { id: userId }, data: { videos_today: { increment: count } } });
    return;
  }

  // ── Images ──────────────────────────────────────────────────────────────────
  if (requestType === 'image_generate' || requestType === 'image_edit') {
    if (user.images_daily_limit === 0) {
      throw Object.assign(new Error('LIMIT_IMAGES'), { code: 'LIMIT_IMAGES' });
    }
    if (user.images_daily_limit !== -1 && user.images_today + 1 > user.images_daily_limit) {
      throw Object.assign(new Error('LIMIT_IMAGES'), { code: 'LIMIT_IMAGES' });
    }
    await prisma.user.update({ where: { id: userId }, data: { images_today: { increment: 1 } } });
    return;
  }

  // ── Pro messages ─────────────────────────────────────────────────────────────
  if (requestType === 'chat_pro') {
    if (user.pro_messages_daily_limit === 0) {
      throw Object.assign(new Error('LIMIT_PRO_UNAVAILABLE'), { code: 'LIMIT_PRO_UNAVAILABLE' });
    }
    if (user.pro_messages_daily_limit !== -1 && user.pro_messages_today >= user.pro_messages_daily_limit) {
      throw Object.assign(new Error('LIMIT_PRO_MESSAGES'), { code: 'LIMIT_PRO_MESSAGES' });
    }
    updates.pro_messages_today = { increment: 1 };
  }

  // ── Std messages ─────────────────────────────────────────────────────────────
  if (requestType === 'chat_std') {
    const stdLimit = user.std_messages_daily_limit;
    if (stdLimit !== -1 && user.std_messages_today >= stdLimit) {
      const code = user.plan === 'FREE' ? 'LIMIT_FREE_MESSAGES' : 'LIMIT_STD_MESSAGES';
      throw Object.assign(new Error(code), { code });
    }
    updates.std_messages_today = { increment: 1 };
  }

  // ── File attachment check ─────────────────────────────────────────────────────
  if (hasFile) {
    if (user.files_monthly_limit === 0 || user.files_used >= user.files_monthly_limit) {
      throw Object.assign(new Error('LIMIT_FILES'), { code: 'LIMIT_FILES' });
    }
    updates.files_used = { increment: 1 };
  }

  await prisma.user.update({ where: { id: userId }, data: updates });
}

// ─── Refund on API error ──────────────────────────────────────────────────────

export async function refundCounter(
  userId: string,
  requestType: RequestType,
  count = 1,
  hasFile = false,
): Promise<void> {
  try {
    const updates: Record<string, unknown> = {};
    if (requestType === 'video_generate') {
      updates.videos_today = { decrement: count };
    } else if (requestType === 'image_generate' || requestType === 'image_edit') {
      updates.images_today = { decrement: 1 };
    } else if (requestType === 'chat_pro') {
      updates.pro_messages_today = { decrement: 1 };
      if (hasFile) updates.files_used = { decrement: 1 };
    } else {
      updates.std_messages_today = { decrement: 1 };
      if (hasFile) updates.files_used = { decrement: 1 };
    }
    await prisma.user.update({ where: { id: userId }, data: updates });
  } catch {
    // Refund is best-effort
  }
}

// ─── Apply plan limits (call on subscription webhook) ────────────────────────

export interface PlanLimits {
  std_messages_daily: number;
  pro_messages_daily: number;
  images_daily:       number;
  videos_daily:       number;
  files_monthly:      number;
}

export async function applyPlanLimits(
  userId: string,
  limits: PlanLimits,
  _planName: string,
): Promise<void> {
  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: {
      std_messages_daily_limit: limits.std_messages_daily,
      pro_messages_daily_limit: limits.pro_messages_daily,
      images_daily_limit:       limits.images_daily,
      videos_daily_limit:       limits.videos_daily,
      files_monthly_limit:      limits.files_monthly,
      // Reset counters on plan change
      std_messages_today: 0,
      pro_messages_today: 0,
      images_today:       0,
      videos_today:       0,
      files_used:         0,
      day_start:          now,
      period_start:       now,
    },
  });
}
