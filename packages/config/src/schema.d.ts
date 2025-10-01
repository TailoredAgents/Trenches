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
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        pollIntervalSec: number;
        subreddits: string[];
    }, {
        enabled?: boolean | undefined;
        pollIntervalSec?: number | undefined;
        subreddits?: string[] | undefined;
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
    bluesky: {
        enabled: boolean;
        cursorPath: string;
        reconnectBackoffSec: number;
    };
    reddit: {
        enabled: boolean;
        pollIntervalSec: number;
        subreddits: string[];
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
    neynar: {
        enabled: boolean;
        watchFids: number[];
        keywords: string[];
        pollIntervalSec: number;
    };
}, {
    bluesky: {
        enabled?: boolean | undefined;
        cursorPath?: string | undefined;
        reconnectBackoffSec?: number | undefined;
    };
    reddit: {
        enabled?: boolean | undefined;
        pollIntervalSec?: number | undefined;
        subreddits?: string[] | undefined;
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
    neynar: {
        enabled?: boolean | undefined;
        watchFids?: number[] | undefined;
        keywords?: string[] | undefined;
        pollIntervalSec?: number | undefined;
    };
}>;
export declare const configSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["SIM", "SHADOW", "SEMI", "FULL"]>>;
    logging: z.ZodDefault<z.ZodObject<{
        level: z.ZodDefault<z.ZodEnum<["fatal", "error", "warn", "info", "debug", "trace"]>>;
        json: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        level: "info" | "warn" | "error" | "fatal" | "debug" | "trace";
        json: boolean;
    }, {
        level?: "info" | "warn" | "error" | "fatal" | "debug" | "trace" | undefined;
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
        metrics?: {
            port: number;
        } | undefined;
    }>;
    gating: z.ZodObject<{
        sssMin: z.ZodDefault<z.ZodNumber>;
        ocrsMin: z.ZodDefault<z.ZodNumber>;
        lpMinSol: z.ZodDefault<z.ZodNumber>;
        buysSellRatioMin: z.ZodDefault<z.ZodNumber>;
        uniquesMin: z.ZodDefault<z.ZodNumber>;
        minPoolAgeSec: z.ZodDefault<z.ZodNumber>;
        maxSpreadBps: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        sssMin: number;
        ocrsMin: number;
        lpMinSol: number;
        buysSellRatioMin: number;
        uniquesMin: number;
        minPoolAgeSec: number;
        maxSpreadBps: number;
    }, {
        sssMin?: number | undefined;
        ocrsMin?: number | undefined;
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
    }, "strip", z.ZodTypeAny, {
        primaryUrl: string;
        secondaryUrl: string;
        wsUrl: string;
        jitoHttpUrl: string;
        jitoGrpcUrl: string;
        jupiterBaseUrl: string;
    }, {
        primaryUrl?: string | undefined;
        secondaryUrl?: string | undefined;
        wsUrl?: string | undefined;
        jitoHttpUrl?: string | undefined;
        jitoGrpcUrl?: string | undefined;
        jupiterBaseUrl?: string | undefined;
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
    safety: z.ZodObject<{
        lpBurnThreshold: z.ZodDefault<z.ZodNumber>;
        holderTopCap: z.ZodDefault<z.ZodNumber>;
        lockerPrograms: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        ignoreAccounts: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        candidateFeedUrl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        lpBurnThreshold: number;
        holderTopCap: number;
        lockerPrograms: string[];
        ignoreAccounts: string[];
        candidateFeedUrl?: string | undefined;
    }, {
        lpBurnThreshold?: number | undefined;
        holderTopCap?: number | undefined;
        lockerPrograms?: string[] | undefined;
        ignoreAccounts?: string[] | undefined;
        candidateFeedUrl?: string | undefined;
    }>;
    policy: z.ZodObject<{
        safeFeedUrl: z.ZodOptional<z.ZodString>;
        blockedFeedUrl: z.ZodOptional<z.ZodString>;
        contextWindowSec: z.ZodDefault<z.ZodNumber>;
        minOcrs: z.ZodDefault<z.ZodNumber>;
        minConfidence: z.ZodDefault<z.ZodNumber>;
        dailyLossCapPct: z.ZodDefault<z.ZodNumber>;
        rewardSmoothing: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        contextWindowSec: number;
        minOcrs: number;
        minConfidence: number;
        dailyLossCapPct: number;
        rewardSmoothing: number;
        safeFeedUrl?: string | undefined;
        blockedFeedUrl?: string | undefined;
    }, {
        safeFeedUrl?: string | undefined;
        blockedFeedUrl?: string | undefined;
        contextWindowSec?: number | undefined;
        minOcrs?: number | undefined;
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
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            pollIntervalSec: number;
            subreddits: string[];
        }, {
            enabled?: boolean | undefined;
            pollIntervalSec?: number | undefined;
            subreddits?: string[] | undefined;
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
        bluesky: {
            enabled: boolean;
            cursorPath: string;
            reconnectBackoffSec: number;
        };
        reddit: {
            enabled: boolean;
            pollIntervalSec: number;
            subreddits: string[];
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
        neynar: {
            enabled: boolean;
            watchFids: number[];
            keywords: string[];
            pollIntervalSec: number;
        };
    }, {
        bluesky: {
            enabled?: boolean | undefined;
            cursorPath?: string | undefined;
            reconnectBackoffSec?: number | undefined;
        };
        reddit: {
            enabled?: boolean | undefined;
            pollIntervalSec?: number | undefined;
            subreddits?: string[] | undefined;
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
        neynar: {
            enabled?: boolean | undefined;
            watchFids?: number[] | undefined;
            keywords?: string[] | undefined;
            pollIntervalSec?: number | undefined;
        };
    }>;
}, "strip", z.ZodTypeAny, {
    mode: "SIM" | "SHADOW" | "SEMI" | "FULL";
    logging: {
        level: "info" | "warn" | "error" | "fatal" | "debug" | "trace";
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
        metrics: {
            port: number;
        };
    };
    gating: {
        sssMin: number;
        ocrsMin: number;
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
    };
    dataProviders: {
        neynarBaseUrl: string;
        dexscreenerBaseUrl: string;
        birdeyeBaseUrl: string;
        blueskyJetstreamUrl: string;
        gdeltPulseUrl: string;
    };
    safety: {
        lpBurnThreshold: number;
        holderTopCap: number;
        lockerPrograms: string[];
        ignoreAccounts: string[];
        candidateFeedUrl?: string | undefined;
    };
    policy: {
        contextWindowSec: number;
        minOcrs: number;
        minConfidence: number;
        dailyLossCapPct: number;
        rewardSmoothing: number;
        safeFeedUrl?: string | undefined;
        blockedFeedUrl?: string | undefined;
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
        bluesky: {
            enabled: boolean;
            cursorPath: string;
            reconnectBackoffSec: number;
        };
        reddit: {
            enabled: boolean;
            pollIntervalSec: number;
            subreddits: string[];
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
        neynar: {
            enabled: boolean;
            watchFids: number[];
            keywords: string[];
            pollIntervalSec: number;
        };
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
        metrics?: {
            port: number;
        } | undefined;
    };
    gating: {
        sssMin?: number | undefined;
        ocrsMin?: number | undefined;
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
        candidateFeedUrl?: string | undefined;
    };
    policy: {
        safeFeedUrl?: string | undefined;
        blockedFeedUrl?: string | undefined;
        contextWindowSec?: number | undefined;
        minOcrs?: number | undefined;
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
        bluesky: {
            enabled?: boolean | undefined;
            cursorPath?: string | undefined;
            reconnectBackoffSec?: number | undefined;
        };
        reddit: {
            enabled?: boolean | undefined;
            pollIntervalSec?: number | undefined;
            subreddits?: string[] | undefined;
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
        neynar: {
            enabled?: boolean | undefined;
            watchFids?: number[] | undefined;
            keywords?: string[] | undefined;
            pollIntervalSec?: number | undefined;
        };
    };
    mode?: "SIM" | "SHADOW" | "SEMI" | "FULL" | undefined;
    logging?: {
        level?: "info" | "warn" | "error" | "fatal" | "debug" | "trace" | undefined;
        json?: boolean | undefined;
    } | undefined;
    alerts?: {
        telegramChatId?: string | undefined;
        pagerdutyRoutingKey?: string | undefined;
    } | undefined;
    security?: {
        killSwitchToken?: string | undefined;
        allowRemoteKillSwitch?: boolean | undefined;
    } | undefined;
}>;
export type TrenchesConfig = z.infer<typeof configSchema>;
//# sourceMappingURL=schema.d.ts.map
