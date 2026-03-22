/** @type {import('next').NextConfig} */
const nextConfig = {
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
  },
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
