import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  prisma: { generateJob: { findMany: vi.fn(), updateMany: vi.fn() } },
  getJob: vi.fn(),
  refundCaspers: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({ prisma: h.prisma }));
vi.mock('../lib/bullmq.js', () => ({
  visionQueue: { getJob: h.getJob },
  soundQueue: { getJob: h.getJob },
  reelQueue: { getJob: h.getJob },
}));
vi.mock('./tokens.js', () => ({ refundCaspers: h.refundCaspers }));

import { reconcileStuckJobs } from './job-reconciler.js';

function bullJob(state: string, data: Record<string, unknown> = { userId: 'u1', caspersSpent: 7, modelId: 'kling-v2.5' }) {
  return { data, getState: vi.fn().mockResolvedValue(state) };
}

// Возвращаем зависшую строку только для одного режима, чтобы считать вызовы точно.
function stuckRows(mode: 'vision' | 'sound' | 'reel', rows: Array<{ id: string; bullJobId: string | null }>) {
  h.prisma.generateJob.findMany.mockImplementation(async ({ where }: { where: { mode: string } }) =>
    where.mode === mode ? rows : [],
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.prisma.generateJob.updateMany.mockResolvedValue({ count: 1 });
  h.refundCaspers.mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('reconcileStuckJobs', () => {
  it('закрывает упавшую в BullMQ задачу и возвращает Caspers ровно один раз', async () => {
    stuckRows('reel', [{ id: 'job1', bullJobId: 'b1' }]);
    h.getJob.mockResolvedValue(bullJob('failed'));

    const closed = await reconcileStuckJobs();

    expect(closed).toBe(1);
    expect(h.prisma.generateJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'job1', status: { in: ['pending', 'processing'] } },
      data: expect.objectContaining({ status: 'failed' }),
    });
    expect(h.refundCaspers).toHaveBeenCalledTimes(1);
    expect(h.refundCaspers).toHaveBeenCalledWith('u1', 7, 'kling-v2.5');
  });

  it('не вмешивается, пока задачей управляет BullMQ (active/waiting/delayed)', async () => {
    stuckRows('vision', [{ id: 'j1', bullJobId: 'b1' }, { id: 'j2', bullJobId: 'b2' }, { id: 'j3', bullJobId: 'b3' }]);
    h.getJob
      .mockResolvedValueOnce(bullJob('active'))
      .mockResolvedValueOnce(bullJob('waiting'))
      .mockResolvedValueOnce(bullJob('delayed'));

    expect(await reconcileStuckJobs()).toBe(0);
    expect(h.prisma.generateJob.updateMany).not.toHaveBeenCalled();
    expect(h.refundCaspers).not.toHaveBeenCalled();
  });

  it('completed в очереди — результат уже выдан, статус и деньги не трогаем', async () => {
    stuckRows('sound', [{ id: 'j1', bullJobId: 'b1' }]);
    h.getJob.mockResolvedValue(bullJob('completed'));

    expect(await reconcileStuckJobs()).toBe(0);
    expect(h.refundCaspers).not.toHaveBeenCalled();
  });

  it('если статус уже перевёл кто-то другой (count 0) — возврата нет, двойной выплаты не будет', async () => {
    stuckRows('reel', [{ id: 'job1', bullJobId: 'b1' }]);
    h.getJob.mockResolvedValue(bullJob('failed'));
    h.prisma.generateJob.updateMany.mockResolvedValue({ count: 0 });

    expect(await reconcileStuckJobs()).toBe(0);
    expect(h.refundCaspers).not.toHaveBeenCalled();
  });

  it('данных о списании нет (задача вычищена из очереди) — закрывает без возврата и без выдуманной суммы', async () => {
    stuckRows('vision', [{ id: 'job1', bullJobId: 'b1' }]);
    h.getJob.mockResolvedValue(undefined);

    expect(await reconcileStuckJobs()).toBe(1);
    expect(h.refundCaspers).not.toHaveBeenCalled();
  });

  it('у музыкальной задачи возврат идёт с тем же reason, что у штатного обработчика воркера', async () => {
    stuckRows('sound', [{ id: 'job1', bullJobId: 'b1' }]);
    h.getJob.mockResolvedValue(bullJob('failed', { userId: 'u1', caspersSpent: 3 }));

    await reconcileStuckJobs();

    expect(h.refundCaspers).toHaveBeenCalledWith('u1', 3, 'music_generate');
  });

  it('задача без bullJobId (не дошла до очереди) закрывается без возврата', async () => {
    stuckRows('reel', [{ id: 'job1', bullJobId: null }]);

    expect(await reconcileStuckJobs()).toBe(1);
    expect(h.getJob).not.toHaveBeenCalled();
    expect(h.refundCaspers).not.toHaveBeenCalled();
  });
});
