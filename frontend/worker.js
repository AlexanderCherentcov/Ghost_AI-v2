export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Try exact static file first
    try {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;
    } catch {}

    // SPA fallback: serve /chat/index for all /chat/* routes
    if (path.startsWith('/chat/')) {
      const fallback = new URL(request.url);
      fallback.pathname = '/chat/index/index.html';
      return env.ASSETS.fetch(fallback);
    }

    // Generic SPA fallback — serve root index.html
    const index = new URL(request.url);
    index.pathname = '/index.html';
    return env.ASSETS.fetch(index);
  },
};
