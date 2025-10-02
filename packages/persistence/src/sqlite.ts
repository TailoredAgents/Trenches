import fs from 'fs';

import path from 'path';

import DatabaseConstructor from 'better-sqlite3';

import { getConfig } from '@trenches/config';

import { createLogger } from '@trenches/logger';

import { SocialPost, TopicEvent, TokenCandidate, TradeEvent } from '@trenches/shared';

import { createWriteQueue } from './writeQueue';



const logger = createLogger('sqlite');



type Migration = {

  id: string;

  statements: string[];

};



const MIGRATIONS: Migration[] = [

  {

    id: '0001_init',

    statements: [

      `CREATE TABLE IF NOT EXISTS migrations (

        id TEXT PRIMARY KEY,

        applied_at TEXT NOT NULL DEFAULT (datetime('now'))

      );`,

      `CREATE TABLE IF NOT EXISTS topics (

        topic_id TEXT PRIMARY KEY,

        label TEXT NOT NULL,

        sss REAL NOT NULL,

        novelty REAL NOT NULL,

        window_sec INTEGER NOT NULL,

        sources TEXT NOT NULL,

        created_at TEXT NOT NULL DEFAULT (datetime('now'))

      );`,

      `CREATE TABLE IF NOT EXISTS candidates (

        mint TEXT PRIMARY KEY,

        name TEXT,

        symbol TEXT,

        source TEXT NOT NULL,

        age_sec INTEGER NOT NULL,

        lp_sol REAL NOT NULL,

        buys60 INTEGER NOT NULL,

        sells60 INTEGER NOT NULL,

        uniques60 INTEGER NOT NULL,

        spread_bps REAL NOT NULL,

        safety_ok INTEGER NOT NULL,

        safety_reasons TEXT NOT NULL,

        ocrs REAL NOT NULL,

        topic_id TEXT,

        match_score REAL,

        first_seen_slot INTEGER,

        created_at TEXT NOT NULL DEFAULT (datetime('now')),

        updated_at TEXT NOT NULL DEFAULT (datetime('now'))

      );`,

      `CREATE TABLE IF NOT EXISTS orders (

        id TEXT PRIMARY KEY,

        mint TEXT NOT NULL,

        gate TEXT NOT NULL,

        size_sol REAL NOT NULL,

        slippage_bps INTEGER NOT NULL,

        jito_tip_lamports INTEGER NOT NULL,

        compute_unit_price INTEGER,

        route TEXT NOT NULL,

        status TEXT NOT NULL,

        created_at TEXT NOT NULL DEFAULT (datetime('now')),

        updated_at TEXT NOT NULL DEFAULT (datetime('now'))

      );`,

      `CREATE TABLE IF NOT EXISTS fills (

        signature TEXT PRIMARY KEY,

        mint TEXT NOT NULL,

        price REAL NOT NULL,

        quantity REAL NOT NULL,

        route TEXT NOT NULL,

        tip_lamports INTEGER NOT NULL,

        slot INTEGER NOT NULL,

        created_at TEXT NOT NULL DEFAULT (datetime('now'))

      );`,

      `CREATE TABLE IF NOT EXISTS positions (

        mint TEXT PRIMARY KEY,

        quantity REAL NOT NULL,

        average_price REAL NOT NULL,

        realized_pnl REAL NOT NULL DEFAULT 0,

        unrealized_pnl REAL NOT NULL DEFAULT 0,

        state TEXT NOT NULL,

        ladder_hits TEXT NOT NULL,

        trail_active INTEGER NOT NULL DEFAULT 0,

        created_at TEXT NOT NULL DEFAULT (datetime('now')),

        updated_at TEXT NOT NULL DEFAULT (datetime('now'))

      );`,

      `CREATE TABLE IF NOT EXISTS events (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        event_type TEXT NOT NULL,

        payload TEXT NOT NULL,

        created_at TEXT NOT NULL DEFAULT (datetime('now'))

      );`,

      `CREATE TABLE IF NOT EXISTS sizing_decisions (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        mint TEXT,

        equity REAL NOT NULL,

        free REAL NOT NULL,

        tier TEXT NOT NULL,

        caps TEXT NOT NULL,

        final_size REAL NOT NULL,

        reason TEXT NOT NULL,

        created_at TEXT NOT NULL DEFAULT (datetime('now'))

      );`,

      `CREATE TABLE IF NOT EXISTS heartbeats (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        component TEXT NOT NULL,

        status TEXT NOT NULL,

        message TEXT,

        created_at TEXT NOT NULL DEFAULT (datetime('now'))

      );`,

      `CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON candidates(created_at);`,

      `CREATE INDEX IF NOT EXISTS idx_orders_mint ON orders(mint);`,

      `CREATE INDEX IF NOT EXISTS idx_fills_mint ON fills(mint);`,

      `CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);`,

      `CREATE INDEX IF NOT EXISTS idx_sizing_created_at ON sizing_decisions(created_at);`,

      `CREATE INDEX IF NOT EXISTS idx_heartbeats_component ON heartbeats(component);`

    ]

  },

  {

    id: '0002_social_posts',

    statements: [

      `CREATE TABLE IF NOT EXISTS social_posts (

        id TEXT PRIMARY KEY,

        platform TEXT NOT NULL,

        author_id TEXT NOT NULL,

        author_handle TEXT,

        text TEXT NOT NULL,

        lang TEXT,

        link TEXT,

        published_at TEXT NOT NULL,

        captured_at TEXT NOT NULL,

        topics TEXT,

        tags TEXT,

        engagement TEXT,

        source TEXT NOT NULL,

        raw TEXT NOT NULL

      );`,

      `CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(platform);`,

      `CREATE INDEX IF NOT EXISTS idx_social_posts_published_at ON social_posts(published_at);`

    ]

  },

  {

    id: '0003_candidate_enrichment',

    statements: [

      `ALTER TABLE candidates ADD COLUMN pool_address TEXT;`,

      `ALTER TABLE candidates ADD COLUMN lp_mint TEXT;`,

      `ALTER TABLE candidates ADD COLUMN pool_coin_account TEXT;`,

      `ALTER TABLE candidates ADD COLUMN pool_pc_account TEXT;`

    ]
  },

  {

    id: '0004_policy_engine',

    statements: [

      `CREATE TABLE IF NOT EXISTS policy_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_id TEXT NOT NULL,
        mint TEXT NOT NULL,
        context TEXT NOT NULL,
        parameters TEXT NOT NULL,
        reward REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`,
      `CREATE INDEX IF NOT EXISTS idx_policy_actions_mint ON policy_actions(mint);`,
      `CREATE TABLE IF NOT EXISTS bandit_state (
        action_id TEXT PRIMARY KEY,
        ainv TEXT NOT NULL,
        b TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`
    ]

  },

  {

    id: '0005_orders_enrich',

    statements: [

      `ALTER TABLE orders ADD COLUMN side TEXT DEFAULT 'buy';`,
      `ALTER TABLE orders ADD COLUMN token_amount INTEGER;`,
      `ALTER TABLE orders ADD COLUMN expected_sol REAL;`
    ]

  },

  {

    id: '0006_narrative_miner',

    statements: [

      `CREATE TABLE IF NOT EXISTS topic_clusters (
        topic_id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        centroid_json TEXT NOT NULL,
        phrases TEXT NOT NULL,
        sss REAL NOT NULL,
        novelty REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );`,

      `CREATE INDEX IF NOT EXISTS idx_topic_clusters_updated_at ON topic_clusters(updated_at);`,

      `CREATE TABLE IF NOT EXISTS topic_windows (
        window_id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        opened_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_refresh TEXT NOT NULL,
        sss REAL NOT NULL,
        novelty REAL NOT NULL,
        FOREIGN KEY (topic_id) REFERENCES topic_clusters(topic_id)
      );`,

      `CREATE INDEX IF NOT EXISTS idx_topic_windows_topic ON topic_windows(topic_id);`,

      `CREATE INDEX IF NOT EXISTS idx_topic_windows_expires ON topic_windows(expires_at);`,

      `CREATE TABLE IF NOT EXISTS topic_matches (
        id TEXT PRIMARY KEY,
        topic_id TEXT NOT NULL,
        mint TEXT NOT NULL,
        match_score REAL NOT NULL,
        matched_at TEXT NOT NULL,
        source TEXT NOT NULL,
        FOREIGN KEY (topic_id) REFERENCES topic_clusters(topic_id)
      );`,

      `CREATE INDEX IF NOT EXISTS idx_topic_matches_topic ON topic_matches(topic_id);`,

      `CREATE INDEX IF NOT EXISTS idx_topic_matches_mint ON topic_matches(mint);`,

      `CREATE TABLE IF NOT EXISTS phrase_baseline (
        phrase TEXT PRIMARY KEY,
        count REAL NOT NULL,
        engagement REAL NOT NULL,
        authors REAL NOT NULL,
        updated_at TEXT NOT NULL
      );`

    ]

  },

  {

    id: '0007_topic_metadata',

    statements: [

      `ALTER TABLE topics ADD COLUMN decayed_sss REAL DEFAULT 0;`,

      `ALTER TABLE topics ADD COLUMN cluster_phrases TEXT;`,

      `ALTER TABLE topics ADD COLUMN cluster_added TEXT;`,

      `ALTER TABLE topics ADD COLUMN cluster_centroid TEXT;`

    ]

  }

];
// Phase A migration: PVP upgrade tables
MIGRATIONS.push({
  id: '0008_pvp_phase_a',
  statements: [
    `CREATE TABLE IF NOT EXISTS migration_events (
      ts INTEGER NOT NULL,
      mint TEXT NOT NULL,
      pool TEXT NOT NULL,
      source TEXT NOT NULL,
      init_sig TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_migration_events_mint_ts ON migration_events(mint, ts);`,
    `CREATE TABLE IF NOT EXISTS scores (
      ts INTEGER NOT NULL,
      mint TEXT NOT NULL,
      horizon TEXT NOT NULL,
      score REAL NOT NULL,
      features_json TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_scores_mint_horizon_ts ON scores(mint, horizon, ts);`,
    `CREATE TABLE IF NOT EXISTS rug_verdicts (
      ts INTEGER NOT NULL,
      mint TEXT NOT NULL,
      rug_prob REAL NOT NULL,
      reasons_json TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_rug_verdicts_mint_ts ON rug_verdicts(mint, ts);`
  ]
});

MIGRATIONS.push({
  id: '0009_pvp_phase_b',
  statements: [
    `CREATE TABLE IF NOT EXISTS fill_preds(
      ts INTEGER NOT NULL,
      route TEXT NOT NULL,
      p_fill REAL NOT NULL,
      exp_slip_bps REAL NOT NULL,
      exp_time_ms INTEGER NOT NULL,
      ctx_json TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_fill_preds_route_ts ON fill_preds(route, ts);`,
    `CREATE TABLE IF NOT EXISTS fee_decisions(
      ts INTEGER NOT NULL,
      cu_price INTEGER NOT NULL,
      cu_limit INTEGER NOT NULL,
      slippage_bps INTEGER NOT NULL,
      ctx_json TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_fee_decisions_ts ON fee_decisions(ts);`,
    `CREATE TABLE IF NOT EXISTS exec_outcomes(
      ts INTEGER NOT NULL,
      quote_price REAL NOT NULL,
      exec_price REAL,
      filled INTEGER NOT NULL,
      route TEXT,
      cu_price INTEGER,
      slippage_bps_req INTEGER,
      slippage_bps_real REAL,
      time_to_land_ms INTEGER,
      error_code TEXT,
      notes TEXT
    );`,
    `CREATE INDEX IF NOT EXISTS idx_exec_outcomes_ts ON exec_outcomes(ts);`
  ]
});

MIGRATIONS.push({
  id: '0010_pvp_phase_c',
  statements: [
    `CREATE TABLE IF NOT EXISTS hazard_states(
      ts INTEGER NOT NULL,
      mint TEXT NOT NULL,
      hazard REAL NOT NULL,
      trail_bps INTEGER NOT NULL,
      ladder_json TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_hazard_states_mint_ts ON hazard_states(mint, ts);`,
    `ALTER TABLE sizing_decisions ADD COLUMN ts INTEGER;`,
    `ALTER TABLE sizing_decisions ADD COLUMN arm TEXT;`,
    `ALTER TABLE sizing_decisions ADD COLUMN notional REAL;`,
    `ALTER TABLE sizing_decisions ADD COLUMN ctx_json TEXT;`,
    `CREATE INDEX IF NOT EXISTS idx_sizing_decisions_mint_ts ON sizing_decisions(mint, ts);`,
    `CREATE TABLE IF NOT EXISTS sizing_outcomes(
      ts INTEGER NOT NULL,
      mint TEXT NOT NULL,
      notional REAL NOT NULL,
      pnl_usd REAL NOT NULL,
      mae_bps REAL NOT NULL,
      closed INTEGER NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_sizing_outcomes_ts ON sizing_outcomes(ts);`
  ]
});

MIGRATIONS.push({
  id: '0011_pvp_phase_d',
  statements: [
    `CREATE TABLE IF NOT EXISTS backtest_runs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_ts INTEGER NOT NULL,
      finished_ts INTEGER,
      params_json TEXT NOT NULL,
      notes TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS backtest_results(
      run_id INTEGER NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      segment TEXT,
      PRIMARY KEY(run_id, metric, segment)
    );`,
    `CREATE TABLE IF NOT EXISTS shadow_decisions_fee(
      ts INTEGER NOT NULL,
      mint TEXT NOT NULL,
      chosen_arm INTEGER NOT NULL,
      baseline_arm INTEGER,
      delta_reward_est REAL,
      ctx_json TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_shadow_fee_ts ON shadow_decisions_fee(ts);`,
    `CREATE TABLE IF NOT EXISTS shadow_decisions_sizing(
      ts INTEGER NOT NULL,
      mint TEXT NOT NULL,
      chosen_arm TEXT NOT NULL,
      baseline_arm TEXT,
      delta_reward_est REAL,
      ctx_json TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_shadow_sizing_ts ON shadow_decisions_sizing(ts);`
  ]
});

MIGRATIONS.push({
  id: '0012_pvp_phase_e',
  statements: [
    `CREATE TABLE IF NOT EXISTS prices (
      ts INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      usd REAL NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_prices_symbol_ts ON prices(symbol, ts);`,
    `ALTER TABLE exec_outcomes ADD COLUMN priority_fee_lamports INTEGER;`,
    `ALTER TABLE exec_outcomes ADD COLUMN amount_in INTEGER;`,
    `ALTER TABLE exec_outcomes ADD COLUMN amount_out INTEGER;`,
    `ALTER TABLE exec_outcomes ADD COLUMN fee_lamports_total INTEGER;`
  ]
});



let db: DatabaseConstructor.Database | null = null;

const candidateWriteQueue = createWriteQueue('candidates');


function ensureDataDir(filePath: string) {

  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {

    fs.mkdirSync(dir, { recursive: true });

  }

}



function openDb(): DatabaseConstructor.Database {

  const cfg = getConfig();

  ensureDataDir(cfg.persistence.sqlitePath);

  const instance = new DatabaseConstructor(cfg.persistence.sqlitePath, { timeout: 5000 });

  instance.pragma('journal_mode = WAL');
  instance.pragma('synchronous = NORMAL');
  instance.pragma('temp_store = MEMORY');
  try { instance.pragma('mmap_size = 268435456'); } catch { /* optional */ }
  instance.pragma('foreign_keys = ON');

  return instance;

}



function runMigrations(instance: DatabaseConstructor.Database) {

  instance.exec("CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);");

  const appliedStmt = instance.prepare('SELECT id FROM migrations WHERE id = ?');

  const migrationInsertSql = "INSERT INTO migrations (id, applied_at) VALUES (?, CURRENT_TIMESTAMP)";
  const insertStmt = instance.prepare(migrationInsertSql);

  for (const migration of MIGRATIONS) {

    const alreadyApplied = appliedStmt.get(migration.id);

    if (alreadyApplied) {

      continue;

    }

    const transaction = instance.transaction(() => {

      for (const statement of migration.statements) {

        instance.exec(statement);

      }

      insertStmt.run(migration.id);

    });

    transaction();

    logger.info({ migration: migration.id }, 'applied sqlite migration');

  }

}



export function getDb(): DatabaseConstructor.Database {

  if (!db) {

    db = openDb();

    runMigrations(db);

  }

  return db;

}



export function withTransaction<T>(fn: (trx: DatabaseConstructor.Database) => T): T {

  const database = getDb();

  const trx = database.transaction(() => fn(database));

  return trx();

}



export function recordHeartbeat(component: string, status: string, message?: string) {

  const database = getDb();

  database

    .prepare('INSERT INTO heartbeats (component, status, message) VALUES (?, ?, ?)')

    .run(component, status, message ?? null);

}



export function storeTopicEvent(event: TopicEvent) {



  const database = getDb();



  database



    .prepare(`INSERT INTO topics (topic_id, label, sss, decayed_sss, novelty, window_sec, sources, cluster_phrases, cluster_added, cluster_centroid)



              VALUES (@topicId, @label, @sss, @decayedSss, @novelty, @windowSec, @sources, @phrases, @added, @centroid)



              ON CONFLICT(topic_id) DO UPDATE SET



                label = excluded.label,



                sss = excluded.sss,



                decayed_sss = excluded.decayed_sss,



                novelty = excluded.novelty,



                window_sec = excluded.window_sec,



                sources = excluded.sources,



                cluster_phrases = excluded.cluster_phrases,



                cluster_added = excluded.cluster_added,



                cluster_centroid = excluded.cluster_centroid`)



    .run({



      topicId: event.topicId,



      label: event.label,



      sss: event.sss,



      decayedSss: event.decayedSss ?? event.sss,



      novelty: event.novelty,



      windowSec: event.windowSec,



      sources: JSON.stringify(event.sources),



      phrases: JSON.stringify(event.cluster?.phrases ?? []),



      added: JSON.stringify(event.cluster?.addedPhrases ?? []),



      centroid: JSON.stringify(event.cluster?.centroid ?? [])



    });



}



export type TopicClusterRecord = {
  topicId: string;
  label: string;
  centroid: number[];
  phrases: string[];
  sss: number;
  novelty: number;
  updatedAt: string;
};

export function upsertTopicCluster(cluster: TopicClusterRecord): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO topic_clusters (topic_id, label, centroid_json, phrases, sss, novelty)
              VALUES (@topicId, @label, @centroidJson, @phrases, @sss, @novelty)
              ON CONFLICT(topic_id) DO UPDATE SET
                label = excluded.label,
                centroid_json = excluded.centroid_json,
                phrases = excluded.phrases,
                sss = excluded.sss,
                novelty = excluded.novelty,
                updated_at = datetime('now')`)
    .run({
      topicId: cluster.topicId,
      label: cluster.label,
      centroidJson: JSON.stringify(cluster.centroid),
      phrases: JSON.stringify(cluster.phrases),
      sss: cluster.sss,
      novelty: cluster.novelty
    });
}

export function fetchTopicClusters(): TopicClusterRecord[] {
  const database = getDb();
  const rows = database
    .prepare(`SELECT topic_id, label, centroid_json, phrases, sss, novelty, updated_at FROM topic_clusters ORDER BY updated_at DESC`)
    .all() as Array<{
      topic_id: string;
      label: string;
      centroid_json: string | null;
      phrases: string | null;
      sss: number;
      novelty: number;
      updated_at: string;
    }>;
  return rows.map((row) => ({
    topicId: row.topic_id,
    label: row.label,
    centroid: safeParseNumberArray(row.centroid_json),
    phrases: safeParseArray(row.phrases),
    sss: row.sss ?? 0,
    novelty: row.novelty ?? 0,
    updatedAt: row.updated_at
  }));
}

export type TopicWindowRecord = {
  windowId: string;
  topicId: string;
  openedAt: string;
  expiresAt: string;
  lastRefresh: string;
  sss: number;
  novelty: number;
};

export function upsertTopicWindow(window: TopicWindowRecord): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO topic_windows (window_id, topic_id, opened_at, expires_at, last_refresh, sss, novelty)
              VALUES (@windowId, @topicId, @openedAt, @expiresAt, @lastRefresh, @sss, @novelty)
              ON CONFLICT(window_id) DO UPDATE SET
                topic_id = excluded.topic_id,
                opened_at = excluded.opened_at,
                expires_at = excluded.expires_at,
                last_refresh = excluded.last_refresh,
                sss = excluded.sss,
                novelty = excluded.novelty`)
    .run(window);
}

export function removeTopicWindow(windowId: string): void {
  const database = getDb();
  database.prepare('DELETE FROM topic_windows WHERE window_id = ?').run(windowId);
}

export function fetchTopicWindows(): TopicWindowRecord[] {
  const database = getDb();
  const rows = database
    .prepare(`SELECT window_id, topic_id, opened_at, expires_at, last_refresh, sss, novelty FROM topic_windows`)
    .all() as Array<{
      window_id: string;
      topic_id: string;
      opened_at: string;
      expires_at: string;
      last_refresh: string;
      sss: number;
      novelty: number;
    }>;
  return rows.map((row) => ({
    windowId: row.window_id,
    topicId: row.topic_id,
    openedAt: row.opened_at,
    expiresAt: row.expires_at,
    lastRefresh: row.last_refresh,
    sss: row.sss ?? 0,
    novelty: row.novelty ?? 0
  }));
}

export function fetchActiveTopicWindows(referenceIso: string): TopicWindowRecord[] {
  const database = getDb();
  const rows = database
    .prepare(`SELECT window_id, topic_id, opened_at, expires_at, last_refresh, sss, novelty
              FROM topic_windows
              WHERE expires_at > @reference
              ORDER BY expires_at ASC`)
    .all({ reference: referenceIso }) as Array<{
      window_id: string;
      topic_id: string;
      opened_at: string;
      expires_at: string;
      last_refresh: string;
      sss: number;
      novelty: number;
    }>;
  return rows.map((row) => ({
    windowId: row.window_id,
    topicId: row.topic_id,
    openedAt: row.opened_at,
    expiresAt: row.expires_at,
    lastRefresh: row.last_refresh,
    sss: row.sss ?? 0,
    novelty: row.novelty ?? 0
  }));
}

export function recordTopicMatch(match: { id: string; topicId: string; mint: string; matchScore: number; matchedAt: string; source: string }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO topic_matches (id, topic_id, mint, match_score, matched_at, source)
              VALUES (@id, @topicId, @mint, @matchScore, @matchedAt, @source)
              ON CONFLICT(id) DO UPDATE SET
                topic_id = excluded.topic_id,
                mint = excluded.mint,
                match_score = excluded.match_score,
                matched_at = excluded.matched_at,
                source = excluded.source`)
    .run(match);
}

export type PhraseBaselineRow = {
  phrase: string;
  count: number;
  engagement: number;
  authors: number;
  updatedAt: string;
};

export function loadPhraseBaseline(): PhraseBaselineRow[] {
  const database = getDb();
  const rows = database
    .prepare(`SELECT phrase, count, engagement, authors, updated_at FROM phrase_baseline`)
    .all() as Array<{ phrase: string; count: number; engagement: number; authors: number; updated_at: string }>;
  return rows.map((row) => ({
    phrase: row.phrase,
    count: row.count ?? 0,
    engagement: row.engagement ?? 0,
    authors: row.authors ?? 0,
    updatedAt: row.updated_at
  }));
}

export function upsertPhraseBaseline(entry: PhraseBaselineRow): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO phrase_baseline (phrase, count, engagement, authors, updated_at)
              VALUES (@phrase, @count, @engagement, @authors, @updatedAt)
              ON CONFLICT(phrase) DO UPDATE SET
                count = excluded.count,
                engagement = excluded.engagement,
                authors = excluded.authors,
                updated_at = excluded.updated_at`)
    .run(entry);
}





export function storeTokenCandidate(candidate: TokenCandidate) {
  candidateWriteQueue.push(() => {
    const database = getDb();
    database
      .prepare(`INSERT INTO candidates (mint, name, symbol, source, age_sec, lp_sol, buys60, sells60, uniques60, spread_bps, safety_ok, safety_reasons, ocrs, topic_id, match_score, pool_address, lp_mint, pool_coin_account, pool_pc_account)
              VALUES (@mint, @name, @symbol, @source, @ageSec, @lpSol, @buys60, @sells60, @uniques60, @spreadBps, @safetyOk, @safetyReasons, @ocrs, @topicId, @matchScore, @poolAddress, @lpMint, @poolCoinAccount, @poolPcAccount)
              ON CONFLICT(mint) DO UPDATE SET
                name = excluded.name,
                symbol = excluded.symbol,
                source = excluded.source,
                age_sec = excluded.age_sec,
                lp_sol = excluded.lp_sol,
                buys60 = excluded.buys60,
                sells60 = excluded.sells60,
                uniques60 = excluded.uniques60,
                spread_bps = excluded.spread_bps,
                safety_ok = excluded.safety_ok,
                safety_reasons = excluded.safety_reasons,
                ocrs = excluded.ocrs,
                topic_id = excluded.topic_id,
                match_score = excluded.match_score,
                pool_address = excluded.pool_address,
                lp_mint = excluded.lp_mint,
                pool_coin_account = excluded.pool_coin_account,
                pool_pc_account = excluded.pool_pc_account,
                updated_at = datetime('now')`)
      .run({
        ...candidate,
        safetyOk: candidate.safety.ok ? 1 : 0,
        safetyReasons: JSON.stringify(candidate.safety.reasons ?? []),
        topicId: candidate.topicId ?? null,
        matchScore: candidate.matchScore ?? null,
        poolAddress: candidate.poolAddress ?? null,
        lpMint: candidate.lpMint ?? null,
        poolCoinAccount: candidate.poolCoinAccount ?? null,
        poolPcAccount: candidate.poolPcAccount ?? null
      });
  });
}





export function logTradeEvent(event: TradeEvent) {

  const database = getDb();

  database

    .prepare('INSERT INTO events (event_type, payload) VALUES (?, ?)')

    .run(event.t, JSON.stringify(event));

}



export function upsertPosition(payload: { mint: string; quantity: number; averagePrice: number; realizedPnl?: number; unrealizedPnl?: number; state: string; ladderHits: string[]; trailActive: boolean }) {

  const database = getDb();

  database

    .prepare(`INSERT INTO positions (mint, quantity, average_price, realized_pnl, unrealized_pnl, state, ladder_hits, trail_active)

              VALUES (@mint, @quantity, @averagePrice, @realizedPnl, @unrealizedPnl, @state, @ladderHits, @trailActive)

              ON CONFLICT(mint) DO UPDATE SET

                quantity = excluded.quantity,

                average_price = excluded.average_price,

                realized_pnl = excluded.realized_pnl,

                unrealized_pnl = excluded.unrealized_pnl,

                state = excluded.state,

                ladder_hits = excluded.ladder_hits,

                trail_active = excluded.trail_active,

                updated_at = datetime('now')`)

    .run({

      mint: payload.mint,

      quantity: payload.quantity,

      averagePrice: payload.averagePrice,

      realizedPnl: payload.realizedPnl ?? 0,

      unrealizedPnl: payload.unrealizedPnl ?? 0,

      state: payload.state,

      ladderHits: JSON.stringify(payload.ladderHits),

      trailActive: payload.trailActive ? 1 : 0

    });

}



export function recordSizingDecision(input: { mint?: string; equity: number; free: number; tier: string; caps: Record<string, number>; finalSize: number; reason: string }) {

  const database = getDb();

  database

    .prepare(`INSERT INTO sizing_decisions (mint, equity, free, tier, caps, final_size, reason)

              VALUES (@mint, @equity, @free, @tier, @caps, @finalSize, @reason)`)

    .run({

      mint: input.mint ?? null,

      equity: input.equity,

      free: input.free,

      tier: input.tier,

      caps: JSON.stringify(input.caps),

      finalSize: input.finalSize,

      reason: input.reason

    });

}



export function closeDb() {

  if (db) {

    db.close();

    db = null;

    logger.info('closed sqlite connection');

  }

}

export function storeSocialPost(post: SocialPost) {

  const database = getDb();

  database

    .prepare(`INSERT INTO social_posts (id, platform, author_id, author_handle, text, lang, link, published_at, captured_at, topics, tags, engagement, source, raw)

              VALUES (@id, @platform, @authorId, @authorHandle, @text, @lang, @link, @publishedAt, @capturedAt, @topics, @tags, @engagement, @source, @raw)

              ON CONFLICT(id) DO UPDATE SET

                platform = excluded.platform,

                author_id = excluded.author_id,

                author_handle = excluded.author_handle,

                text = excluded.text,

                lang = excluded.lang,

                link = excluded.link,

                published_at = excluded.published_at,

                captured_at = excluded.captured_at,

                topics = excluded.topics,

                tags = excluded.tags,

                engagement = excluded.engagement,

                source = excluded.source,

                raw = excluded.raw`)

    .run({

      id: post.id,

      platform: post.platform,

      authorId: post.authorId,

      authorHandle: post.authorHandle ?? null,

      text: post.text,

      lang: post.lang ?? null,

      link: post.link ?? null,

      publishedAt: post.publishedAt,

      capturedAt: post.capturedAt,

      topics: post.topics ? JSON.stringify(post.topics) : null,

      tags: post.tags ? JSON.stringify(post.tags) : null,

      engagement: JSON.stringify(post.engagement ?? {}),

      source: post.source,

      raw: JSON.stringify(post.raw ?? {})

    });

}

export function getOpenPositionsCount(): number {
  const database = getDb();
  const row = database
    .prepare("SELECT COUNT(*) AS cnt FROM positions WHERE state NOT IN ('CLOSED', 'EXITED')")
    .get() as { cnt?: number };
  return row?.cnt ?? 0;
}

export function getDailySizingSpendSince(isoTimestamp: string): number {
  const database = getDb();
  const row = database
    .prepare('SELECT COALESCE(SUM(final_size), 0) AS total FROM sizing_decisions WHERE created_at >= ?')
    .get(isoTimestamp) as { total?: number };
  return row?.total ?? 0;
}

export function getDailyRealizedPnlSince(isoTimestamp: string): number {
  const database = getDb();
  const rows = database
    .prepare("SELECT payload FROM events WHERE event_type = 'exit' AND created_at >= ?")
    .all(isoTimestamp) as Array<{ payload: string }>;
  let total = 0;
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload);
      if (payload && typeof payload.pnl === 'number') {
        total += payload.pnl;
      }
    } catch (err) {
      logger.warn({ err }, 'failed to parse exit payload for pnl aggregation');
    }
  }
  return total;
}

export function recordPolicyAction(input: {
  actionId: string;
  mint: string;
  context: Record<string, unknown>;
  parameters: Record<string, unknown>;
  reward?: number;
}): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO policy_actions (action_id, mint, context, parameters, reward)
       VALUES (@actionId, @mint, @context, @parameters, @reward)`
    )
    .run({
      actionId: input.actionId,
      mint: input.mint,
      context: JSON.stringify(input.context),
      parameters: JSON.stringify(input.parameters),
      reward: input.reward ?? null
    });
}

export type BanditStateRow = { actionId: string; ainv: number[][]; b: number[] };

export function loadBanditState(): BanditStateRow[] {
  const database = getDb();
  const rows = database
    .prepare('SELECT action_id, ainv, b FROM bandit_state')
    .all() as Array<{ action_id: string; ainv: string; b: string }>;
  return rows.map((row) => ({
    actionId: row.action_id,
    ainv: JSON.parse(row.ainv),
    b: JSON.parse(row.b)
  }));
}

export function upsertBanditState(input: { actionId: string; ainv: number[][]; b: number[] }): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO bandit_state (action_id, ainv, b)
       VALUES (@actionId, @ainv, @b)
       ON CONFLICT(action_id) DO UPDATE SET
         ainv = excluded.ainv,
         b = excluded.b,
         updated_at = datetime('now')`
    )
    .run({
      actionId: input.actionId,
      ainv: JSON.stringify(input.ainv),
      b: JSON.stringify(input.b)
    });
}


export function listOpenPositions(): Array<{ mint: string; quantity: number; averagePrice: number; realizedPnl: number; unrealizedPnl: number; state: string; ladderHits: string[]; trailActive: boolean }> {
  const database = getDb();
  const rows = database
    .prepare(`SELECT mint, quantity, average_price, realized_pnl, unrealized_pnl, state, ladder_hits, trail_active FROM positions WHERE state != 'CLOSED'`)
    .all() as Array<{ mint: string; quantity: number; average_price: number; realized_pnl: number; unrealized_pnl: number; state: string; ladder_hits: string; trail_active: number }>;
  return rows.map((row) => ({
    mint: row.mint,
    quantity: row.quantity ?? 0,
    averagePrice: row.average_price ?? 0,
    realizedPnl: row.realized_pnl ?? 0,
    unrealizedPnl: row.unrealized_pnl ?? 0,
    state: row.state ?? 'OPEN',
    ladderHits: safeParseArray(row.ladder_hits),
    trailActive: Boolean(row.trail_active)
  }));
}

export function getCandidateByMint(mint: string): TokenCandidate | undefined {
  const database = getDb();
  const row = database
    .prepare(`SELECT mint, name, symbol, source, age_sec, lp_sol, buys60, sells60, uniques60, spread_bps, safety_ok, safety_reasons, ocrs, topic_id, match_score, pool_address, lp_mint, pool_coin_account, pool_pc_account FROM candidates WHERE mint = ?`)
    .get(mint) as
    | {
        mint: string;
        name: string;
        symbol: string;
        source: string;
        age_sec: number;
        lp_sol: number;
        buys60: number;
        sells60: number;
        uniques60: number;
        spread_bps: number;
        safety_ok: number;
        safety_reasons: string;
        ocrs: number;
        topic_id: string | null;
        match_score: number | null;
        pool_address?: string | null;
        lp_mint?: string | null;
        pool_coin_account?: string | null;
        pool_pc_account?: string | null;
      }
    | undefined;
  if (!row) return undefined;
  const candidate: TokenCandidate = {
    t: 'token_candidate',
    mint: row.mint,
    name: row.name,
    symbol: row.symbol,
    source: (row.source as TokenCandidate['source']) ?? 'raydium',
    ageSec: row.age_sec ?? 0,
    lpSol: row.lp_sol ?? 0,
    buys60: row.buys60 ?? 0,
    sells60: row.sells60 ?? 0,
    uniques60: row.uniques60 ?? 0,
    spreadBps: row.spread_bps ?? 0,
    safety: { ok: Boolean(row.safety_ok), reasons: safeParseArray(row.safety_reasons) },
    ocrs: row.ocrs ?? 0,
    topicId: row.topic_id ?? undefined,
    matchScore: row.match_score ?? undefined,
    poolAddress: row.pool_address ?? undefined,
    lpMint: row.lp_mint ?? undefined,
    poolCoinAccount: row.pool_coin_account ?? undefined,
    poolPcAccount: row.pool_pc_account ?? undefined
  };
  return candidate;
}

export function listRecentCandidates(limit = 30): Array<{
  mint: string;
  name: string;
  ocrs: number;
  lp: number;
  buys: number;
  sells: number;
  uniques: number;
  safetyOk: boolean;
}> {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT mint, name, ocrs, lp_sol AS lp, buys60 AS buys, sells60 AS sells, uniques60 AS uniques, safety_ok AS safety_ok
       FROM candidates
       ORDER BY updated_at DESC
       LIMIT @limit`
    )
    .all({ limit }) as Array<{
      mint: string;
      name: string;
      ocrs: number;
      lp: number;
      buys: number;
      sells: number;
      uniques: number;
      safety_ok: number;
    }>;
  return rows.map((r) => ({
    mint: r.mint,
    name: r.name,
    ocrs: r.ocrs ?? 0,
    lp: r.lp ?? 0,
    buys: r.buys ?? 0,
    sells: r.sells ?? 0,
    uniques: r.uniques ?? 0,
    safetyOk: Boolean(r.safety_ok)
  }));
}

function safeParseNumberArray(value: unknown): number[] {
  if (!value) return [];
  let raw: unknown;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      return [];
    }
  } else if (Array.isArray(value)) {
    raw = value;
  } else {
    return [];
  }
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => {
      const num = Number(entry);
      return Number.isFinite(num) ? num : 0;
    })
    .filter((num) => Number.isFinite(num));
}

function safeParseArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}
export function recordOrderPlan(order: { id: string; mint: string; gate: string; sizeSol: number; slippageBps: number; jitoTipLamports: number; computeUnitPrice?: number; route: string; status: string; side?: 'buy' | 'sell'; tokenAmount?: number | null; expectedSol?: number | null }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO orders (id, mint, gate, size_sol, slippage_bps, jito_tip_lamports, compute_unit_price, route, status, side, token_amount, expected_sol)
       VALUES (@id, @mint, @gate, @sizeSol, @slippageBps, @jitoTipLamports, @computeUnitPrice, @route, @status, @side, @tokenAmount, @expectedSol)
       ON CONFLICT(id) DO UPDATE SET
         mint = excluded.mint,
         gate = excluded.gate,
         size_sol = excluded.size_sol,
         slippage_bps = excluded.slippage_bps,
         jito_tip_lamports = excluded.jito_tip_lamports,
         compute_unit_price = excluded.compute_unit_price,
         route = excluded.route,
         status = excluded.status,
         side = excluded.side,
         token_amount = excluded.token_amount,
         expected_sol = excluded.expected_sol,
         updated_at = datetime('now')`)
    .run({
      id: order.id,
      mint: order.mint,
      gate: order.gate,
      sizeSol: order.sizeSol,
      slippageBps: order.slippageBps,
      jitoTipLamports: order.jitoTipLamports,
      computeUnitPrice: order.computeUnitPrice ?? null,
      route: order.route,
      status: order.status,
      side: order.side ?? 'buy',
      tokenAmount: order.tokenAmount ?? null,
      expectedSol: order.expectedSol ?? null
    });
}

export function recordFill(fill: { signature: string; mint: string; price: number; quantity: number; route: string; tipLamports: number; slot: number }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO fills (signature, mint, price, quantity, route, tip_lamports, slot)
       VALUES (@signature, @mint, @price, @quantity, @route, @tipLamports, @slot)
       ON CONFLICT(signature) DO UPDATE SET
         mint = excluded.mint,
         price = excluded.price,
         quantity = excluded.quantity,
         route = excluded.route,
         tip_lamports = excluded.tip_lamports,
         slot = excluded.slot`)
    .run(fill);
}

// ---- Phase A helpers ----

export function insertMigrationEvent(e: { ts: number; mint: string; pool: string; source: string; initSig: string }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO migration_events (ts, mint, pool, source, init_sig) VALUES (@ts, @mint, @pool, @source, @initSig)`)
    .run(e);
}

export function listRecentMigrationEvents(limit = 20): Array<{ ts: number; mint: string; pool: string; source: string; initSig: string }> {
  const database = getDb();
  const rows = database
    .prepare(`SELECT ts, mint, pool, source, init_sig FROM migration_events ORDER BY ts DESC LIMIT @limit`)
    .all({ limit }) as Array<{ ts: number; mint: string; pool: string; source: string; init_sig: string }>;
  return rows.map((r) => ({ ts: r.ts, mint: r.mint, pool: r.pool, source: r.source, initSig: r.init_sig }));
}

export function insertRugVerdict(v: { ts: number; mint: string; rugProb: number; reasons: string[] }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO rug_verdicts (ts, mint, rug_prob, reasons_json) VALUES (@ts, @mint, @rugProb, @reasons)`)
    .run({ ts: v.ts, mint: v.mint, rugProb: v.rugProb, reasons: JSON.stringify(v.reasons) });
}

export function insertScore(s: { ts: number; mint: string; horizon: string; score: number; features: Record<string, number> }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO scores (ts, mint, horizon, score, features_json) VALUES (@ts, @mint, @horizon, @score, @features)`)
    .run({ ts: s.ts, mint: s.mint, horizon: s.horizon, score: s.score, features: JSON.stringify(s.features) });
}

export function computeMigrationCandidateLagQuantiles(): { p50: number; p95: number } {
  const database = getDb();
  const rows = database
    .prepare(`SELECT ts, mint FROM migration_events ORDER BY ts DESC LIMIT 200`)
    .all() as Array<{ ts: number; mint: string }>;
  const lags: number[] = [];
  for (const row of rows) {
    const cand = database
      .prepare(`SELECT updated_at FROM candidates WHERE mint = ? ORDER BY updated_at DESC LIMIT 1`)
      .get(row.mint) as { updated_at?: string } | undefined;
    if (!cand?.updated_at) continue;
    const candTs = Date.parse(cand.updated_at);
    if (!Number.isFinite(candTs)) continue;
    const lag = Math.max(0, candTs - row.ts);
    lags.push(lag);
  }
  if (lags.length === 0) return { p50: 0, p95: 0 };
  lags.sort((a, b) => a - b);
  const q = (p: number) => lags[Math.min(lags.length - 1, Math.max(0, Math.floor((lags.length - 1) * p)))];
  return { p50: q(0.5), p95: q(0.95) };
}

export function getRugGuardStats(): { passRate: number; avgRugProb: number } {
  const database = getDb();
  const rows = database
    .prepare(`SELECT mint, rug_prob, reasons_json FROM rug_verdicts ORDER BY ts DESC LIMIT 200`)
    .all() as Array<{ mint: string; rug_prob: number; reasons_json: string }>;
  if (rows.length === 0) return { passRate: 0, avgRugProb: 0 };
  let passes = 0;
  let total = 0;
  let sum = 0;
  for (const r of rows) {
    total += 1;
    sum += r.rug_prob ?? 0;
    try {
      const reasons = JSON.parse(r.reasons_json) as string[];
      const hasActiveAuth = reasons.includes('mint_or_freeze_active');
      if (!hasActiveAuth) passes += 1;
    } catch {
      passes += 1;
    }
  }
  return { passRate: total > 0 ? passes / total : 0, avgRugProb: sum / Math.max(1, total) };
}

// ---- Phase B helpers ----
export function insertFillPrediction(pred: { ts: number; route: string; pFill: number; expSlipBps: number; expTimeMs: number }, ctx: Record<string, unknown>): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO fill_preds (ts, route, p_fill, exp_slip_bps, exp_time_ms, ctx_json) VALUES (@ts, @route, @pFill, @expSlipBps, @expTimeMs, @ctx)`)
    .run({ ...pred, ctx: JSON.stringify(ctx) });
}

export function insertFeeDecision(dec: { ts: number; cuPrice: number; cuLimit: number; slippageBps: number }, ctx: Record<string, unknown>): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO fee_decisions (ts, cu_price, cu_limit, slippage_bps, ctx_json) VALUES (@ts, @cuPrice, @cuLimit, @slippageBps, @ctx)`)
    .run({ ...dec, ctx: JSON.stringify(ctx) });
}

export function insertExecOutcome(row: { ts: number; quotePrice: number; execPrice?: number | null; filled: number; route?: string | null; cuPrice?: number | null; slippageReq?: number | null; slippageReal?: number | null; timeToLandMs?: number | null; errorCode?: string | null; notes?: string | null }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO exec_outcomes (ts, quote_price, exec_price, filled, route, cu_price, slippage_bps_req, slippage_bps_real, time_to_land_ms, error_code, notes, priority_fee_lamports, amount_in, amount_out, fee_lamports_total)
              VALUES (@ts, @quotePrice, @execPrice, @filled, @route, @cuPrice, @slippageReq, @slippageReal, @timeToLandMs, @errorCode, @notes, @priorityFeeLamports, @amountIn, @amountOut, @feeLamportsTotal)`)
    .run({ ...row });
}

export function getExecSummary(): { landedRate: number; avgSlipBps: number; p50Ttl: number; p95Ttl: number } {
  const database = getDb();
  const rows = database
    .prepare(`SELECT slippage_bps_real AS slip, time_to_land_ms AS ttl, filled FROM exec_outcomes ORDER BY ts DESC LIMIT 300`)
    .all() as Array<{ slip: number | null; ttl: number | null; filled: number }>;
  if (rows.length === 0) return { landedRate: 0, avgSlipBps: 0, p50Ttl: 0, p95Ttl: 0 };
  let filled = 0;
  let sumSlip = 0;
  const ttls: number[] = [];
  for (const r of rows) {
    if (r.filled) filled += 1;
    if (Number.isFinite(r.slip ?? NaN)) sumSlip += (r.slip as number);
    if (Number.isFinite(r.ttl ?? NaN)) ttls.push(r.ttl as number);
  }
  ttls.sort((a, b) => a - b);
  const q = (p: number) => ttls[Math.min(ttls.length - 1, Math.max(0, Math.floor((ttls.length - 1) * p)))];
  return { landedRate: filled / rows.length, avgSlipBps: sumSlip / Math.max(1, rows.length), p50Ttl: q(0.5) || 0, p95Ttl: q(0.95) || 0 };
}

export function upsertPrice(ts: number, symbol: string, usd: number): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO prices (ts, symbol, usd) VALUES (@ts, @symbol, @usd)`)
    .run({ ts, symbol, usd });
}

export function getNearestPrice(ts: number, symbol: string): number | null {
  const database = getDb();
  const row = database
    .prepare(`SELECT usd FROM prices WHERE symbol = @symbol AND ts <= @ts ORDER BY ts DESC LIMIT 1`)
    .get({ symbol, ts }) as { usd?: number } | undefined;
  return typeof row?.usd === 'number' ? row.usd : null;
}

export function getPnLSummary(): { netUsd: number; grossUsd: number; feeUsd: number; slipUsd: number } {
  const database = getDb();
  const rows = database
    .prepare(`SELECT ts, amount_in, slippage_bps_real, fee_lamports_total FROM exec_outcomes WHERE filled = 1 ORDER BY ts DESC LIMIT 1000`)
    .all() as Array<{ ts: number; amount_in: number | null; slippage_bps_real: number | null; fee_lamports_total: number | null }>;
  let feeUsd = 0; let slipUsd = 0;
  for (const r of rows) {
    const solUsd = getNearestPrice(r.ts, 'SOL') ?? 0;
    const inSol = (r.amount_in ?? 0) / 1_000_000_000;
    feeUsd += (r.fee_lamports_total ?? 0) / 1_000_000_000 * solUsd;
    slipUsd += (Math.abs(r.slippage_bps_real ?? 0) / 10000) * inSol * solUsd;
  }
  // Gross from sizing_outcomes
  const srows = database.prepare(`SELECT pnl_usd FROM sizing_outcomes ORDER BY ts DESC LIMIT 1000`).all() as Array<{ pnl_usd: number }>;
  const grossUsd = srows.reduce((a, r) => a + (r.pnl_usd ?? 0), 0);
  const netUsd = grossUsd - feeUsd - slipUsd;
  return { netUsd, grossUsd, feeUsd, slipUsd };
}

// ---- Phase C helpers ----
export function insertHazardState(h: { ts: number; mint: string; hazard: number; trailBps: number; ladder: Array<[number, number]> }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO hazard_states (ts, mint, hazard, trail_bps, ladder_json) VALUES (@ts, @mint, @hazard, @trailBps, @ladder)`)
    .run({ ts: h.ts, mint: h.mint, hazard: h.hazard, trailBps: h.trailBps, ladder: JSON.stringify(h.ladder) });
}

export function insertSizingDecision(dec: { ts: number; mint: string; arm: string; notional: number }, ctx: Record<string, unknown>): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO sizing_decisions (ts, mint, arm, notional, ctx_json) VALUES (@ts, @mint, @arm, @notional, @ctx)`)
    .run({ ...dec, ctx: JSON.stringify(ctx) });
}

export function insertSizingOutcome(row: { ts: number; mint: string; notional: number; pnlUsd: number; maeBps: number; closed: number }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO sizing_outcomes (ts, mint, notional, pnl_usd, mae_bps, closed) VALUES (@ts, @mint, @notional, @pnlUsd, @maeBps, @closed)`)
    .run(row);
}

export function getRiskBudget(): { dailyLossCapUsd: number; usedUsd: number; remainingUsd: number } {
  const database = getDb();
  const cfg = getConfig();
  const since = new Date(); since.setUTCHours(0,0,0,0);
  const rows = database
    .prepare(`SELECT pnl_usd FROM sizing_outcomes WHERE ts >= ?`)
    .all(since.getTime()) as Array<{ pnl_usd: number }>;
  const used = rows.reduce((a, r) => (r.pnl_usd < 0 ? a + Math.abs(r.pnl_usd) : a), 0);
  const cap = (cfg as any).sizing?.dailyLossCapUsd ?? 0;
  const remaining = Math.max(0, cap - used);
  return { dailyLossCapUsd: cap, usedUsd: used, remainingUsd: remaining };
}

export function getSizingDistribution(): Array<{ arm: string; share: number }> {
  const database = getDb();
  const rows = database
    .prepare(`SELECT arm, COUNT(1) AS n FROM sizing_decisions WHERE arm IS NOT NULL AND arm != '' AND ts >= ? GROUP BY arm`)
    .all(Date.now() - 24*60*60*1000) as Array<{ arm: string; n: number }>;
  const total = rows.reduce((a, r) => a + (r.n || 0), 0) || 1;
  return rows.map((r) => ({ arm: r.arm, share: (r.n || 0) / total }));
}

// ---- Phase D helpers ----
export function createBacktestRun(params: Record<string, unknown>, notes?: string): number {
  const database = getDb();
  const res = database
    .prepare(`INSERT INTO backtest_runs (started_ts, params_json, notes) VALUES (@ts, @params, @notes)`)
    .run({ ts: Date.now(), params: JSON.stringify(params), notes: notes ?? null });
  // better-sqlite3 returns lastInsertRowid as a bigint/number
  return Number(res.lastInsertRowid);
}

export function finishBacktestRun(runId: number): void {
  const database = getDb();
  database.prepare(`UPDATE backtest_runs SET finished_ts = @ts WHERE id = @id`).run({ ts: Date.now(), id: runId });
}

export function insertBacktestResult(runId: number, metric: string, value: number, segment?: string): void {
  const database = getDb();
  database
    .prepare(`INSERT OR REPLACE INTO backtest_results (run_id, metric, value, segment) VALUES (@runId, @metric, @value, @segment)`)
    .run({ runId, metric, value, segment: segment ?? 'overall' });
}

export function insertShadowFeeDecision(row: { ts: number; mint: string; chosenArm: number; baselineArm?: number | null; deltaRewardEst?: number | null }, ctx: Record<string, unknown>): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO shadow_decisions_fee (ts, mint, chosen_arm, baseline_arm, delta_reward_est, ctx_json) VALUES (@ts, @mint, @chosenArm, @baselineArm, @deltaRewardEst, @ctx)`)
    .run({ ...row, baselineArm: row.baselineArm ?? null, deltaRewardEst: row.deltaRewardEst ?? null, ctx: JSON.stringify(ctx) });
}

export function insertShadowSizingDecision(row: { ts: number; mint: string; chosenArm: string; baselineArm?: string | null; deltaRewardEst?: number | null }, ctx: Record<string, unknown>): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO shadow_decisions_sizing (ts, mint, chosen_arm, baseline_arm, delta_reward_est, ctx_json) VALUES (@ts, @mint, @chosenArm, @baselineArm, @deltaRewardEst, @ctx)`)
    .run({ ...row, baselineArm: row.baselineArm ?? null, deltaRewardEst: row.deltaRewardEst ?? null, ctx: JSON.stringify(ctx) });
}
