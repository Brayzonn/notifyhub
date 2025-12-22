export const QUEUE_NAMES = {
  EMAIL: 'notifications:email',
  WEBHOOK: 'notifications:webhook',
  FAILED: 'notifications:failed',
} as const;

export type QueueType = 'email' | 'webhook' | 'failed';

export const QUEUE_PRIORITIES = {
  CRITICAL: 10,
  NORMAL: 5,
  LOW: 1,
} as const;

export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  DELAYS: {
    ATTEMPT_1: 0,
    ATTEMPT_2: 2000,
    ATTEMPT_3: 4000,
    ATTEMPT_4: 8000,
  },
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
export type QueuePriority =
  (typeof QUEUE_PRIORITIES)[keyof typeof QUEUE_PRIORITIES];
