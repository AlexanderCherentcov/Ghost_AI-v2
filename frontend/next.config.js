/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // next/image в проекте не используется (везде обычные <img>), оптимизацию отключаем —
  // remotePatterns при unoptimized не работают, поэтому список хостов убран как мёртвая конфигурация.
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
