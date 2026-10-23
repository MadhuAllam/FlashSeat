import pino from 'pino';
import { env } from '../config/env';

export function createLogger(service: string) {
  return pino({
    level: env.LOG_LEVEL,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-webhook-signature"]',
        '*.password',
        '*.passwordHash',
      ],
      censor: '[REDACTED]',
    },
    ...(env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
          },
        }
      : {}),
  });
}

export const logger = createLogger(process.env.SERVICE_NAME ?? 'flashseat-api');
