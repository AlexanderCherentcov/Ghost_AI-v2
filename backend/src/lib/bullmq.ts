import { Queue, QueueOptions } from 'bullmq';

const connection = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
};

const defaultQueueOptions: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
};

export const visionQueue = new Queue('vision', defaultQueueOptions);
export const soundQueue = new Queue('sound', defaultQueueOptions);
export const reelQueue = new Queue('reel', defaultQueueOptions);

export { connection as bullmqConnection };
