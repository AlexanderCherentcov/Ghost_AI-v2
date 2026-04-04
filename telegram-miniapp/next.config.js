const { setupDevPlatform } = process.env.NODE_ENV === 'development'
  ? require('@cloudflare/next-on-pages/next-config-util')
  : { setupDevPlatform: () => {} };

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { hostname: 't.me' },
      { hostname: 'media.ghostline.ai' },
      { hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
    ],
    unoptimized: true,
  },
};

if (process.env.NODE_ENV === 'development') {
  setupDevPlatform();
}

module.exports = nextConfig;
