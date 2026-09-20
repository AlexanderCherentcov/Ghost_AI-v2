import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

// Модуль хранит кэш на уровне модуля — для каждого теста берём его заново.
async function freshApi() {
  vi.resetModules();
  return (await import('./api')).api;
}

describe('api.payments.plans — объединение запросов', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('параллельные вызовы из разных компонентов делают один сетевой запрос', async () => {
    fetchMock.mockResolvedValue(okResponse({ plans: [] }));
    const api = await freshApi();

    const results = await Promise.all([api.payments.plans(), api.payments.plans(), api.payments.plans()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results[0]).toBe(results[1]);
  });

  it('в течение TTL повторный вызов берётся из кэша, после — запрашивается заново', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(okResponse({ plans: [] }));
    const api = await freshApi();

    await api.payments.plans();
    vi.advanceTimersByTime(10_000);
    await api.payments.plans();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(25_000);
    await api.payments.plans();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('неудачный запрос не кэшируется — следующий вызов пробует заново', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'err', json: async () => ({ error: 'boom' }) } as Response)
      .mockResolvedValueOnce(okResponse({ plans: [] }));
    const api = await freshApi();

    await expect(api.payments.plans()).rejects.toThrow();
    await expect(api.payments.plans()).resolves.toEqual({ plans: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
