/**
 * Исходящий HTTP-прокси — маршрутизирует все вызовы AI API через внешний прокси
 * (VPS в Амстердаме), чтобы обойти гео-ограничения для российского IP.
 *
 * Задаётся в .env:
 *   HTTPS_PROXY=http://user:pass@194.33.35.73:8888   ← HTTP-прокси (tinyproxy)
 *
 * Использует undici ProxyAgent как глобальный диспетчер — перехватывает вызовы
 * встроенного глобального fetch() в Node 18+ (Cloudflare, GoAPI, генерация изображений через raw fetch).
 * TCP-соединения Prisma/Redis НЕ затрагиваются (они не используют fetch).
 *
 * ⚠️ НЕ покрывает OpenAI SDK: он использует node-fetch внутри, который игнорирует
 * глобальный диспетчер undici. Запросы к OpenRouter проксируются отдельно —
 * через `httpAgent` в providers/openrouter.ts (HttpsProxyAgent).
 *
 * ПРИМЕЧАНИЕ: undici ProxyAgent поддерживает только HTTP/HTTPS-прокси (не SOCKS5).
 */

import { ProxyAgent, setGlobalDispatcher } from 'undici';

export function setupProxy(): void {
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  if (!proxyUrl) return;

  if (proxyUrl.startsWith('socks')) {
    console.warn('[Proxy] SOCKS5 not supported by undici ProxyAgent — use HTTP proxy (http://host:port). Proxy disabled.');
    return;
  }

  try {
    setGlobalDispatcher(
      new ProxyAgent({
        uri: proxyUrl,
        keepAliveTimeout: 10_000,
        keepAliveMaxTimeout: 30_000,
        connectTimeout: 15_000,
      })
    );
    const masked = proxyUrl.replace(/:[^:@]*@/, ':***@');
    console.log(`[Proxy] Global proxy active → ${masked}`);
  } catch (err) {
    console.error('[Proxy] Failed to set global proxy dispatcher:', err);
  }
}
