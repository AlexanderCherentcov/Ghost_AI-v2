/**
 * Outbound HTTP proxy — routes all AI API calls through an external proxy
 * (Amsterdam VPS) to bypass geo-restrictions from Russian IP.
 *
 * Set in .env:
 *   HTTPS_PROXY=http://user:pass@194.33.35.73:8888   ← HTTP proxy (tinyproxy)
 *
 * Uses undici ProxyAgent as global dispatcher — intercepts calls made with the
 * built-in global fetch() in Node 18+ (Cloudflare, GoAPI, raw fetch image gen).
 * Prisma/Redis TCP connections are NOT affected (they don't use fetch).
 *
 * ⚠️ DOES NOT cover the OpenAI SDK: it uses node-fetch internally, which ignores
 * undici's global dispatcher. OpenRouter requests are proxied separately by
 * passing an HttpsProxyAgent via `httpAgent` in providers/openrouter.ts.
 *
 * NOTE: undici ProxyAgent supports only HTTP/HTTPS proxy URLs (not SOCKS5).
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
