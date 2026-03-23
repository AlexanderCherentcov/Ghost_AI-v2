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
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) return [];
    return [
      {
        source: '/api/backend/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
