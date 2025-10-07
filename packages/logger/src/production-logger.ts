/**
 * Production-safe logger that reduces console spam
 * Respects LOG_LEVEL and SILENT_MODE environment variables
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
};

const currentLevel = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'];
const isSilent = process.env.SILENT_MODE === '1' || process.env.SILENT_MODE === 'true';

export const productionLogger = {
  debug: (...args: any[]) => {
    if (!isSilent && currentLevel <= LOG_LEVELS.debug) {
      console.log(...args);
    }
  },
  
  info: (...args: any[]) => {
    if (!isSilent && currentLevel <= LOG_LEVELS.info) {
      console.log(...args);
    }
  },
  
  warn: (...args: any[]) => {
    if (!isSilent && currentLevel <= LOG_LEVELS.warn) {
      console.warn(...args);
    }
  },
  
  error: (...args: any[]) => {
    if (!isSilent && currentLevel <= LOG_LEVELS.error) {
      console.error(...args);
    }
  },
  
  // Always log critical errors unless fully silent
  critical: (...args: any[]) => {
    if (!isSilent) {
      console.error('[CRITICAL]', ...args);
    }
  }
};

// Export singleton instance
export default productionLogger;