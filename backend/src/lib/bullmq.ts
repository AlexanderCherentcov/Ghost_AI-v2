import { Queue, QueueOptions } from 'bullmq';

// DB 1 — BullMQ queues (isolated from cache, noeviction protects jobs)
// ioredis options object does NOT accept a 'url' field — parse it manually.
function parsedConnection(db: number) {
  const raw = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port) : 6379,
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    db,
  };
}

const connection = parsedConnection(1);

const defaultQueueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
};

// Image/sound/video generation: no retries — each attempt charges real money
const mediaQueueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
};

export const visionQueue = new Queue('vision', mediaQueueOptions);
export const soundQueue = new Queue('sound', mediaQueueOptions);
export const reelQueue = new Queue('reel', mediaQueueOptions);

export { connection as bullmqConnection };
