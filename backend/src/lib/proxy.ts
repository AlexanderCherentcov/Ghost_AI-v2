/**
 * Outbound HTTP proxy — routes all AI API calls through an external proxy
 * (e.g. Amsterdam VPS) to bypass geo-restrictions from Russian IP.
 *
 * Set in .env:
 *   HTTPS_PROXY=http://user:pass@amsterdam-vps:3128       ← HTTP/HTTPS proxy
 *   HTTPS_PROXY=socks5://user:pass@amsterdam-vps:1080     ← SOCKS5 proxy
 *
 * When not set, all requests go directly (no proxy).
 *
 * Implementation: sets undici's global ProxyAgent which intercepts ALL
 * fetch() calls in Node 18+ (including OpenAI SDK, raw fetch, etc.).
 * Prisma/Redis TCP connections are unaffected (they don't use fetch).
 */

export async function setupProxy(): Promise<void> {
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? process.env.SOCKS_PROXY;
  if (!proxyUrl) return;

  try {
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');

    setGlobalDispatcher(
      new ProxyAgent({
        uri: proxyUrl,
        keepAliveTimeout: 10_000,
        keepAliveMaxTimeout: 30_000,
        // Connect timeout 15s — proxy handshake can be slow on cheap VPS
        connectTimeout: 15_000,
      })
    );

    const masked = proxyUrl.replace(/:[^:@]*@/, ':***@');
    console.log(`[Proxy] Global HTTP proxy active → ${masked}`);
  } catch (err) {
    // undici is bundled with Node 18+ — should never fail
    console.error('[Proxy] Failed to set global proxy dispatcher:', err);
  }
}
