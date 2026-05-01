/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { hostname: 'avatars.yandex.net' },
      { hostname: 'lh3.googleusercontent.com' },
      { hostname: 't.me' },
      { hostname: 'media.ghostline.ai' },
      { hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
      { hostname: 'replicate.delivery' },
    ],
    unoptimized: true,
  },
};

module.exports = nextConfig;
