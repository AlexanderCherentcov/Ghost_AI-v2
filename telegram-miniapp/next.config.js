/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { hostname: 't.me' },
      { hostname: 'media.ghostline.ai' },
      { hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
    ],
  },
};

module.exports = nextConfig;
