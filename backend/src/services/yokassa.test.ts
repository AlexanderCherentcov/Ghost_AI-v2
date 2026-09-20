import { describe, it, expect, vi, beforeEach } from 'vitest';

// Все внешние зависимости подменены: проверяем только логику processWebhook —
// идемпотентность, источник billing и то, что без подтверждения от ЮKassa ничего не выдаётся.
const h = vi.hoisted(() => ({
  get: vi.fn(),
  prisma: {
    payment: { findUnique: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    casperTransaction: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  grantCaspers: vi.fn(),
  reverseCaspersGrant: vi.fn(),
  demoteIfDepleted: vi.fn(),
  notifyPayment: vi.fn(),
  finalizeDiscountRedemption: vi.fn(),
}));

vi.mock('axios', () => ({ default: { create: () => ({ get: h.get, post: vi.fn() }) } }));
vi.mock('../lib/prisma.js', () => ({ prisma: h.prisma }));
vi.mock('./tokens.js', () => ({
  grantCaspers: h.grantCaspers,
  reverseCaspersGrant: h.reverseCaspersGrant,
  demoteIfDepleted: h.demoteIfDepleted,
}));
vi.mock('./admin-notify.js', () => ({ notifyPayment: h.notifyPayment }));
vi.mock('./promo.js', () => ({
  previewDiscountPromo: vi.fn(),
  finalizeDiscountRedemption: h.finalizeDiscountRedemption,
}));

import { processWebhook } from './yokassa.js';
import { PLANS } from '../config/plans.js';

const DAY_MS = 24 * 3600 * 1000;
const PAYMENT_ID = '2f1c9d4e-000f-5000-9000-1a2b3c4d5e6f';

function planPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay_row_1', userId: 'user_1', yokassaId: PAYMENT_ID, amount: 990,
    paymentType: 'subscription', plan: 'PRO', billing: 'MONTHLY', promoCode: null, casperAmount: null,
    ...overrides,
  };
}

function succeededEvent(body: Record<string, unknown> = {}) {
  return { type: 'payment.succeeded', object: { id: PAYMENT_ID, ...body } };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.get.mockResolvedValue({ data: { status: 'succeeded' } });
  h.prisma.payment.findUnique.mockResolvedValue(planPayment());
  h.prisma.payment.updateMany.mockResolvedValue({ count: 1 });
  h.prisma.user.findUnique.mockResolvedValue({ plan: 'FREE', planExpiresAt: null, name: 'Тест' });
  h.prisma.$transaction.mockImplementation(async (fn: (tx: typeof h.prisma) => unknown) => fn(h.prisma));
  h.prisma.casperTransaction.create.mockResolvedValue({});
  h.notifyPayment.mockResolvedValue(undefined);
  h.finalizeDiscountRedemption.mockResolvedValue(undefined);
});

describe('processWebhook — payment.succeeded', () => {
  it('выдаёт план и Caspers ровно один раз', async () => {
    await processWebhook(succeededEvent());

    expect(h.prisma.user.update).toHaveBeenCalledTimes(1);
    const data = h.prisma.user.update.mock.calls[0][0].data;
    expect(data.plan).toBe('PRO');
    expect(data.billing).toBe('MONTHLY');
    expect(h.grantCaspers).toHaveBeenCalledTimes(1);
    expect(h.grantCaspers.mock.calls[0][1]).toBe(PLANS.PRO.caspers_monthly);
  });

  it('повторная доставка того же вебхука ничего не выдаёт повторно', async () => {
    h.prisma.payment.updateMany.mockResolvedValue({ count: 0 }); // платёж уже SUCCEEDED

    await processWebhook(succeededEvent());

    expect(h.prisma.user.update).not.toHaveBeenCalled();
    expect(h.grantCaspers).not.toHaveBeenCalled();
    expect(h.notifyPayment).not.toHaveBeenCalled();
  });

  it('billing берётся из записи Payment, а не из тела вебхука (подделка yearly не даёт год)', async () => {
    await processWebhook(succeededEvent({ metadata: { billing: 'yearly', plan: 'ULTRA' } }));

    const data = h.prisma.user.update.mock.calls[0][0].data;
    expect(data.plan).toBe('PRO');
    const days = (data.planExpiresAt.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32); // месяц, не год
  });

  it('годовая оплата, записанная в Payment, даёт год', async () => {
    h.prisma.payment.findUnique.mockResolvedValue(planPayment({ billing: 'YEARLY' }));

    await processWebhook(succeededEvent());

    const days = (h.prisma.user.update.mock.calls[0][0].data.planExpiresAt.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(370);
  });

  it('продление того же плана прибавляется к остатку срока', async () => {
    const remaining = new Date(Date.now() + 10 * DAY_MS);
    h.prisma.user.findUnique.mockResolvedValue({ plan: 'PRO', planExpiresAt: remaining, name: 'Тест' });

    await processWebhook(succeededEvent());

    const days = (h.prisma.user.update.mock.calls[0][0].data.planExpiresAt.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(37); // 10 дней остатка + месяц
  });

  it('если ЮKassa не подтверждает платёж (status != succeeded) — ничего не выдаётся', async () => {
    h.get.mockResolvedValue({ data: { status: 'pending' } });

    await processWebhook(succeededEvent());

    expect(h.prisma.payment.findUnique).not.toHaveBeenCalled();
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('если проверочный запрос к ЮKassa упал — ничего не выдаётся', async () => {
    h.get.mockRejectedValue(new Error('network'));

    await processWebhook(succeededEvent());

    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('платёж, которого нет в нашей БД, игнорируется', async () => {
    h.prisma.payment.findUnique.mockResolvedValue(null);

    await processWebhook(succeededEvent());

    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('id с попыткой подмены пути не уходит в исходящий запрос', async () => {
    await processWebhook({ type: 'payment.succeeded', object: { id: '../../refunds' } });
    await processWebhook({ type: 'payment.succeeded', object: { id: 'a/b?x=1' } });

    expect(h.get).not.toHaveBeenCalled();
  });

  it('пополнение Caspers зачисляет сумму и не трогает план', async () => {
    h.prisma.payment.findUnique.mockResolvedValue(
      planPayment({ paymentType: 'caspers', plan: null, casperAmount: 100, billing: null }),
    );

    await processWebhook(succeededEvent());

    expect(h.prisma.user.update.mock.calls[0][0].data).toEqual({ caspers_balance: { increment: 100 } });
    expect(h.prisma.casperTransaction.create).toHaveBeenCalledTimes(1);
    expect(h.grantCaspers).not.toHaveBeenCalled();
  });

  it('скидочный промокод фиксируется только после успешной выдачи, повтор его не дублирует', async () => {
    h.prisma.payment.findUnique.mockResolvedValue(planPayment({ promoCode: 'SALE10' }));

    await processWebhook(succeededEvent());
    expect(h.finalizeDiscountRedemption).toHaveBeenCalledTimes(1);

    h.prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    await processWebhook(succeededEvent());
    expect(h.finalizeDiscountRedemption).toHaveBeenCalledTimes(1);
  });
});

describe('processWebhook — прочие события', () => {
  it('payment.canceled меняет статус только у PENDING-платежа', async () => {
    await processWebhook({ type: 'payment.canceled', object: { id: PAYMENT_ID } });

    expect(h.prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { yokassaId: PAYMENT_ID, status: 'PENDING' },
      data: { status: 'CANCELED' },
    });
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refund.succeeded отзывает Caspers плана и вызывает демоцию', async () => {
    await processWebhook({ type: 'refund.succeeded', object: { id: 'refund_1', payment_id: PAYMENT_ID } });

    expect(h.prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { yokassaId: PAYMENT_ID, status: 'SUCCEEDED' },
      data: { status: 'REFUNDED' },
    });
    expect(h.reverseCaspersGrant).toHaveBeenCalledTimes(1);
    expect(h.reverseCaspersGrant.mock.calls[0][1]).toBe(PLANS.PRO.caspers_monthly);
    expect(h.demoteIfDepleted).toHaveBeenCalledWith('user_1');
  });

  it('повторный refund-вебхук не отзывает Caspers второй раз', async () => {
    h.prisma.payment.updateMany.mockResolvedValue({ count: 0 });

    await processWebhook({ type: 'refund.succeeded', object: { id: 'refund_1', payment_id: PAYMENT_ID } });

    expect(h.reverseCaspersGrant).not.toHaveBeenCalled();
    expect(h.demoteIfDepleted).not.toHaveBeenCalled();
  });

  it('мусорное тело и неизвестные события не падают и ничего не делают', async () => {
    await expect(processWebhook(null)).resolves.toBeUndefined();
    await expect(processWebhook({})).resolves.toBeUndefined();
    await expect(processWebhook({ type: 'payment.succeeded' })).resolves.toBeUndefined();
    await expect(processWebhook({ type: 'something.else', object: { id: 'x' } })).resolves.toBeUndefined();

    expect(h.get).not.toHaveBeenCalled();
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
});
