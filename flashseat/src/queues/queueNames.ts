/**
 * BullMQ queue names. `prefix` wraps the BullMQ keyspace in a hash tag so a queue's
 * keys stay in one slot on Redis Cluster.
 */
export const QUEUE_PREFIX = '{flashseat}';

export const QUEUES = {
  TICKET_PDF: 'ticket-pdf',
  NOTIFICATIONS: 'notifications',
  RECONCILER: 'reconciler',
  DEAD_LETTER: 'dead-letter',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
