import { Logger } from 'pino';
export type ScopedLogger = Logger;
export interface LoggerOptions {
    level?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}
export declare function createLogger(scope: string, options?: LoggerOptions): ScopedLogger;
export declare const rootLogger: ScopedLogger;
