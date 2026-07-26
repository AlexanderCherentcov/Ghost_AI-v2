import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

// БД 0 — кэш текста/медиа (управляется через TTL, потерю данных при нагрузке можно пережить)
export const redis = new Redis(redisUrl, {
  db: 0,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: true,
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('connect', () => {
  console.info('[Redis] Connected');
});
