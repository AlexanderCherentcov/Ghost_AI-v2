/**
 * Outbound HTTP proxy — routes all AI API calls through an external proxy
 * (Amsterdam VPS) to bypass geo-restrictions from Russian IP.
 *
 * Set in .env:
 *   HTTPS_PROXY=socks5://user:pass@194.33.35.73:1080   ← SOCKS5 proxy
 *   HTTPS_PROXY=http://user:pass@host:3128              ← HTTP proxy
 *
 * Uses undici ProxyAgent set as global dispatcher — intercepts ALL fetch()
 * calls in Node 18+ (OpenAI SDK, OpenRouter, GoAPI, any raw fetch).
 * Prisma/Redis TCP connections are NOT affected (they don't use fetch).
 */

import { ProxyAgent, setGlobalDispatcher } from 'undici';

export function setupProxy(): void {
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? process.env.SOCKS_PROXY;
  if (!proxyUrl) return;

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
