import { TrenchesConfig } from './schema';
export type { TrenchesConfig } from './schema';
export declare function loadConfig(options?: {
    forceReload?: boolean;
    configPath?: string;
}): TrenchesConfig;
export declare function getConfig(): TrenchesConfig;
