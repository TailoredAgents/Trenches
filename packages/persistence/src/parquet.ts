import fs from 'fs';
import path from 'path';
import { ParquetWriter, ParquetSchema } from 'parquetjs-lite';
import { getConfig } from '@trenches/config';
import { createLogger } from '@trenches/logger';

const logger = createLogger('parquet');

const candidateSchema = new ParquetSchema({
  mint: { type: 'UTF8' },
  name: { type: 'UTF8', optional: true },
  symbol: { type: 'UTF8', optional: true },
  source: { type: 'UTF8' },
  lpSol: { type: 'DOUBLE' },
  ageSec: { type: 'INT64' },
  buys60: { type: 'INT64' },
  sells60: { type: 'INT64' },
  uniques60: { type: 'INT64' },
  spreadBps: { type: 'DOUBLE' },
  safetyOk: { type: 'BOOLEAN' },  topicId: { type: 'UTF8', optional: true },
  matchScore: { type: 'DOUBLE', optional: true },
  poolAddress: { type: 'UTF8', optional: true },
  lpMint: { type: 'UTF8', optional: true },
  poolCoinAccount: { type: 'UTF8', optional: true },
  poolPcAccount: { type: 'UTF8', optional: true },
  createdAt: { type: 'UTF8' }
});

const tradeSchema = new ParquetSchema({
  mint: { type: 'UTF8' },
  signature: { type: 'UTF8' },
  price: { type: 'DOUBLE' },
  quantity: { type: 'DOUBLE' },
  route: { type: 'UTF8' },
  tipLamports: { type: 'INT64' },
  slot: { type: 'INT64' },
  pnl: { type: 'DOUBLE', optional: true },
  createdAt: { type: 'UTF8' }
});

const policyActionSchema = new ParquetSchema({
  mint: { type: 'UTF8' },
  bundleId: { type: 'UTF8' },
  gate: { type: 'UTF8' },
  sizeSol: { type: 'DOUBLE' },
  slippageBps: { type: 'INT64' },
  jitoTipLamports: { type: 'INT64' },
  congestion: { type: 'UTF8' },
  reward: { type: 'DOUBLE', optional: true },
  createdAt: { type: 'UTF8' }
});

const topicSchema = new ParquetSchema({
  topicId: { type: 'UTF8' },
  label: { type: 'UTF8' },
  sss: { type: 'DOUBLE' },
  decayedSss: { type: 'DOUBLE' },
  novelty: { type: 'DOUBLE' },
  windowSec: { type: 'INT64' },
  sources: { type: 'UTF8' },
  phrases: { type: 'UTF8' },
  addedPhrases: { type: 'UTF8' },
  centroid: { type: 'UTF8' },
  createdAt: { type: 'UTF8' }
});

const topicWindowSchema = new ParquetSchema({
  windowId: { type: 'UTF8' },
  topicId: { type: 'UTF8' },
  openedAt: { type: 'UTF8' },
  expiresAt: { type: 'UTF8' },
  lastRefresh: { type: 'UTF8' },
  sss: { type: 'DOUBLE' },
  novelty: { type: 'DOUBLE' }
});

const topicMatchSchema = new ParquetSchema({
  topicId: { type: 'UTF8' },
  mint: { type: 'UTF8' },
  matchScore: { type: 'DOUBLE' },
  matchedAt: { type: 'UTF8' },
  source: { type: 'UTF8' }
});
type SchemaName = 'candidates' | 'trades' | 'policy_actions' | 'topics' | 'topic_windows' | 'topic_matches';

type SchemaConfig = {
  prefix: string;
  schema: any;
};

const schemaConfigs: Record<SchemaName, SchemaConfig> = {
  candidates: { prefix: 'candidates', schema: candidateSchema },
  trades: { prefix: 'trades', schema: tradeSchema },
  policy_actions: { prefix: 'policy_actions', schema: policyActionSchema },
  topics: { prefix: 'topics', schema: topicSchema },
  topic_windows: { prefix: 'topic_windows', schema: topicWindowSchema },
  topic_matches: { prefix: 'topic_matches', schema: topicMatchSchema }
};

class RotatingParquetWriter<T extends Record<string, any>> {
  private writer: any = null;
  private readonly prefix: string;
  private readonly schema: any;
  private readonly rollMs: number;
  private currentWindowStart: number | null = null;
  private pending: Promise<void> = Promise.resolve();

  constructor(config: SchemaConfig, rollHours: number) {
    this.prefix = config.prefix;
    this.schema = config.schema;
    this.rollMs = rollHours * 60 * 60 * 1000;
  }

  async append(record: T): Promise<void> {
    this.pending = this.pending.then(async () => {
      await this.ensureWriter();
      if (!this.writer) {
        logger.warn({ prefix: this.prefix }, 'parquet writer missing despite ensureWriter');
        return;
      }
      await this.writer.appendRow(record);
    });
    return this.pending;
  }

  private async ensureWriter(): Promise<void> {
    const now = Date.now();
    const windowStart = this.currentWindowStart ?? this.computeWindowStart(now);
    if (!this.writer || now - windowStart >= this.rollMs) {
      await this.rotate(now);
    }
  }

  private computeWindowStart(timestamp: number): number {
    const bucket = Math.floor(timestamp / this.rollMs);
    return bucket * this.rollMs;
  }

  private async rotate(now: number): Promise<void> {
    if (this.writer) {
      await this.writer.close();
      this.writer = null;
    }
    const cfg = getConfig();
    const baseDir = cfg.persistence.parquetDir;
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    const windowStart = this.computeWindowStart(now);
    const timestamp = new Date(windowStart).toISOString().replace(/[:]/g, '-');
    const filePath = path.join(baseDir, `${this.prefix}_${timestamp}.parquet`);
    this.writer = await ParquetWriter.openFile(this.schema as any, filePath);
    this.currentWindowStart = windowStart;
    logger.info({ filePath }, 'rotated parquet writer');
  }

  async shutdown(): Promise<void> {
    await this.pending;
    if (this.writer) {
      await this.writer.close();
      this.writer = null;
    }
  }
}

const writers: Partial<Record<SchemaName, RotatingParquetWriter<any>>> = {};

function getWriter(name: SchemaName): RotatingParquetWriter<any> {
  const cfg = getConfig();
  if (!writers[name]) {
    writers[name] = new RotatingParquetWriter(schemaConfigs[name], cfg.persistence.parquetRollHours);
  }
  return writers[name]!;
}

export async function appendCandidateParquet(record: {
  mint: string;
  name?: string;
  symbol?: string;
  source: string;
  lpSol: number;
  ageSec: number;
  buys60: number;
  sells60: number;
  uniques60: number;
  spreadBps: number;
  safetyOk: boolean;
  topicId?: string;
  matchScore?: number;
  poolAddress?: string;
  lpMint?: string;
  poolCoinAccount?: string;
  poolPcAccount?: string;
  createdAt: string;
}) {
  await getWriter('candidates').append(record);
}

export async function appendTradeParquet(record: {
  mint: string;
  signature: string;
  price: number;
  quantity: number;
  route: string;
  tipLamports: number;
  slot: number;
  pnl?: number;
  createdAt: string;
}) {
  await getWriter('trades').append(record);
}

export async function appendPolicyActionParquet(record: {
  mint: string;
  bundleId: string;
  gate: string;
  sizeSol: number;
  slippageBps: number;
  jitoTipLamports: number;
  congestion: string;
  reward?: number;
  createdAt: string;
}) {
  await getWriter('policy_actions').append(record);
}


export async function appendTopicParquet(record: {
  topicId: string;
  label: string;
  sss: number;
  decayedSss: number;
  novelty: number;
  windowSec: number;
  sources: string[];
  phrases: string[];
  addedPhrases: string[];
  centroid: number[];
  createdAt: string;
}) {
  await getWriter('topics').append({
    topicId: record.topicId,
    label: record.label,
    sss: record.sss,
    decayedSss: record.decayedSss,
    novelty: record.novelty,
    windowSec: record.windowSec,
    sources: JSON.stringify(record.sources),
    phrases: JSON.stringify(record.phrases),
    addedPhrases: JSON.stringify(record.addedPhrases),
    centroid: JSON.stringify(record.centroid),
    createdAt: record.createdAt
  });
}

export async function appendTopicWindowParquet(record: {
  windowId: string;
  topicId: string;
  openedAt: string;
  expiresAt: string;
  lastRefresh: string;
  sss: number;
  novelty: number;
}) {
  await getWriter('topic_windows').append({
    windowId: record.windowId,
    topicId: record.topicId,
    openedAt: record.openedAt,
    expiresAt: record.expiresAt,
    lastRefresh: record.lastRefresh,
    sss: record.sss,
    novelty: record.novelty
  });
}

export async function appendTopicMatchParquet(record: {
  topicId: string;
  mint: string;
  matchScore: number;
  matchedAt: string;
  source: string;
}) {
  await getWriter('topic_matches').append({
    topicId: record.topicId,
    mint: record.mint,
    matchScore: record.matchScore,
    matchedAt: record.matchedAt,
    source: record.source
  });
}export async function shutdownParquetWriters() {
  await Promise.all(Object.values(writers).map((writer) => writer?.shutdown() ?? Promise.resolve()));
}


