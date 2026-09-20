import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prisma подменён: проверяем не SQL, а логику решений — какой путь списания выбран,
// какие условия попали в WHERE (именно они дают атомарность) и какие коды ошибок наружу.
const h = vi.hoisted(() => {
  const tx = {
    user: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    casperTransaction: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      $transaction: vi.fn(),
      $executeRaw: vi.fn(),
      user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      casperTransaction: { create: vi.fn() },
    },
  };
});

vi.mock('../lib/prisma.js', () => ({ prisma: h.prisma }));

import { checkAndDeduct, refundCaspers, checkResets } from './tokens.js';
import { FREE_LIMITS } from '../config/plans.js';

function user(overrides: Record<string, unknown> = {}) {
  return { plan: 'PRO', caspers_balance: 500, std_messages_today: 0, pro_messages_today: 0, ...overrides };
}

async function rejection(promise: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await promise;
  } catch (err) {
    return err as { code?: string; message: string };
  }
  throw new Error('ожидалась ошибка, но вызов завершился успешно');
}

beforeEach(() => {
  vi.clearAllMocks();
  h.prisma.$transaction.mockImplementation(async (fn: (tx: typeof h.tx) => unknown) => fn(h.tx));
  h.tx.user.findUnique.mockResolvedValue(user());
  h.tx.user.updateMany.mockResolvedValue({ count: 1 });
  h.tx.user.update.mockResolvedValue({});
  h.tx.casperTransaction.create.mockResolvedValue({});
  h.prisma.casperTransaction.create.mockResolvedValue({});
  h.prisma.$executeRaw.mockResolvedValue(1);
  h.prisma.user.updateMany.mockResolvedValue({ count: 0 });
  h.prisma.user.update.mockResolvedValue({});
  h.prisma.casperTransaction.create.mockResolvedValue({});
});

describe('checkAndDeduct — бесплатный чат (cost 0)', () => {
  it('FREE: занимает слот дневного лимита одним UPDATE с условием в WHERE', async () => {
    h.tx.user.findUnique.mockResolvedValue(user({ plan: 'FREE', caspers_balance: 0 }));

    const result = await checkAndDeduct('u1', 'chat', 0, 'chat_std');

    expect(result).toEqual({ caspersSpent: 0 });
    expect(h.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', std_messages_today: { lt: FREE_LIMITS.chat_daily } },
      data: { std_messages_today: { increment: 1 } },
    });
  });

  it('FREE: лимит исчерпан (count 0) — LIMIT_MESSAGES', async () => {
    h.tx.user.findUnique.mockResolvedValue(user({ plan: 'FREE', caspers_balance: 0 }));
    h.tx.user.updateMany.mockResolvedValue({ count: 0 });

    const err = await rejection(checkAndDeduct('u1', 'chat', 0, 'chat_std'));

    expect(err.code).toBe('LIMIT_MESSAGES');
  });

  it('платный тариф: чат безлимитный, только счётчик, Caspers не списываются', async () => {
    const result = await checkAndDeduct('u1', 'chat', 0, 'chat_std');

    expect(result).toEqual({ caspersSpent: 0 });
    expect(h.tx.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { std_messages_today: { increment: 1 } } });
    expect(h.tx.casperTransaction.create).not.toHaveBeenCalled();
  });
});

describe('checkAndDeduct — платные операции', () => {
  it('про-чат: баланс проверяется в WHERE, счётчик растёт на 1 (не на цену)', async () => {
    const result = await checkAndDeduct('u1', 'chat', 12, 'chat_pro');

    expect(result).toEqual({ caspersSpent: 12 });
    expect(h.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', caspers_balance: { gte: 12 } },
      data: { caspers_balance: { decrement: 12 }, pro_messages_today: { increment: 1 } },
    });
    expect(h.tx.casperTransaction.create).toHaveBeenCalledWith({ data: { userId: 'u1', amount: -12, reason: 'chat_pro' } });
  });

  it('про-чат: не хватает Caspers — LIMIT_PRO_MESSAGES и запись в журнал не создаётся', async () => {
    h.tx.user.updateMany.mockResolvedValue({ count: 0 });

    const err = await rejection(checkAndDeduct('u1', 'chat', 12, 'chat_pro'));

    expect(err.code).toBe('LIMIT_PRO_MESSAGES');
    expect(h.tx.casperTransaction.create).not.toHaveBeenCalled();
  });

  it.each([
    ['image', 'LIMIT_IMAGES'],
    ['music', 'LIMIT_MUSIC'],
    ['video', 'LIMIT_VIDEOS'],
  ] as const)('%s: не хватает Caspers — %s', async (domain, code) => {
    h.tx.user.updateMany.mockResolvedValue({ count: 0 });

    const err = await rejection(checkAndDeduct('u1', domain, 30, 'gen'));

    expect(err.code).toBe(code);
  });

  it('картинка: списывает цену и пишет отрицательную запись в журнал', async () => {
    const result = await checkAndDeduct('u1', 'image', 8, 'image_gemini');

    expect(result).toEqual({ caspersSpent: 8 });
    expect(h.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', caspers_balance: { gte: 8 } },
      data: { caspers_balance: { decrement: 8 } },
    });
    expect(h.tx.casperTransaction.create).toHaveBeenCalledWith({ data: { userId: 'u1', amount: -8, reason: 'image_gemini' } });
  });

  it('видео на FREE недоступно даже при большом балансе — и до списания не доходит', async () => {
    h.tx.user.findUnique.mockResolvedValue(user({ plan: 'FREE', caspers_balance: 9999 }));

    const err = await rejection(checkAndDeduct('u1', 'video', 100, 'video_kling'));

    expect(err.code).toBe('LIMIT_VIDEOS_FREE_PLAN');
    expect(h.tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('несуществующий пользователь — UNAUTHORIZED', async () => {
    h.tx.user.findUnique.mockResolvedValue(null);

    const err = await rejection(checkAndDeduct('ghost', 'image', 8, 'image'));

    expect(err.code).toBe('UNAUTHORIZED');
  });
});

describe('checkAndDeduct — балансовая демоция', () => {
  it('платный план с нулевым балансом демотируется атомарно и дальше считается FREE', async () => {
    h.tx.user.findUnique.mockResolvedValue(user({ plan: 'PRO', caspers_balance: 0 }));
    h.tx.user.updateMany.mockResolvedValueOnce({ count: 1 }); // демоция

    const err = await rejection(checkAndDeduct('u1', 'video', 100, 'video_kling'));

    expect(h.tx.user.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'u1', plan: { not: 'FREE' }, caspers_balance: { lte: 0 } },
      data: { plan: 'FREE', caspers_monthly: 0 },
    });
    expect(err.code).toBe('LIMIT_VIDEOS_FREE_PLAN');
  });

  it('если баланс успели пополнить (демоция count 0) — план остаётся, операция идёт по платному пути', async () => {
    h.tx.user.findUnique.mockResolvedValue(user({ plan: 'PRO', caspers_balance: 0 }));
    h.tx.user.updateMany
      .mockResolvedValueOnce({ count: 0 })  // демоция не сработала — вебхук пополнил баланс
      .mockResolvedValueOnce({ count: 1 }); // списание

    const result = await checkAndDeduct('u1', 'video', 50, 'video_kling');

    expect(result).toEqual({ caspersSpent: 50 });
  });
});

describe('refundCaspers', () => {
  it('нулевая сумма — ничего не делает (бесплатная операция не дарит Caspers)', async () => {
    await refundCaspers('u1', 0, 'chat');

    expect(h.prisma.$executeRaw).not.toHaveBeenCalled();
    expect(h.prisma.casperTransaction.create).not.toHaveBeenCalled();
  });

  it('возвращает сумму и пишет запись refund_<reason>', async () => {
    await refundCaspers('u1', 8, 'image_gemini');

    expect(h.prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(h.prisma.casperTransaction.create).toHaveBeenCalledWith({
      data: { userId: 'u1', amount: 8, reason: 'refund_image_gemini' },
    });
  });

  it('сбой БД не бросает наружу, но громко пишется в лог', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.prisma.$executeRaw.mockRejectedValue(new Error('db down'));

    await expect(refundCaspers('u1', 8, 'image')).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('ВОЗВРАТ НЕ ВЫПОЛНЕН'), expect.any(Error));
  });
});

describe('checkResets — регрант Caspers', () => {
  const DAY = 24 * 3600 * 1000;
  const longAgo = new Date(Date.now() - 40 * DAY);

  function paidUser(planExpiresAt: Date | null) {
    return {
      plan: 'PRO', caspers_monthly: 300, caspers_balance: 100, planExpiresAt,
      day_start: new Date(), week_start: new Date(), month_start: new Date(), period_start: longAgo,
    };
  }

  it('в пределах оплаченного периода (годовая подписка) месячный грант выдаётся', async () => {
    h.prisma.user.findUnique.mockResolvedValue(paidUser(new Date(Date.now() + 200 * DAY)));
    h.prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await checkResets('u1');

    expect(h.prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ caspers_balance: { increment: 300 } }),
    }));
    expect(h.prisma.casperTransaction.create).toHaveBeenCalledWith({
      data: { userId: 'u1', amount: 300, reason: 'plan_grant_monthly' },
    });
  });

  it('после окончания оплаченного срока грант больше не выдаётся', async () => {
    h.prisma.user.findUnique.mockResolvedValue(paidUser(new Date(Date.now() - DAY)));

    await checkResets('u1');

    expect(h.prisma.user.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.casperTransaction.create).not.toHaveBeenCalled();
  });

  it('грант защищён оптимистичной блокировкой по period_start (параллельный вызов не выдаст дважды)', async () => {
    h.prisma.user.findUnique.mockResolvedValue(paidUser(new Date(Date.now() + 200 * DAY)));
    h.prisma.user.updateMany.mockResolvedValue({ count: 0 }); // кто-то успел раньше

    await checkResets('u1');

    expect(h.prisma.user.updateMany.mock.calls[0][0].where).toMatchObject({ period_start: longAgo });
    expect(h.prisma.casperTransaction.create).not.toHaveBeenCalled();
  });
});
