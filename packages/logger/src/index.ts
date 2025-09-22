import pino, { Logger } from 'pino';
import { getConfig } from '@trenches/config';

const PID = process.pid;

export type ScopedLogger = Logger;

export interface LoggerOptions {
  level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

const destination = pino.destination({
  sync: false
});

function resolveLevel(defaultLevel: LoggerOptions['level']): LoggerOptions['level'] {
  const cfg = getConfig();
  return (process.env.LOG_LEVEL as LoggerOptions['level']) ?? cfg.logging.level ?? defaultLevel ?? 'info';
}

export function createLogger(scope: string, options?: LoggerOptions): ScopedLogger {
  const level = resolveLevel(options?.level);
  const baseLogger = pino(
    {
      level,
      base: { pid: PID, scope },
      formatters: {
        level: (label) => ({ level: label })
      },
      timestamp: pino.stdTimeFunctions.isoTime
    },
    destination
  );
  return baseLogger;
}

export const rootLogger = createLogger('root');

