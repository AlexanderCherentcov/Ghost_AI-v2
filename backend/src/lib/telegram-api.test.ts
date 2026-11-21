import { describe, it, expect } from 'vitest';
import { resolveTelegramProxyUrl } from './telegram-api.js';

describe('прокси для Telegram Bot API', () => {
  it('берёт HTTPS_PROXY, если он задан', () => {
    expect(resolveTelegramProxyUrl({ HTTPS_PROXY: 'http://user:secret@10.0.0.1:8888' } as NodeJS.ProcessEnv))
      .toBe('http://user:secret@10.0.0.1:8888');
  });

  it('падает на HTTP_PROXY, когда HTTPS_PROXY пуст', () => {
    expect(resolveTelegramProxyUrl({ HTTP_PROXY: 'http://10.0.0.2:8888' } as NodeJS.ProcessEnv))
      .toBe('http://10.0.0.2:8888');
  });

  it('SOCKS не подставляет: axios через него всё равно не ходит', () => {
    expect(resolveTelegramProxyUrl({ HTTPS_PROXY: 'socks5://10.0.0.3:1080' } as NodeJS.ProcessEnv))
      .toBeUndefined();
  });

  it('без переменных уходит напрямую', () => {
    expect(resolveTelegramProxyUrl({} as NodeJS.ProcessEnv)).toBeUndefined();
  });
});
