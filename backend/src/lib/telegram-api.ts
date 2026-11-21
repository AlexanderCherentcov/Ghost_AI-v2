// Тонкая обёртка над Telegram Bot API — переиспользуется везде, где нужно
// вызвать произвольный метод под конкретным токеном (разные боты: основной,
// админский), вместо копирования axios-вызовов по каждому месту.
//
// Прямой выход с VPS на api.telegram.org Telegram периодически режет по IP
// (инцидент 2026-09-12, повторно — уведомления о новых пользователях).
// grammY-боты давно ходят через HTTPS_PROXY (bot/src/lib/telegram-proxy.ts).
// Axios сам этот прокси не берёт, а proxy: false отправлял уведомления,
// галерею и поддержку напрямую — они и отваливались, пока бот ещё отвечал.
// YooKassa сюда не относится и остаётся прямым: см. services/yokassa.ts.
import axios, { type AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

export function resolveTelegramProxyUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env.HTTPS_PROXY ?? env.HTTP_PROXY;
  if (!url || url.startsWith('socks')) return undefined;
  return url;
}

let proxyAgent: HttpsProxyAgent<string> | null | undefined;
function getTelegramProxyAgent(): HttpsProxyAgent<string> | undefined {
  if (proxyAgent !== undefined) return proxyAgent ?? undefined;
  const url = resolveTelegramProxyUrl();
  if (url) {
    proxyAgent = new HttpsProxyAgent(url);
    const masked = url.replace(/:[^:@]*@/, ':***@');
    console.log(`[Telegram] Bot API via proxy → ${masked}`);
  } else {
    const raw = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
    if (raw?.startsWith('socks')) {
      console.warn('[Telegram] SOCKS proxy is not supported — set an http:// proxy. Bot API calls go DIRECT.');
    } else {
      console.warn('[Telegram] No HTTPS_PROXY — Bot API calls go DIRECT and fail when Telegram blocks this server IP.');
    }
    proxyAgent = null;
  }
  return proxyAgent ?? undefined;
}

let http: AxiosInstance | undefined;
function telegramHttp(): AxiosInstance {
  if (!http) {
    const agent = getTelegramProxyAgent();
    http = axios.create({
      timeout: 10_000,
      proxy: false,
      ...(agent ? { httpsAgent: agent } : {}),
    });
  }
  return http;
}

export async function callTelegramApi<T = unknown>(
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data } = await telegramHttp().post(
    `https://api.telegram.org/bot${botToken}/${method}`,
    payload,
  );
  if (!data.ok) {
    throw new Error(`Telegram API ${method} failed: ${data.description ?? 'unknown error'}`);
  }
  return data.result as T;
}
