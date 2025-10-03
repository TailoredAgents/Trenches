import { z } from 'zod';
export declare const concurrencyScalerSchema: z.ZodObject<{
    base: z.ZodNumber;
    max: z.ZodNumber;
    recoveryMinutes: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    base: number;
    max: number;
    recoveryMinutes: number;
}, {
    base: number;
    max: number;
    recoveryMinutes: number;
}>;
export declare const equityTierSchema: z.ZodObject<{
    minEquity: z.ZodNumber;
    maxEquity: z.ZodNullable<z.ZodNumber>;
    riskFraction: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    minEquity: number;
    maxEquity: number | null;
    riskFraction: number;
}, {
    minEquity: number;
    maxEquity: number | null;
    riskFraction: number;
}>;
export declare const banditBundleSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    gate: z.ZodEnum<["strict", "normal", "loose"]>;
    slippageBps: z.ZodNumber;
    tipPercentile: z.ZodEnum<["p25", "p50", "p75", "p90"]>;
    sizeMultiplier: z.ZodNumber;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    label: string;
    gate: "strict" | "normal" | "loose";
    slippageBps: number;
    tipPercentile: "p25" | "p50" | "p75" | "p90";
    sizeMultiplier: number;
    notes?: string | undefined;
}, {
    id: string;
    label: string;
    gate: "strict" | "normal" | "loose";
    slippageBps: number;
    tipPercentile: "p25" | "p50" | "p75" | "p90";
    sizeMultiplier: number;
    notes?: string | undefined;
}>;
export declare const socialConfigSchema: z.ZodObject<{
    neynar: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        watchFids: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
        keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        pollIntervalSec: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        watchFids: number[];
        keywords: string[];
        pollIntervalSec: number;
    }, {
        enabled?: boolean | undefined;
        watchFids?: number[] | undefined;
        keywords?: string[] | undefined;
        pollIntervalSec?: number | undefined;
    }>;
    bluesky: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        cursorPath: z.ZodDefault<z.ZodString>;
        reconnectBackoffSec: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        cursorPath: string;
        reconnectBackoffSec: number;
    }, {
        enabled?: boolean | undefined;
        cursorPath?: string | undefined;
        reconnectBackoffSec?: number | undefined;
    }>;
    reddit: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        subreddits: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        pollIntervalSec: z.ZodDefault<z.ZodNumber>;
        appType: z.ZodDefault<z.ZodEnum<["installed", "web"]>>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        pollIntervalSec: number;
        subreddits: string[];
        appType: "installed" | "web";
    }, {
        enabled?: boolean | undefined;
        pollIntervalSec?: number | undefined;
        subreddits?: string[] | undefined;
        appType?: "installed" | "web" | undefined;
    }>;
    telegram: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        downloadDir: z.ZodDefault<z.ZodString>;
        pollIntervalSec: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        pollIntervalSec: number;
        channels: string[];
        downloadDir: string;
    }, {
        enabled?: boolean | undefined;
        pollIntervalSec?: number | undefined;
        channels?: string[] | undefined;
        downloadDir?: string | undefined;
    }>;
    gdelt: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        pollIntervalSec: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        pollIntervalSec: number;
    }, {
        enabled?: boolean | undefined;
        pollIntervalSec?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    neynar: {
        enabled: boolean;
        watchFids: number[];
        keywords: string[];
        pollIntervalSec: number;
    };
    bluesky: {
        enabled: boolean;
        cursorPath: string;
        reconnectBackoffSec: number;
    };
    reddit: {
        enabled: boolean;
        pollIntervalSec: number;
        subreddits: string[];
        appType: "installed" | "web";
    };
    telegram: {
        enabled: boolean;
        pollIntervalSec: number;
        channels: string[];
        downloadDir: string;
    };
    gdelt: {
        enabled: boolean;
        pollIntervalSec: number;
    };
}, {
    neynar: {
        enabled?: boolean | undefined;
        watchFids?: number[] | undefined;
        keywords?: string[] | undefined;
        pollIntervalSec?: number | undefined;
    };
    bluesky: {
        enabled?: boolean | undefined;
        cursorPath?: string | undefined;
        reconnectBackoffSec?: number | undefined;
    };
    reddit: {
        enabled?: boolean | undefined;
        pollIntervalSec?: number | undefined;
        subreddits?: string[] | undefined;
        appType?: "installed" | "web" | undefined;
    };
    telegram: {
        enabled?: boolean | undefined;
        pollIntervalSec?: number | undefined;
        channels?: string[] | undefined;
        downloadDir?: string | undefined;
    };
    gdelt: {
        enabled?: boolean | undefined;
        pollIntervalSec?: number | undefined;
    };
}>;
export declare const configSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["SIM", "SHADOW", "SEMI", "FULL"]>>;
    logging: z.ZodDefault<z.ZodObject<{
        level: z.ZodDefault<z.ZodEnum<["fatal", "error", "warn", "info", "debug", "trace"]>>;
        json: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        level: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
        json: boolean;
    }, {
        level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | undefined;
        json?: boolean | undefined;
    }>>;
    services: z.ZodObject<{
        agentCore: z.ZodDefault<z.ZodObject<{
            port: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            port: number;
        }, {
            port: number;
        }>>;
        executor: z.ZodDefault<z.ZodObject<{
            port: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            port: number;
        }, {
            port: number;
        }>>;
        uiGateway: z.ZodDefault<z.ZodObject<{
            port: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            port: number;
        }, {
            port: number;
        }>>;
        socialIngestor: z.ZodDefault<z.ZodObject<{
            port: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            port: number;
        }, {
            port: number;
        }>>;
        onchainDiscovery: z.ZodDefault<z.ZodObject<{
            port: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            port: number;
        }, {
            port: number;
        }>>;
        safetyEngine: z.ZodDefault<z.ZodObject<{
            port: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            port: number;
        }, {
            port: number;
        }>>;
        policyEngine: z.ZodDefault<z.ZodObject<{
            port: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            port: number;
        }, {
            port: number;
        }>>;
        positionManager: z.ZodDefault<z.ZodObject<{
            port: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            port: number;
        }, {
            port: number;
        }>>;
        narrativeMiner: z.ZodDefault<z.ZodObject<{
            port: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            port: number;
        }, {
            port: number;
        }>>;
        migrationWatcher: z.ZodDefault<z.ZodObject<{
            port: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            port: number;
        }, {
            port: number;
        }>>;
        leaderWallets: z.ZodDefault<z.ZodObject<{
            port: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            port: number;
        }, {
            port: number;
        }>>;
        metrics: z.ZodDefault<z.ZodObject<{
            port: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            port: number;
        }, {
            port: number;
        }>>;
    }, "strip", z.ZodTypeAny, {
        agentCore: {
            port: number;
        };
        executor: {
            port: number;
        };
        uiGateway: {
            port: number;
        };
        socialIngestor: {
            port: number;
        };
        onchainDiscovery: {
            port: number;
        };
        safetyEngine: {
            port: number;
        };
        policyEngine: {
            port: number;
        };
        positionManager: {
            port: number;
        };
        narrativeMiner: {
            port: number;
        };
        migrationWatcher: {
            port: number;
        };
        leaderWallets: {
            port: number;
        };
        metrics: {
            port: number;
        };
    }, {
        agentCore?: {
            port: number;
        } | undefined;
        executor?: {
            port: number;
        } | undefined;
        uiGateway?: {
            port: number;
        } | undefined;
        socialIngestor?: {
            port: number;
        } | undefined;
        onchainDiscovery?: {
            port: number;
        } | undefined;
        safetyEngine?: {
            port: number;
        } | undefined;
        policyEngine?: {
            port: number;
        } | undefined;
        positionManager?: {
            port: number;
        } | undefined;
        narrativeMiner?: {
            port: number;
        } | undefined;
        migrationWatcher?: {
            port: number;
        } | undefined;
        leaderWallets?: {
            port: number;
        } | undefined;
        metrics?: {
            port: number;
        } | undefined;
    }>;
    gating: z.ZodObject<{
        sssMin: z.ZodDefault<z.ZodNumber>;
        lpMinSol: z.ZodDefault<z.ZodNumber>;
        buysSellRatioMin: z.ZodDefault<z.ZodNumber>;
        uniquesMin: z.ZodDefault<z.ZodNumber>;
        minPoolAgeSec: z.ZodDefault<z.ZodNumber>;
        maxSpreadBps: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        sssMin: number;
        lpMinSol: number;
        buysSellRatioMin: number;
        uniquesMin: number;
        minPoolAgeSec: number;
        maxSpreadBps: number;
    }, {
        sssMin?: number | undefined;
        lpMinSol?: number | undefined;
        buysSellRatioMin?: number | undefined;
        uniquesMin?: number | undefined;
        minPoolAgeSec?: number | undefined;
        maxSpreadBps?: number | undefined;
    }>;
    watchWindows: z.ZodObject<{
        durationSec: z.ZodDefault<z.ZodNumber>;
        refreshIntervalSec: z.ZodDefault<z.ZodNumber>;
        decayHalfLifeSec: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        durationSec: number;
        refreshIntervalSec: number;
        decayHalfLifeSec: number;
    }, {
        durationSec?: number | undefined;
        refreshIntervalSec?: number | undefined;
        decayHalfLifeSec?: number | undefined;
    }>;
    topics: z.ZodObject<{
        cluster: z.ZodObject<{
            lshBands: z.ZodDefault<z.ZodNumber>;
            lshRows: z.ZodDefault<z.ZodNumber>;
            minCosine: z.ZodDefault<z.ZodNumber>;
            mergeMinObservations: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            lshBands: number;
            lshRows: number;
            minCosine: number;
            mergeMinObservations: number;
        }, {
            lshBands?: number | undefined;
            lshRows?: number | undefined;
            minCosine?: number | undefined;
            mergeMinObservations?: number | undefined;
        }>;
        scoring: z.ZodObject<{
            openThreshold: z.ZodDefault<z.ZodNumber>;
            sustainThreshold: z.ZodDefault<z.ZodNumber>;
            recencyHalfLifeSec: z.ZodDefault<z.ZodNumber>;
            noveltyEpsilon: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            openThreshold: number;
            sustainThreshold: number;
            recencyHalfLifeSec: number;
            noveltyEpsilon: number;
        }, {
            openThreshold?: number | undefined;
            sustainThreshold?: number | undefined;
            recencyHalfLifeSec?: number | undefined;
            noveltyEpsilon?: number | undefined;
        }>;
        phrase: z.ZodObject<{
            minLength: z.ZodDefault<z.ZodNumber>;
            maxLength: z.ZodDefault<z.ZodNumber>;
            stopwords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            minLength: number;
            maxLength: number;
            stopwords: string[];
        }, {
            minLength?: number | undefined;
            maxLength?: number | undefined;
            stopwords?: string[] | undefined;
        }>;
        matching: z.ZodObject<{
            minTrieScore: z.ZodDefault<z.ZodNumber>;
            minCosine: z.ZodDefault<z.ZodNumber>;
            boostSymbolMatch: z.ZodDefault<z.ZodNumber>;
            coolDownSec: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            minCosine: number;
            minTrieScore: number;
            boostSymbolMatch: number;
            coolDownSec: number;
        }, {
            minCosine?: number | undefined;
            minTrieScore?: number | undefined;
            boostSymbolMatch?: number | undefined;
            coolDownSec?: number | undefined;
        }>;
        baseline: z.ZodObject<{
            halfLifeSec: z.ZodDefault<z.ZodNumber>;
            flushIntervalSec: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            halfLifeSec: number;
            flushIntervalSec: number;
        }, {
            halfLifeSec?: number | undefined;
            flushIntervalSec?: number | undefined;
        }>;
        test: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            seed: z.ZodOptional<z.ZodNumber>;
            vectorizerModule: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            seed?: number | undefined;
            vectorizerModule?: string | undefined;
        }, {
            enabled?: boolean | undefined;
            seed?: number | undefined;
            vectorizerModule?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        cluster: {
            lshBands: number;
            lshRows: number;
            minCosine: number;
            mergeMinObservations: number;
        };
        scoring: {
            openThreshold: number;
            sustainThreshold: number;
            recencyHalfLifeSec: number;
            noveltyEpsilon: number;
        };
        phrase: {
            minLength: number;
            maxLength: number;
            stopwords: string[];
        };
        matching: {
            minCosine: number;
            minTrieScore: number;
            boostSymbolMatch: number;
            coolDownSec: number;
        };
        baseline: {
            halfLifeSec: number;
            flushIntervalSec: number;
        };
        test: {
            enabled: boolean;
            seed?: number | undefined;
            vectorizerModule?: string | undefined;
        };
    }, {
        cluster: {
            lshBands?: number | undefined;
            lshRows?: number | undefined;
            minCosine?: number | undefined;
            mergeMinObservations?: number | undefined;
        };
        scoring: {
            openThreshold?: number | undefined;
            sustainThreshold?: number | undefined;
            recencyHalfLifeSec?: number | undefined;
            noveltyEpsilon?: number | undefined;
        };
        phrase: {
            minLength?: number | undefined;
            maxLength?: number | undefined;
            stopwords?: string[] | undefined;
        };
        matching: {
            minCosine?: number | undefined;
            minTrieScore?: number | undefined;
            boostSymbolMatch?: number | undefined;
            coolDownSec?: number | undefined;
        };
        baseline: {
            halfLifeSec?: number | undefined;
            flushIntervalSec?: number | undefined;
        };
        test?: {
            enabled?: boolean | undefined;
            seed?: number | undefined;
            vectorizerModule?: string | undefined;
        } | undefined;
    }>;
    ladders: z.ZodObject<{
        takeProfits: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
        multiplierPercents: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
        trailActivatePct: z.ZodDefault<z.ZodNumber>;
        trailPct: z.ZodDefault<z.ZodNumber>;
        hardStopLossPct: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        takeProfits: number[];
        multiplierPercents: number[];
        trailActivatePct: number;
        trailPct: number;
        hardStopLossPct: number;
    }, {
        takeProfits?: number[] | undefined;
        multiplierPercents?: number[] | undefined;
        trailActivatePct?: number | undefined;
        trailPct?: number | undefined;
        hardStopLossPct?: number | undefined;
    }>;
    bandit: z.ZodObject<{
        rewardHorizonMinutes: z.ZodDefault<z.ZodNumber>;
        updateIntervalSec: z.ZodDefault<z.ZodNumber>;
        epsilonFloor: z.ZodDefault<z.ZodNumber>;
        bundles: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            gate: z.ZodEnum<["strict", "normal", "loose"]>;
            slippageBps: z.ZodNumber;
            tipPercentile: z.ZodEnum<["p25", "p50", "p75", "p90"]>;
            sizeMultiplier: z.ZodNumber;
            notes: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            label: string;
            gate: "strict" | "normal" | "loose";
            slippageBps: number;
            tipPercentile: "p25" | "p50" | "p75" | "p90";
            sizeMultiplier: number;
            notes?: string | undefined;
        }, {
            id: string;
            label: string;
            gate: "strict" | "normal" | "loose";
            slippageBps: number;
            tipPercentile: "p25" | "p50" | "p75" | "p90";
            sizeMultiplier: number;
            notes?: string | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        rewardHorizonMinutes: number;
        updateIntervalSec: number;
        epsilonFloor: number;
        bundles: {
            id: string;
            label: string;
            gate: "strict" | "normal" | "loose";
            slippageBps: number;
            tipPercentile: "p25" | "p50" | "p75" | "p90";
            sizeMultiplier: number;
            notes?: string | undefined;
        }[];
    }, {
        bundles: {
            id: string;
            label: string;
            gate: "strict" | "normal" | "loose";
            slippageBps: number;
            tipPercentile: "p25" | "p50" | "p75" | "p90";
            sizeMultiplier: number;
            notes?: string | undefined;
        }[];
        rewardHorizonMinutes?: number | undefined;
        updateIntervalSec?: number | undefined;
        epsilonFloor?: number | undefined;
    }>;
    wallet: z.ZodObject<{
        reservesSol: z.ZodDefault<z.ZodNumber>;
        dailySpendCapSol: z.ZodDefault<z.ZodNumber>;
        autoSkimProfitSol: z.ZodDefault<z.ZodNumber>;
        perNameCapFraction: z.ZodDefault<z.ZodNumber>;
        perNameCapMaxSol: z.ZodDefault<z.ZodNumber>;
        lpImpactCapFraction: z.ZodDefault<z.ZodNumber>;
        flowCapFraction: z.ZodDefault<z.ZodNumber>;
        equityTiers: z.ZodArray<z.ZodObject<{
            minEquity: z.ZodNumber;
            maxEquity: z.ZodNullable<z.ZodNumber>;
            riskFraction: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            minEquity: number;
            maxEquity: number | null;
            riskFraction: number;
        }, {
            minEquity: number;
            maxEquity: number | null;
            riskFraction: number;
        }>, "many">;
        concurrencyCap: z.ZodDefault<z.ZodNumber>;
        concurrencyScaler: z.ZodDefault<z.ZodObject<{
            base: z.ZodNumber;
            max: z.ZodNumber;
            recoveryMinutes: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            base: number;
            max: number;
            recoveryMinutes: number;
        }, {
            base: number;
            max: number;
            recoveryMinutes: number;
        }>>;
    }, "strip", z.ZodTypeAny, {
        reservesSol: number;
        dailySpendCapSol: number;
        autoSkimProfitSol: number;
        perNameCapFraction: number;
        perNameCapMaxSol: number;
        lpImpactCapFraction: number;
        flowCapFraction: number;
        equityTiers: {
            minEquity: number;
            maxEquity: number | null;
            riskFraction: number;
        }[];
        concurrencyCap: number;
        concurrencyScaler: {
            base: number;
            max: number;
            recoveryMinutes: number;
        };
    }, {
        equityTiers: {
            minEquity: number;
            maxEquity: number | null;
            riskFraction: number;
        }[];
        reservesSol?: number | undefined;
        dailySpendCapSol?: number | undefined;
        autoSkimProfitSol?: number | undefined;
        perNameCapFraction?: number | undefined;
        perNameCapMaxSol?: number | undefined;
        lpImpactCapFraction?: number | undefined;
        flowCapFraction?: number | undefined;
        concurrencyCap?: number | undefined;
        concurrencyScaler?: {
            base: number;
            max: number;
            recoveryMinutes: number;
        } | undefined;
    }>;
    rpc: z.ZodObject<{
        primaryUrl: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        secondaryUrl: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        wsUrl: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        jitoHttpUrl: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        jitoGrpcUrl: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        jupiterBaseUrl: z.ZodDefault<z.ZodString>;
        httpHeaders: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        primaryUrl: string;
        secondaryUrl: string;
        wsUrl: string;
        jitoHttpUrl: string;
        jitoGrpcUrl: string;
        jupiterBaseUrl: string;
        httpHeaders: Record<string, string>;
    }, {
        primaryUrl?: string | undefined;
        secondaryUrl?: string | undefined;
        wsUrl?: string | undefined;
        jitoHttpUrl?: string | undefined;
        jitoGrpcUrl?: string | undefined;
        jupiterBaseUrl?: string | undefined;
        httpHeaders?: Record<string, string> | undefined;
    }>;
    dataProviders: z.ZodObject<{
        neynarBaseUrl: z.ZodDefault<z.ZodString>;
        dexscreenerBaseUrl: z.ZodDefault<z.ZodString>;
        birdeyeBaseUrl: z.ZodDefault<z.ZodString>;
        blueskyJetstreamUrl: z.ZodDefault<z.ZodString>;
        gdeltPulseUrl: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        neynarBaseUrl: string;
        dexscreenerBaseUrl: string;
        birdeyeBaseUrl: string;
        blueskyJetstreamUrl: string;
        gdeltPulseUrl: string;
    }, {
        neynarBaseUrl?: string | undefined;
        dexscreenerBaseUrl?: string | undefined;
        birdeyeBaseUrl?: string | undefined;
        blueskyJetstreamUrl?: string | undefined;
        gdeltPulseUrl?: string | undefined;
    }>;
    providers: z.ZodDefault<z.ZodObject<{
        solanatracker: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            baseUrl: z.ZodDefault<z.ZodString>;
            pollSec: z.ZodDefault<z.ZodNumber>;
            ttlSec: z.ZodDefault<z.ZodNumber>;
            endpoints: z.ZodDefault<z.ZodObject<{
                trending: z.ZodDefault<z.ZodBoolean>;
                latest: z.ZodDefault<z.ZodBoolean>;
                launchpads: z.ZodDefault<z.ZodObject<{
                    pumpfun: z.ZodDefault<z.ZodBoolean>;
                    jupstudio: z.ZodDefault<z.ZodBoolean>;
                }, "strip", z.ZodTypeAny, {
                    pumpfun: boolean;
                    jupstudio: boolean;
                }, {
                    pumpfun?: boolean | undefined;
                    jupstudio?: boolean | undefined;
                }>>;
            }, "strip", z.ZodTypeAny, {
                trending: boolean;
                latest: boolean;
                launchpads: {
                    pumpfun: boolean;
                    jupstudio: boolean;
                };
            }, {
                trending?: boolean | undefined;
                latest?: boolean | undefined;
                launchpads?: {
                    pumpfun?: boolean | undefined;
                    jupstudio?: boolean | undefined;
                } | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            baseUrl: string;
            pollSec: number;
            ttlSec: number;
            endpoints: {
                trending: boolean;
                latest: boolean;
                launchpads: {
                    pumpfun: boolean;
                    jupstudio: boolean;
                };
            };
        }, {
            enabled?: boolean | undefined;
            baseUrl?: string | undefined;
            pollSec?: number | undefined;
            ttlSec?: number | undefined;
            endpoints?: {
                trending?: boolean | undefined;
                latest?: boolean | undefined;
                launchpads?: {
                    pumpfun?: boolean | undefined;
                    jupstudio?: boolean | undefined;
                } | undefined;
            } | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        solanatracker: {
            enabled: boolean;
            baseUrl: string;
            pollSec: number;
            ttlSec: number;
            endpoints: {
                trending: boolean;
                latest: boolean;
                launchpads: {
                    pumpfun: boolean;
                    jupstudio: boolean;
                };
            };
        };
    }, {
        solanatracker?: {
            enabled?: boolean | undefined;
            baseUrl?: string | undefined;
            pollSec?: number | undefined;
            ttlSec?: number | undefined;
            endpoints?: {
                trending?: boolean | undefined;
                latest?: boolean | undefined;
                launchpads?: {
                    pumpfun?: boolean | undefined;
                    jupstudio?: boolean | undefined;
                } | undefined;
            } | undefined;
        } | undefined;
    }>>;
    safety: z.ZodObject<{
        lpBurnThreshold: z.ZodDefault<z.ZodNumber>;
        holderTopCap: z.ZodDefault<z.ZodNumber>;
        lockerPrograms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        ignoreAccounts: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        candidateFeedUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        lpBurnThreshold: number;
        holderTopCap: number;
        lockerPrograms: string[];
        ignoreAccounts: string[];
        candidateFeedUrl?: string | null | undefined;
    }, {
        lpBurnThreshold?: number | undefined;
        holderTopCap?: number | undefined;
        lockerPrograms?: string[] | undefined;
        ignoreAccounts?: string[] | undefined;
        candidateFeedUrl?: string | null | undefined;
    }>;
    policy: z.ZodObject<{
        safeFeedUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        blockedFeedUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        contextWindowSec: z.ZodDefault<z.ZodNumber>;
        minConfidence: z.ZodDefault<z.ZodNumber>;
        dailyLossCapPct: z.ZodDefault<z.ZodNumber>;
        rewardSmoothing: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        contextWindowSec: number;
        minConfidence: number;
        dailyLossCapPct: number;
        rewardSmoothing: number;
        safeFeedUrl?: string | null | undefined;
        blockedFeedUrl?: string | null | undefined;
    }, {
        safeFeedUrl?: string | null | undefined;
        blockedFeedUrl?: string | null | undefined;
        contextWindowSec?: number | undefined;
        minConfidence?: number | undefined;
        dailyLossCapPct?: number | undefined;
        rewardSmoothing?: number | undefined;
    }>;
    caching: z.ZodObject<{
        dexscreenerPairsTtlSec: z.ZodDefault<z.ZodNumber>;
        dexscreenerTrendingTtlSec: z.ZodDefault<z.ZodNumber>;
        birdeyeMultiPriceTtlSec: z.ZodDefault<z.ZodNumber>;
        birdeyeTrendingTtlSec: z.ZodDefault<z.ZodNumber>;
        topicEmbeddingTtlSec: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        dexscreenerPairsTtlSec: number;
        dexscreenerTrendingTtlSec: number;
        birdeyeMultiPriceTtlSec: number;
        birdeyeTrendingTtlSec: number;
        topicEmbeddingTtlSec: number;
    }, {
        dexscreenerPairsTtlSec?: number | undefined;
        dexscreenerTrendingTtlSec?: number | undefined;
        birdeyeMultiPriceTtlSec?: number | undefined;
        birdeyeTrendingTtlSec?: number | undefined;
        topicEmbeddingTtlSec?: number | undefined;
    }>;
    alerts: z.ZodDefault<z.ZodObject<{
        telegramChatId: z.ZodOptional<z.ZodString>;
        pagerdutyRoutingKey: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        telegramChatId?: string | undefined;
        pagerdutyRoutingKey?: string | undefined;
    }, {
        telegramChatId?: string | undefined;
        pagerdutyRoutingKey?: string | undefined;
    }>>;
    persistence: z.ZodObject<{
        sqlitePath: z.ZodDefault<z.ZodString>;
        parquetDir: z.ZodDefault<z.ZodString>;
        parquetRollHours: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        sqlitePath: string;
        parquetDir: string;
        parquetRollHours: number;
    }, {
        sqlitePath?: string | undefined;
        parquetDir?: string | undefined;
        parquetRollHours?: number | undefined;
    }>;
    security: z.ZodDefault<z.ZodObject<{
        killSwitchToken: z.ZodOptional<z.ZodString>;
        allowRemoteKillSwitch: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        allowRemoteKillSwitch: boolean;
        killSwitchToken?: string | undefined;
    }, {
        killSwitchToken?: string | undefined;
        allowRemoteKillSwitch?: boolean | undefined;
    }>>;
    social: z.ZodObject<{
        neynar: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            watchFids: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
            keywords: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            pollIntervalSec: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            watchFids: number[];
            keywords: string[];
            pollIntervalSec: number;
        }, {
            enabled?: boolean | undefined;
            watchFids?: number[] | undefined;
            keywords?: string[] | undefined;
            pollIntervalSec?: number | undefined;
        }>;
        bluesky: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            cursorPath: z.ZodDefault<z.ZodString>;
            reconnectBackoffSec: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            cursorPath: string;
            reconnectBackoffSec: number;
        }, {
            enabled?: boolean | undefined;
            cursorPath?: string | undefined;
            reconnectBackoffSec?: number | undefined;
        }>;
        reddit: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            subreddits: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            pollIntervalSec: z.ZodDefault<z.ZodNumber>;
            appType: z.ZodDefault<z.ZodEnum<["installed", "web"]>>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            pollIntervalSec: number;
            subreddits: string[];
            appType: "installed" | "web";
        }, {
            enabled?: boolean | undefined;
            pollIntervalSec?: number | undefined;
            subreddits?: string[] | undefined;
            appType?: "installed" | "web" | undefined;
        }>;
        telegram: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            downloadDir: z.ZodDefault<z.ZodString>;
            pollIntervalSec: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            pollIntervalSec: number;
            channels: string[];
            downloadDir: string;
        }, {
            enabled?: boolean | undefined;
            pollIntervalSec?: number | undefined;
            channels?: string[] | undefined;
            downloadDir?: string | undefined;
        }>;
        gdelt: z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            pollIntervalSec: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            pollIntervalSec: number;
        }, {
            enabled?: boolean | undefined;
            pollIntervalSec?: number | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        neynar: {
            enabled: boolean;
            watchFids: number[];
            keywords: string[];
            pollIntervalSec: number;
        };
        bluesky: {
            enabled: boolean;
            cursorPath: string;
            reconnectBackoffSec: number;
        };
        reddit: {
            enabled: boolean;
            pollIntervalSec: number;
            subreddits: string[];
            appType: "installed" | "web";
        };
        telegram: {
            enabled: boolean;
            pollIntervalSec: number;
            channels: string[];
            downloadDir: string;
        };
        gdelt: {
            enabled: boolean;
            pollIntervalSec: number;
        };
    }, {
        neynar: {
            enabled?: boolean | undefined;
            watchFids?: number[] | undefined;
            keywords?: string[] | undefined;
            pollIntervalSec?: number | undefined;
        };
        bluesky: {
            enabled?: boolean | undefined;
            cursorPath?: string | undefined;
            reconnectBackoffSec?: number | undefined;
        };
        reddit: {
            enabled?: boolean | undefined;
            pollIntervalSec?: number | undefined;
            subreddits?: string[] | undefined;
            appType?: "installed" | "web" | undefined;
        };
        telegram: {
            enabled?: boolean | undefined;
            pollIntervalSec?: number | undefined;
            channels?: string[] | undefined;
            downloadDir?: string | undefined;
        };
        gdelt: {
            enabled?: boolean | undefined;
            pollIntervalSec?: number | undefined;
        };
    }>;
    lunarcrush: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        baseUrl: z.ZodDefault<z.ZodString>;
        pollSec: z.ZodDefault<z.ZodNumber>;
        endpoints: z.ZodDefault<z.ZodObject<{
            topics: z.ZodDefault<z.ZodString>;
            influencers: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            topics: string;
            influencers: string;
        }, {
            topics?: string | undefined;
            influencers?: string | undefined;
        }>>;
        sssBias: z.ZodDefault<z.ZodObject<{
            topicBoost: z.ZodDefault<z.ZodNumber>;
            influencerBoost: z.ZodDefault<z.ZodNumber>;
            maxBoost: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            topicBoost: number;
            influencerBoost: number;
            maxBoost: number;
        }, {
            topicBoost?: number | undefined;
            influencerBoost?: number | undefined;
            maxBoost?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        baseUrl: string;
        pollSec: number;
        endpoints: {
            topics: string;
            influencers: string;
        };
        sssBias: {
            topicBoost: number;
            influencerBoost: number;
            maxBoost: number;
        };
    }, {
        enabled?: boolean | undefined;
        baseUrl?: string | undefined;
        pollSec?: number | undefined;
        endpoints?: {
            topics?: string | undefined;
            influencers?: string | undefined;
        } | undefined;
        sssBias?: {
            topicBoost?: number | undefined;
            influencerBoost?: number | undefined;
            maxBoost?: number | undefined;
        } | undefined;
    }>>;
    priceUpdater: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        intervalMs: z.ZodDefault<z.ZodNumber>;
        staleWarnSec: z.ZodDefault<z.ZodNumber>;
        pythSolUsdPriceAccount: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        intervalMs: number;
        staleWarnSec: number;
        pythSolUsdPriceAccount: string;
    }, {
        enabled?: boolean | undefined;
        intervalMs?: number | undefined;
        staleWarnSec?: number | undefined;
        pythSolUsdPriceAccount?: string | undefined;
    }>>;
    featuresJob: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        intervalMs: z.ZodDefault<z.ZodNumber>;
        embedder: z.ZodDefault<z.ZodString>;
        lookbackHours: z.ZodDefault<z.ZodNumber>;
        minPostsPerAuthor: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        intervalMs: number;
        embedder: string;
        lookbackHours: number;
        minPostsPerAuthor: number;
    }, {
        enabled?: boolean | undefined;
        intervalMs?: number | undefined;
        embedder?: string | undefined;
        lookbackHours?: number | undefined;
        minPostsPerAuthor?: number | undefined;
    }>>;
    features: z.ZodDefault<z.ZodObject<{
        migrationWatcher: z.ZodDefault<z.ZodBoolean>;
        rugGuard: z.ZodDefault<z.ZodBoolean>;
        alphaRanker: z.ZodDefault<z.ZodBoolean>;
        fillNet: z.ZodDefault<z.ZodBoolean>;
        feeBandit: z.ZodDefault<z.ZodBoolean>;
        constrainedSizing: z.ZodDefault<z.ZodBoolean>;
        survivalStops: z.ZodDefault<z.ZodBoolean>;
        offlinePolicyShadow: z.ZodDefault<z.ZodBoolean>;
        jitoEnabled: z.ZodDefault<z.ZodBoolean>;
        parquetExport: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        migrationWatcher: boolean;
        rugGuard: boolean;
        alphaRanker: boolean;
        fillNet: boolean;
        feeBandit: boolean;
        constrainedSizing: boolean;
        survivalStops: boolean;
        offlinePolicyShadow: boolean;
        jitoEnabled: boolean;
        parquetExport: boolean;
    }, {
        migrationWatcher?: boolean | undefined;
        rugGuard?: boolean | undefined;
        alphaRanker?: boolean | undefined;
        fillNet?: boolean | undefined;
        feeBandit?: boolean | undefined;
        constrainedSizing?: boolean | undefined;
        survivalStops?: boolean | undefined;
        offlinePolicyShadow?: boolean | undefined;
        jitoEnabled?: boolean | undefined;
        parquetExport?: boolean | undefined;
    }>>;
    addresses: z.ZodDefault<z.ZodObject<{
        pumpfunProgram: z.ZodDefault<z.ZodString>;
        pumpswapProgram: z.ZodDefault<z.ZodString>;
        raydiumAmmV4: z.ZodDefault<z.ZodString>;
        raydiumCpmm: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        pumpfunProgram: string;
        pumpswapProgram: string;
        raydiumAmmV4: string;
        raydiumCpmm: string;
    }, {
        pumpfunProgram?: string | undefined;
        pumpswapProgram?: string | undefined;
        raydiumAmmV4?: string | undefined;
        raydiumCpmm?: string | undefined;
    }>>;
    execution: z.ZodDefault<z.ZodObject<{
        tipStrategy: z.ZodDefault<z.ZodEnum<["auto", "manual"]>>;
        computeUnitPriceMode: z.ZodDefault<z.ZodEnum<["auto_oracle", "manual"]>>;
        simpleMode: z.ZodDefault<z.ZodBoolean>;
        jitoEnabled: z.ZodDefault<z.ZodBoolean>;
        secondaryRpcEnabled: z.ZodDefault<z.ZodBoolean>;
        wsEnabled: z.ZodDefault<z.ZodBoolean>;
        feeArms: z.ZodDefault<z.ZodArray<z.ZodObject<{
            cuPrice: z.ZodNumber;
            slippageBps: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            slippageBps: number;
            cuPrice: number;
        }, {
            slippageBps: number;
            cuPrice: number;
        }>, "many">>;
        minFillProb: z.ZodDefault<z.ZodNumber>;
        maxSlipBps: z.ZodDefault<z.ZodNumber>;
        routeRetryMs: z.ZodDefault<z.ZodNumber>;
        blockhashStaleMs: z.ZodDefault<z.ZodNumber>;
        migrationPreset: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            durationMs: z.ZodDefault<z.ZodNumber>;
            cuPriceBump: z.ZodDefault<z.ZodNumber>;
            minSlippageBps: z.ZodDefault<z.ZodNumber>;
            decayMs: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            durationMs: number;
            cuPriceBump: number;
            minSlippageBps: number;
            decayMs: number;
        }, {
            enabled?: boolean | undefined;
            durationMs?: number | undefined;
            cuPriceBump?: number | undefined;
            minSlippageBps?: number | undefined;
            decayMs?: number | undefined;
        }>>;
        routeQuarantine: z.ZodDefault<z.ZodObject<{
            windowMinutes: z.ZodDefault<z.ZodNumber>;
            minAttempts: z.ZodDefault<z.ZodNumber>;
            failRateThreshold: z.ZodDefault<z.ZodNumber>;
            slipExcessWeight: z.ZodDefault<z.ZodNumber>;
            failRateWeight: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            windowMinutes: number;
            minAttempts: number;
            failRateThreshold: number;
            slipExcessWeight: number;
            failRateWeight: number;
        }, {
            windowMinutes?: number | undefined;
            minAttempts?: number | undefined;
            failRateThreshold?: number | undefined;
            slipExcessWeight?: number | undefined;
            failRateWeight?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        jitoEnabled: boolean;
        tipStrategy: "auto" | "manual";
        computeUnitPriceMode: "manual" | "auto_oracle";
        simpleMode: boolean;
        secondaryRpcEnabled: boolean;
        wsEnabled: boolean;
        feeArms: {
            slippageBps: number;
            cuPrice: number;
        }[];
        minFillProb: number;
        maxSlipBps: number;
        routeRetryMs: number;
        blockhashStaleMs: number;
        migrationPreset: {
            enabled: boolean;
            durationMs: number;
            cuPriceBump: number;
            minSlippageBps: number;
            decayMs: number;
        };
        routeQuarantine: {
            windowMinutes: number;
            minAttempts: number;
            failRateThreshold: number;
            slipExcessWeight: number;
            failRateWeight: number;
        };
    }, {
        jitoEnabled?: boolean | undefined;
        tipStrategy?: "auto" | "manual" | undefined;
        computeUnitPriceMode?: "manual" | "auto_oracle" | undefined;
        simpleMode?: boolean | undefined;
        secondaryRpcEnabled?: boolean | undefined;
        wsEnabled?: boolean | undefined;
        feeArms?: {
            slippageBps: number;
            cuPrice: number;
        }[] | undefined;
        minFillProb?: number | undefined;
        maxSlipBps?: number | undefined;
        routeRetryMs?: number | undefined;
        blockhashStaleMs?: number | undefined;
        migrationPreset?: {
            enabled?: boolean | undefined;
            durationMs?: number | undefined;
            cuPriceBump?: number | undefined;
            minSlippageBps?: number | undefined;
            decayMs?: number | undefined;
        } | undefined;
        routeQuarantine?: {
            windowMinutes?: number | undefined;
            minAttempts?: number | undefined;
            failRateThreshold?: number | undefined;
            slipExcessWeight?: number | undefined;
            failRateWeight?: number | undefined;
        } | undefined;
    }>>;
    jito: z.ZodDefault<z.ZodObject<{
        tipLamportsMin: z.ZodDefault<z.ZodNumber>;
        tipLamportsMax: z.ZodDefault<z.ZodNumber>;
        bundleUrl: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        tipLamportsMin: number;
        tipLamportsMax: number;
        bundleUrl: string;
    }, {
        tipLamportsMin?: number | undefined;
        tipLamportsMax?: number | undefined;
        bundleUrl?: string | undefined;
    }>>;
    sizing: z.ZodDefault<z.ZodObject<{
        baseUnitUsd: z.ZodDefault<z.ZodNumber>;
        arms: z.ZodDefault<z.ZodArray<z.ZodObject<{
            type: z.ZodEnum<["equity_frac"]>;
            value: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            value: number;
            type: "equity_frac";
        }, {
            value: number;
            type: "equity_frac";
        }>, "many">>;
        dailyLossCapUsd: z.ZodDefault<z.ZodNumber>;
        perMintCapUsd: z.ZodDefault<z.ZodNumber>;
        coolOffL: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        baseUnitUsd: number;
        arms: {
            value: number;
            type: "equity_frac";
        }[];
        dailyLossCapUsd: number;
        perMintCapUsd: number;
        coolOffL: number;
    }, {
        baseUnitUsd?: number | undefined;
        arms?: {
            value: number;
            type: "equity_frac";
        }[] | undefined;
        dailyLossCapUsd?: number | undefined;
        perMintCapUsd?: number | undefined;
        coolOffL?: number | undefined;
    }>>;
    survival: z.ZodDefault<z.ZodObject<{
        baseTrailBps: z.ZodDefault<z.ZodNumber>;
        minTrailBps: z.ZodDefault<z.ZodNumber>;
        maxTrailBps: z.ZodDefault<z.ZodNumber>;
        hardStopMaxLossBps: z.ZodDefault<z.ZodNumber>;
        ladderLevels: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
        hazardTighten: z.ZodDefault<z.ZodNumber>;
        hazardPanic: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        baseTrailBps: number;
        minTrailBps: number;
        maxTrailBps: number;
        hardStopMaxLossBps: number;
        ladderLevels: number[];
        hazardTighten: number;
        hazardPanic: number;
    }, {
        baseTrailBps?: number | undefined;
        minTrailBps?: number | undefined;
        maxTrailBps?: number | undefined;
        hardStopMaxLossBps?: number | undefined;
        ladderLevels?: number[] | undefined;
        hazardTighten?: number | undefined;
        hazardPanic?: number | undefined;
    }>>;
    shadow: z.ZodDefault<z.ZodObject<{
        fee: z.ZodDefault<z.ZodObject<{
            method: z.ZodDefault<z.ZodString>;
            probFloor: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            method: string;
            probFloor: number;
        }, {
            method?: string | undefined;
            probFloor?: number | undefined;
        }>>;
        sizing: z.ZodDefault<z.ZodObject<{
            method: z.ZodDefault<z.ZodString>;
            probFloor: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            method: string;
            probFloor: number;
        }, {
            method?: string | undefined;
            probFloor?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        sizing: {
            method: string;
            probFloor: number;
        };
        fee: {
            method: string;
            probFloor: number;
        };
    }, {
        sizing?: {
            method?: string | undefined;
            probFloor?: number | undefined;
        } | undefined;
        fee?: {
            method?: string | undefined;
            probFloor?: number | undefined;
        } | undefined;
    }>>;
    leaderWallets: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        watchMinutes: z.ZodDefault<z.ZodNumber>;
        minHitsForBoost: z.ZodDefault<z.ZodNumber>;
        scoreHalfLifeDays: z.ZodDefault<z.ZodNumber>;
        rankBoost: z.ZodDefault<z.ZodNumber>;
        sizeTierBoost: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        watchMinutes: number;
        minHitsForBoost: number;
        scoreHalfLifeDays: number;
        rankBoost: number;
        sizeTierBoost: number;
    }, {
        enabled?: boolean | undefined;
        watchMinutes?: number | undefined;
        minHitsForBoost?: number | undefined;
        scoreHalfLifeDays?: number | undefined;
        rankBoost?: number | undefined;
        sizeTierBoost?: number | undefined;
    }>>;
    alpha: z.ZodDefault<z.ZodObject<{
        horizons: z.ZodDefault<z.ZodArray<z.ZodEnum<["10m", "60m", "24h"]>, "many">>;
        topK: z.ZodDefault<z.ZodNumber>;
        minScore: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        horizons: ("10m" | "60m" | "24h")[];
        topK: number;
        minScore: number;
    }, {
        horizons?: ("10m" | "60m" | "24h")[] | undefined;
        topK?: number | undefined;
        minScore?: number | undefined;
    }>>;
    fillnet: z.ZodDefault<z.ZodObject<{
        modelPath: z.ZodDefault<z.ZodString>;
        minFillProb: z.ZodDefault<z.ZodNumber>;
        maxSlipBps: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        minFillProb: number;
        maxSlipBps: number;
        modelPath: string;
    }, {
        minFillProb?: number | undefined;
        maxSlipBps?: number | undefined;
        modelPath?: string | undefined;
    }>>;
    pnl: z.ZodDefault<z.ZodObject<{
        useUsd: z.ZodDefault<z.ZodBoolean>;
        solPriceSource: z.ZodDefault<z.ZodEnum<["birdeye"]>>;
        includePriorityFee: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        useUsd: boolean;
        solPriceSource: "birdeye";
        includePriorityFee: boolean;
    }, {
        useUsd?: boolean | undefined;
        solPriceSource?: "birdeye" | undefined;
        includePriorityFee?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    mode: "SIM" | "SHADOW" | "SEMI" | "FULL";
    logging: {
        level: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
        json: boolean;
    };
    services: {
        agentCore: {
            port: number;
        };
        executor: {
            port: number;
        };
        uiGateway: {
            port: number;
        };
        socialIngestor: {
            port: number;
        };
        onchainDiscovery: {
            port: number;
        };
        safetyEngine: {
            port: number;
        };
        policyEngine: {
            port: number;
        };
        positionManager: {
            port: number;
        };
        narrativeMiner: {
            port: number;
        };
        migrationWatcher: {
            port: number;
        };
        leaderWallets: {
            port: number;
        };
        metrics: {
            port: number;
        };
    };
    leaderWallets: {
        enabled: boolean;
        watchMinutes: number;
        minHitsForBoost: number;
        scoreHalfLifeDays: number;
        rankBoost: number;
        sizeTierBoost: number;
    };
    gating: {
        sssMin: number;
        lpMinSol: number;
        buysSellRatioMin: number;
        uniquesMin: number;
        minPoolAgeSec: number;
        maxSpreadBps: number;
    };
    watchWindows: {
        durationSec: number;
        refreshIntervalSec: number;
        decayHalfLifeSec: number;
    };
    topics: {
        cluster: {
            lshBands: number;
            lshRows: number;
            minCosine: number;
            mergeMinObservations: number;
        };
        scoring: {
            openThreshold: number;
            sustainThreshold: number;
            recencyHalfLifeSec: number;
            noveltyEpsilon: number;
        };
        phrase: {
            minLength: number;
            maxLength: number;
            stopwords: string[];
        };
        matching: {
            minCosine: number;
            minTrieScore: number;
            boostSymbolMatch: number;
            coolDownSec: number;
        };
        baseline: {
            halfLifeSec: number;
            flushIntervalSec: number;
        };
        test: {
            enabled: boolean;
            seed?: number | undefined;
            vectorizerModule?: string | undefined;
        };
    };
    ladders: {
        takeProfits: number[];
        multiplierPercents: number[];
        trailActivatePct: number;
        trailPct: number;
        hardStopLossPct: number;
    };
    bandit: {
        rewardHorizonMinutes: number;
        updateIntervalSec: number;
        epsilonFloor: number;
        bundles: {
            id: string;
            label: string;
            gate: "strict" | "normal" | "loose";
            slippageBps: number;
            tipPercentile: "p25" | "p50" | "p75" | "p90";
            sizeMultiplier: number;
            notes?: string | undefined;
        }[];
    };
    wallet: {
        reservesSol: number;
        dailySpendCapSol: number;
        autoSkimProfitSol: number;
        perNameCapFraction: number;
        perNameCapMaxSol: number;
        lpImpactCapFraction: number;
        flowCapFraction: number;
        equityTiers: {
            minEquity: number;
            maxEquity: number | null;
            riskFraction: number;
        }[];
        concurrencyCap: number;
        concurrencyScaler: {
            base: number;
            max: number;
            recoveryMinutes: number;
        };
    };
    rpc: {
        primaryUrl: string;
        secondaryUrl: string;
        wsUrl: string;
        jitoHttpUrl: string;
        jitoGrpcUrl: string;
        jupiterBaseUrl: string;
        httpHeaders: Record<string, string>;
    };
    dataProviders: {
        neynarBaseUrl: string;
        dexscreenerBaseUrl: string;
        birdeyeBaseUrl: string;
        blueskyJetstreamUrl: string;
        gdeltPulseUrl: string;
    };
    providers: {
        solanatracker: {
            enabled: boolean;
            baseUrl: string;
            pollSec: number;
            ttlSec: number;
            endpoints: {
                trending: boolean;
                latest: boolean;
                launchpads: {
                    pumpfun: boolean;
                    jupstudio: boolean;
                };
            };
        };
    };
    safety: {
        lpBurnThreshold: number;
        holderTopCap: number;
        lockerPrograms: string[];
        ignoreAccounts: string[];
        candidateFeedUrl?: string | null | undefined;
    };
    policy: {
        contextWindowSec: number;
        minConfidence: number;
        dailyLossCapPct: number;
        rewardSmoothing: number;
        safeFeedUrl?: string | null | undefined;
        blockedFeedUrl?: string | null | undefined;
    };
    caching: {
        dexscreenerPairsTtlSec: number;
        dexscreenerTrendingTtlSec: number;
        birdeyeMultiPriceTtlSec: number;
        birdeyeTrendingTtlSec: number;
        topicEmbeddingTtlSec: number;
    };
    alerts: {
        telegramChatId?: string | undefined;
        pagerdutyRoutingKey?: string | undefined;
    };
    persistence: {
        sqlitePath: string;
        parquetDir: string;
        parquetRollHours: number;
    };
    security: {
        allowRemoteKillSwitch: boolean;
        killSwitchToken?: string | undefined;
    };
    social: {
        neynar: {
            enabled: boolean;
            watchFids: number[];
            keywords: string[];
            pollIntervalSec: number;
        };
        bluesky: {
            enabled: boolean;
            cursorPath: string;
            reconnectBackoffSec: number;
        };
        reddit: {
            enabled: boolean;
            pollIntervalSec: number;
            subreddits: string[];
            appType: "installed" | "web";
        };
        telegram: {
            enabled: boolean;
            pollIntervalSec: number;
            channels: string[];
            downloadDir: string;
        };
        gdelt: {
            enabled: boolean;
            pollIntervalSec: number;
        };
    };
    lunarcrush: {
        enabled: boolean;
        baseUrl: string;
        pollSec: number;
        endpoints: {
            topics: string;
            influencers: string;
        };
        sssBias: {
            topicBoost: number;
            influencerBoost: number;
            maxBoost: number;
        };
    };
    priceUpdater: {
        enabled: boolean;
        intervalMs: number;
        staleWarnSec: number;
        pythSolUsdPriceAccount: string;
    };
    featuresJob: {
        enabled: boolean;
        intervalMs: number;
        embedder: string;
        lookbackHours: number;
        minPostsPerAuthor: number;
    };
    features: {
        migrationWatcher: boolean;
        rugGuard: boolean;
        alphaRanker: boolean;
        fillNet: boolean;
        feeBandit: boolean;
        constrainedSizing: boolean;
        survivalStops: boolean;
        offlinePolicyShadow: boolean;
        jitoEnabled: boolean;
        parquetExport: boolean;
    };
    addresses: {
        pumpfunProgram: string;
        pumpswapProgram: string;
        raydiumAmmV4: string;
        raydiumCpmm: string;
    };
    execution: {
        jitoEnabled: boolean;
        tipStrategy: "auto" | "manual";
        computeUnitPriceMode: "manual" | "auto_oracle";
        simpleMode: boolean;
        secondaryRpcEnabled: boolean;
        wsEnabled: boolean;
        feeArms: {
            slippageBps: number;
            cuPrice: number;
        }[];
        minFillProb: number;
        maxSlipBps: number;
        routeRetryMs: number;
        blockhashStaleMs: number;
        migrationPreset: {
            enabled: boolean;
            durationMs: number;
            cuPriceBump: number;
            minSlippageBps: number;
            decayMs: number;
        };
        routeQuarantine: {
            windowMinutes: number;
            minAttempts: number;
            failRateThreshold: number;
            slipExcessWeight: number;
            failRateWeight: number;
        };
    };
    jito: {
        tipLamportsMin: number;
        tipLamportsMax: number;
        bundleUrl: string;
    };
    sizing: {
        baseUnitUsd: number;
        arms: {
            value: number;
            type: "equity_frac";
        }[];
        dailyLossCapUsd: number;
        perMintCapUsd: number;
        coolOffL: number;
    };
    survival: {
        baseTrailBps: number;
        minTrailBps: number;
        maxTrailBps: number;
        hardStopMaxLossBps: number;
        ladderLevels: number[];
        hazardTighten: number;
        hazardPanic: number;
    };
    shadow: {
        sizing: {
            method: string;
            probFloor: number;
        };
        fee: {
            method: string;
            probFloor: number;
        };
    };
    alpha: {
        horizons: ("10m" | "60m" | "24h")[];
        topK: number;
        minScore: number;
    };
    fillnet: {
        minFillProb: number;
        maxSlipBps: number;
        modelPath: string;
    };
    pnl: {
        useUsd: boolean;
        solPriceSource: "birdeye";
        includePriorityFee: boolean;
    };
}, {
    services: {
        agentCore?: {
            port: number;
        } | undefined;
        executor?: {
            port: number;
        } | undefined;
        uiGateway?: {
            port: number;
        } | undefined;
        socialIngestor?: {
            port: number;
        } | undefined;
        onchainDiscovery?: {
            port: number;
        } | undefined;
        safetyEngine?: {
            port: number;
        } | undefined;
        policyEngine?: {
            port: number;
        } | undefined;
        positionManager?: {
            port: number;
        } | undefined;
        narrativeMiner?: {
            port: number;
        } | undefined;
        migrationWatcher?: {
            port: number;
        } | undefined;
        leaderWallets?: {
            port: number;
        } | undefined;
        metrics?: {
            port: number;
        } | undefined;
    };
    gating: {
        sssMin?: number | undefined;
        lpMinSol?: number | undefined;
        buysSellRatioMin?: number | undefined;
        uniquesMin?: number | undefined;
        minPoolAgeSec?: number | undefined;
        maxSpreadBps?: number | undefined;
    };
    watchWindows: {
        durationSec?: number | undefined;
        refreshIntervalSec?: number | undefined;
        decayHalfLifeSec?: number | undefined;
    };
    topics: {
        cluster: {
            lshBands?: number | undefined;
            lshRows?: number | undefined;
            minCosine?: number | undefined;
            mergeMinObservations?: number | undefined;
        };
        scoring: {
            openThreshold?: number | undefined;
            sustainThreshold?: number | undefined;
            recencyHalfLifeSec?: number | undefined;
            noveltyEpsilon?: number | undefined;
        };
        phrase: {
            minLength?: number | undefined;
            maxLength?: number | undefined;
            stopwords?: string[] | undefined;
        };
        matching: {
            minCosine?: number | undefined;
            minTrieScore?: number | undefined;
            boostSymbolMatch?: number | undefined;
            coolDownSec?: number | undefined;
        };
        baseline: {
            halfLifeSec?: number | undefined;
            flushIntervalSec?: number | undefined;
        };
        test?: {
            enabled?: boolean | undefined;
            seed?: number | undefined;
            vectorizerModule?: string | undefined;
        } | undefined;
    };
    ladders: {
        takeProfits?: number[] | undefined;
        multiplierPercents?: number[] | undefined;
        trailActivatePct?: number | undefined;
        trailPct?: number | undefined;
        hardStopLossPct?: number | undefined;
    };
    bandit: {
        bundles: {
            id: string;
            label: string;
            gate: "strict" | "normal" | "loose";
            slippageBps: number;
            tipPercentile: "p25" | "p50" | "p75" | "p90";
            sizeMultiplier: number;
            notes?: string | undefined;
        }[];
        rewardHorizonMinutes?: number | undefined;
        updateIntervalSec?: number | undefined;
        epsilonFloor?: number | undefined;
    };
    wallet: {
        equityTiers: {
            minEquity: number;
            maxEquity: number | null;
            riskFraction: number;
        }[];
        reservesSol?: number | undefined;
        dailySpendCapSol?: number | undefined;
        autoSkimProfitSol?: number | undefined;
        perNameCapFraction?: number | undefined;
        perNameCapMaxSol?: number | undefined;
        lpImpactCapFraction?: number | undefined;
        flowCapFraction?: number | undefined;
        concurrencyCap?: number | undefined;
        concurrencyScaler?: {
            base: number;
            max: number;
            recoveryMinutes: number;
        } | undefined;
    };
    rpc: {
        primaryUrl?: string | undefined;
        secondaryUrl?: string | undefined;
        wsUrl?: string | undefined;
        jitoHttpUrl?: string | undefined;
        jitoGrpcUrl?: string | undefined;
        jupiterBaseUrl?: string | undefined;
        httpHeaders?: Record<string, string> | undefined;
    };
    dataProviders: {
        neynarBaseUrl?: string | undefined;
        dexscreenerBaseUrl?: string | undefined;
        birdeyeBaseUrl?: string | undefined;
        blueskyJetstreamUrl?: string | undefined;
        gdeltPulseUrl?: string | undefined;
    };
    safety: {
        lpBurnThreshold?: number | undefined;
        holderTopCap?: number | undefined;
        lockerPrograms?: string[] | undefined;
        ignoreAccounts?: string[] | undefined;
        candidateFeedUrl?: string | null | undefined;
    };
    policy: {
        safeFeedUrl?: string | null | undefined;
        blockedFeedUrl?: string | null | undefined;
        contextWindowSec?: number | undefined;
        minConfidence?: number | undefined;
        dailyLossCapPct?: number | undefined;
        rewardSmoothing?: number | undefined;
    };
    caching: {
        dexscreenerPairsTtlSec?: number | undefined;
        dexscreenerTrendingTtlSec?: number | undefined;
        birdeyeMultiPriceTtlSec?: number | undefined;
        birdeyeTrendingTtlSec?: number | undefined;
        topicEmbeddingTtlSec?: number | undefined;
    };
    persistence: {
        sqlitePath?: string | undefined;
        parquetDir?: string | undefined;
        parquetRollHours?: number | undefined;
    };
    social: {
        neynar: {
            enabled?: boolean | undefined;
            watchFids?: number[] | undefined;
            keywords?: string[] | undefined;
            pollIntervalSec?: number | undefined;
        };
        bluesky: {
            enabled?: boolean | undefined;
            cursorPath?: string | undefined;
            reconnectBackoffSec?: number | undefined;
        };
        reddit: {
            enabled?: boolean | undefined;
            pollIntervalSec?: number | undefined;
            subreddits?: string[] | undefined;
            appType?: "installed" | "web" | undefined;
        };
        telegram: {
            enabled?: boolean | undefined;
            pollIntervalSec?: number | undefined;
            channels?: string[] | undefined;
            downloadDir?: string | undefined;
        };
        gdelt: {
            enabled?: boolean | undefined;
            pollIntervalSec?: number | undefined;
        };
    };
    mode?: "SIM" | "SHADOW" | "SEMI" | "FULL" | undefined;
    logging?: {
        level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | undefined;
        json?: boolean | undefined;
    } | undefined;
    leaderWallets?: {
        enabled?: boolean | undefined;
        watchMinutes?: number | undefined;
        minHitsForBoost?: number | undefined;
        scoreHalfLifeDays?: number | undefined;
        rankBoost?: number | undefined;
        sizeTierBoost?: number | undefined;
    } | undefined;
    providers?: {
        solanatracker?: {
            enabled?: boolean | undefined;
            baseUrl?: string | undefined;
            pollSec?: number | undefined;
            ttlSec?: number | undefined;
            endpoints?: {
                trending?: boolean | undefined;
                latest?: boolean | undefined;
                launchpads?: {
                    pumpfun?: boolean | undefined;
                    jupstudio?: boolean | undefined;
                } | undefined;
            } | undefined;
        } | undefined;
    } | undefined;
    alerts?: {
        telegramChatId?: string | undefined;
        pagerdutyRoutingKey?: string | undefined;
    } | undefined;
    security?: {
        killSwitchToken?: string | undefined;
        allowRemoteKillSwitch?: boolean | undefined;
    } | undefined;
    lunarcrush?: {
        enabled?: boolean | undefined;
        baseUrl?: string | undefined;
        pollSec?: number | undefined;
        endpoints?: {
            topics?: string | undefined;
            influencers?: string | undefined;
        } | undefined;
        sssBias?: {
            topicBoost?: number | undefined;
            influencerBoost?: number | undefined;
            maxBoost?: number | undefined;
        } | undefined;
    } | undefined;
    priceUpdater?: {
        enabled?: boolean | undefined;
        intervalMs?: number | undefined;
        staleWarnSec?: number | undefined;
        pythSolUsdPriceAccount?: string | undefined;
    } | undefined;
    featuresJob?: {
        enabled?: boolean | undefined;
        intervalMs?: number | undefined;
        embedder?: string | undefined;
        lookbackHours?: number | undefined;
        minPostsPerAuthor?: number | undefined;
    } | undefined;
    features?: {
        migrationWatcher?: boolean | undefined;
        rugGuard?: boolean | undefined;
        alphaRanker?: boolean | undefined;
        fillNet?: boolean | undefined;
        feeBandit?: boolean | undefined;
        constrainedSizing?: boolean | undefined;
        survivalStops?: boolean | undefined;
        offlinePolicyShadow?: boolean | undefined;
        jitoEnabled?: boolean | undefined;
        parquetExport?: boolean | undefined;
    } | undefined;
    addresses?: {
        pumpfunProgram?: string | undefined;
        pumpswapProgram?: string | undefined;
        raydiumAmmV4?: string | undefined;
        raydiumCpmm?: string | undefined;
    } | undefined;
    execution?: {
        jitoEnabled?: boolean | undefined;
        tipStrategy?: "auto" | "manual" | undefined;
        computeUnitPriceMode?: "manual" | "auto_oracle" | undefined;
        simpleMode?: boolean | undefined;
        secondaryRpcEnabled?: boolean | undefined;
        wsEnabled?: boolean | undefined;
        feeArms?: {
            slippageBps: number;
            cuPrice: number;
        }[] | undefined;
        minFillProb?: number | undefined;
        maxSlipBps?: number | undefined;
        routeRetryMs?: number | undefined;
        blockhashStaleMs?: number | undefined;
        migrationPreset?: {
            enabled?: boolean | undefined;
            durationMs?: number | undefined;
            cuPriceBump?: number | undefined;
            minSlippageBps?: number | undefined;
            decayMs?: number | undefined;
        } | undefined;
        routeQuarantine?: {
            windowMinutes?: number | undefined;
            minAttempts?: number | undefined;
            failRateThreshold?: number | undefined;
            slipExcessWeight?: number | undefined;
            failRateWeight?: number | undefined;
        } | undefined;
    } | undefined;
    jito?: {
        tipLamportsMin?: number | undefined;
        tipLamportsMax?: number | undefined;
        bundleUrl?: string | undefined;
    } | undefined;
    sizing?: {
        baseUnitUsd?: number | undefined;
        arms?: {
            value: number;
            type: "equity_frac";
        }[] | undefined;
        dailyLossCapUsd?: number | undefined;
        perMintCapUsd?: number | undefined;
        coolOffL?: number | undefined;
    } | undefined;
    survival?: {
        baseTrailBps?: number | undefined;
        minTrailBps?: number | undefined;
        maxTrailBps?: number | undefined;
        hardStopMaxLossBps?: number | undefined;
        ladderLevels?: number[] | undefined;
        hazardTighten?: number | undefined;
        hazardPanic?: number | undefined;
    } | undefined;
    shadow?: {
        sizing?: {
            method?: string | undefined;
            probFloor?: number | undefined;
        } | undefined;
        fee?: {
            method?: string | undefined;
            probFloor?: number | undefined;
        } | undefined;
    } | undefined;
    alpha?: {
        horizons?: ("10m" | "60m" | "24h")[] | undefined;
        topK?: number | undefined;
        minScore?: number | undefined;
    } | undefined;
    fillnet?: {
        minFillProb?: number | undefined;
        maxSlipBps?: number | undefined;
        modelPath?: string | undefined;
    } | undefined;
    pnl?: {
        useUsd?: boolean | undefined;
        solPriceSource?: "birdeye" | undefined;
        includePriorityFee?: boolean | undefined;
    } | undefined;
}>;
export type TrenchesConfig = z.infer<typeof configSchema>;
