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

  statements: Array<string | ((db: DatabaseConstructor.Database) => void)>;

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

        mae_bps REAL NOT NULL DEFAULT 0,

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



MIGRATIONS.push({
    id: '0013_preflight_mae',
    statements: [
      `ALTER TABLE positions ADD COLUMN mae_bps REAL NOT NULL DEFAULT 0;`
    ]
  });



MIGRATIONS.push({
    id: '0014_phase_f_route_stats',
    statements: [
      `CREATE TABLE IF NOT EXISTS route_stats (
        route TEXT NOT NULL,
        window_start_ts INTEGER NOT NULL,
        attempts INTEGER NOT NULL,
        fails INTEGER NOT NULL,
        avg_slip_real_bps REAL NOT NULL,
        avg_slip_exp_bps REAL NOT NULL,
        penalty REAL NOT NULL,
        PRIMARY KEY(route, window_start_ts)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_route_stats_ts ON route_stats(window_start_ts);`
    ]
  });

MIGRATIONS.push({
    id: '0015_phase_f_leader_wallets',
    statements: [
      `CREATE TABLE IF NOT EXISTS leader_wallets (
        wallet TEXT PRIMARY KEY,
        score REAL NOT NULL,
        lastSeenTs INTEGER NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS leader_hits (
        pool TEXT NOT NULL,
        wallet TEXT NOT NULL,
        ts INTEGER NOT NULL,
        PRIMARY KEY(pool, wallet, ts)
      );`,
      `CREATE INDEX IF NOT EXISTS idx_leader_hits_pool_ts ON leader_hits(pool, ts);`
    ]
  });

// Housekeeping indices for performance
MIGRATIONS.push({
  id: '0016_housekeeping_indices',
  statements: [
    `CREATE INDEX IF NOT EXISTS idx_sizing_decisions_mint_ts ON sizing_decisions(mint, ts);`,
    `CREATE INDEX IF NOT EXISTS idx_sizing_outcomes_mint_ts ON sizing_outcomes(mint, ts);`,
    `CREATE INDEX IF NOT EXISTS idx_exec_outcomes_route_ts ON exec_outcomes(route, ts);`,
    `CREATE INDEX IF NOT EXISTS idx_leader_hits_wallet_ts ON leader_hits(wallet, ts);`
  ]
});

// Offline features and pump signals
MIGRATIONS.push({
  id: '0017_offline_features',
  statements: [
    `CREATE TABLE IF NOT EXISTS author_features(
      author TEXT PRIMARY KEY,
      quality REAL NOT NULL,
      posts24h INTEGER NOT NULL,
      lastCalcTs INTEGER NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS pump_signals(
      ts INTEGER NOT NULL,
      mint TEXT NOT NULL,
      pump_prob REAL NOT NULL,
      samples INTEGER NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS idx_pump_signals_mint_ts ON pump_signals(mint, ts);`
  ]
});

function columnExists(db: DatabaseConstructor.Database, table: string, col: string): boolean {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
    return Array.isArray(rows) && rows.some((row) => String(row?.name ?? '').toLowerCase() === col.toLowerCase());
  } catch {
    return false;
  }
}

function indexExists(db: DatabaseConstructor.Database, idx: string): boolean {
  try {
    db.prepare(`PRAGMA index_info(${idx})`).all();
    return true;
  } catch {
    return false;
  }
}

export function ensureTable(db: DatabaseConstructor.Database, ddl: string): void {
  db.prepare(ddl).run();
}

export function ensureColumn(db: DatabaseConstructor.Database, table: string, col: string, ddlType: string): void {
  if (!columnExists(db, table, col)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddlType}`).run();
  }
}

export function ensureIndex(db: DatabaseConstructor.Database, idx: string, ddl: string): void {
  if (!indexExists(db, idx)) {
    db.prepare(ddl).run();
  }
}


const BOOTSTRAP_TABLE_DDLS = [
  `CREATE TABLE IF NOT EXISTS migrations ( id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')) );`,
  `CREATE TABLE IF NOT EXISTS topics ( topic_id TEXT PRIMARY KEY, label TEXT NOT NULL, sss REAL NOT NULL, novelty REAL NOT NULL, window_sec INTEGER NOT NULL, sources TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')) );`,
  `CREATE TABLE IF NOT EXISTS candidates ( mint TEXT PRIMARY KEY, name TEXT, symbol TEXT, source TEXT NOT NULL, age_sec INTEGER NOT NULL, lp_sol REAL NOT NULL, buys60 INTEGER NOT NULL, sells60 INTEGER NOT NULL, uniques60 INTEGER NOT NULL, spread_bps REAL NOT NULL, safety_ok INTEGER NOT NULL, safety_reasons TEXT NOT NULL, topic_id TEXT, match_score REAL, first_seen_slot INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')) );`,
  `CREATE TABLE IF NOT EXISTS orders ( id TEXT PRIMARY KEY, mint TEXT NOT NULL, gate TEXT NOT NULL, size_sol REAL NOT NULL, slippage_bps INTEGER NOT NULL, jito_tip_lamports INTEGER NOT NULL, compute_unit_price INTEGER, route TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')) );`,
  `CREATE TABLE IF NOT EXISTS fills ( signature TEXT PRIMARY KEY, mint TEXT NOT NULL, price REAL NOT NULL, quantity REAL NOT NULL, route TEXT NOT NULL, tip_lamports INTEGER NOT NULL, slot INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')) );`,
  `CREATE TABLE IF NOT EXISTS positions ( mint TEXT PRIMARY KEY, quantity REAL NOT NULL, average_price REAL NOT NULL, realized_pnl REAL NOT NULL DEFAULT 0, unrealized_pnl REAL NOT NULL DEFAULT 0, state TEXT NOT NULL, ladder_hits TEXT NOT NULL, trail_active INTEGER NOT NULL DEFAULT 0, mae_bps REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')) );`,
  `CREATE TABLE IF NOT EXISTS events ( id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')) );`,
  `CREATE TABLE IF NOT EXISTS sizing_decisions ( id INTEGER PRIMARY KEY AUTOINCREMENT, mint TEXT, equity REAL NOT NULL, free REAL NOT NULL, tier TEXT NOT NULL, caps TEXT NOT NULL, final_size REAL NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')) );`,
  `CREATE TABLE IF NOT EXISTS heartbeats ( id INTEGER PRIMARY KEY AUTOINCREMENT, component TEXT NOT NULL, status TEXT NOT NULL, message TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')) );`,
  `CREATE TABLE IF NOT EXISTS social_posts ( id TEXT PRIMARY KEY, platform TEXT NOT NULL, author_id TEXT NOT NULL, author_handle TEXT, text TEXT NOT NULL, lang TEXT, link TEXT, published_at TEXT NOT NULL, captured_at TEXT NOT NULL, topics TEXT, tags TEXT, engagement TEXT, source TEXT NOT NULL, raw TEXT NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS policy_actions ( id INTEGER PRIMARY KEY AUTOINCREMENT, action_id TEXT NOT NULL, mint TEXT NOT NULL, context TEXT NOT NULL, parameters TEXT NOT NULL, reward REAL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')) );`,
  `CREATE TABLE IF NOT EXISTS bandit_state ( action_id TEXT PRIMARY KEY, ainv TEXT NOT NULL, b TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')) );`,
  `CREATE TABLE IF NOT EXISTS topic_clusters ( topic_id TEXT PRIMARY KEY, label TEXT NOT NULL, centroid_json TEXT NOT NULL, phrases TEXT NOT NULL, sss REAL NOT NULL, novelty REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')) );`,
  `CREATE TABLE IF NOT EXISTS topic_windows ( window_id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, opened_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_refresh TEXT NOT NULL, sss REAL NOT NULL, novelty REAL NOT NULL, FOREIGN KEY (topic_id) REFERENCES topic_clusters(topic_id) );`,
  `CREATE TABLE IF NOT EXISTS topic_matches ( id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, mint TEXT NOT NULL, match_score REAL NOT NULL, matched_at TEXT NOT NULL, source TEXT NOT NULL, FOREIGN KEY (topic_id) REFERENCES topic_clusters(topic_id) );`,
  `CREATE TABLE IF NOT EXISTS phrase_baseline ( phrase TEXT PRIMARY KEY, count REAL NOT NULL, engagement REAL NOT NULL, authors REAL NOT NULL, updated_at TEXT NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS migration_events ( ts INTEGER NOT NULL, mint TEXT NOT NULL, pool TEXT NOT NULL, source TEXT NOT NULL, init_sig TEXT NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS scores ( ts INTEGER NOT NULL, mint TEXT NOT NULL, horizon TEXT NOT NULL, score REAL NOT NULL, features_json TEXT NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS rug_verdicts ( ts INTEGER NOT NULL, mint TEXT NOT NULL, rug_prob REAL NOT NULL, reasons_json TEXT NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS fill_preds( ts INTEGER NOT NULL, route TEXT NOT NULL, p_fill REAL NOT NULL, exp_slip_bps REAL NOT NULL, exp_time_ms INTEGER NOT NULL, ctx_json TEXT NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS fee_decisions( ts INTEGER NOT NULL, cu_price INTEGER NOT NULL, cu_limit INTEGER NOT NULL, slippage_bps INTEGER NOT NULL, ctx_json TEXT NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS exec_outcomes( ts INTEGER NOT NULL, quote_price REAL NOT NULL, exec_price REAL, filled INTEGER NOT NULL, route TEXT, cu_price INTEGER, slippage_bps_req INTEGER, slippage_bps_real REAL, time_to_land_ms INTEGER, error_code TEXT, notes TEXT );`,
  `CREATE TABLE IF NOT EXISTS hazard_states( ts INTEGER NOT NULL, mint TEXT NOT NULL, hazard REAL NOT NULL, trail_bps INTEGER NOT NULL, ladder_json TEXT NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS sizing_outcomes( ts INTEGER NOT NULL, mint TEXT NOT NULL, notional REAL NOT NULL, pnl_usd REAL NOT NULL, mae_bps REAL NOT NULL, closed INTEGER NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS backtest_runs( id INTEGER PRIMARY KEY AUTOINCREMENT, started_ts INTEGER NOT NULL, finished_ts INTEGER, params_json TEXT NOT NULL, notes TEXT );`,
  `CREATE TABLE IF NOT EXISTS backtest_results( run_id INTEGER NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL, segment TEXT, PRIMARY KEY(run_id, metric, segment) );`,
  `CREATE TABLE IF NOT EXISTS shadow_decisions_fee( ts INTEGER NOT NULL, mint TEXT NOT NULL, chosen_arm INTEGER NOT NULL, baseline_arm INTEGER, delta_reward_est REAL, ctx_json TEXT NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS shadow_decisions_sizing( ts INTEGER NOT NULL, mint TEXT NOT NULL, chosen_arm TEXT NOT NULL, baseline_arm TEXT, delta_reward_est REAL, ctx_json TEXT NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS sim_exec_outcomes(
    ts INTEGER,
    mint TEXT,
    route TEXT,
    filled INTEGER,
    quote_price REAL,
    exec_price REAL,
    slippage_bps_req INTEGER,
    slippage_bps_real REAL,
    time_to_land_ms INTEGER,
    cu_price INTEGER,
    amount_in INTEGER,
    amount_out INTEGER,
    source TEXT DEFAULT 'sim',
    PRIMARY KEY(mint, ts, route)
  );`,
  `CREATE TABLE IF NOT EXISTS prices ( ts INTEGER NOT NULL, symbol TEXT NOT NULL, usd REAL NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS route_stats ( route TEXT NOT NULL, window_start_ts INTEGER NOT NULL, attempts INTEGER NOT NULL, fails INTEGER NOT NULL, avg_slip_real_bps REAL NOT NULL, avg_slip_exp_bps REAL NOT NULL, penalty REAL NOT NULL, PRIMARY KEY(route, window_start_ts) );`,
  `CREATE TABLE IF NOT EXISTS leader_wallets ( wallet TEXT PRIMARY KEY, score REAL NOT NULL, lastSeenTs INTEGER NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS leader_hits ( pool TEXT NOT NULL, wallet TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY(pool, wallet, ts) );`,
  `CREATE TABLE IF NOT EXISTS author_features( author TEXT PRIMARY KEY, quality REAL NOT NULL, posts24h INTEGER NOT NULL, lastCalcTs INTEGER NOT NULL );`,
  `CREATE TABLE IF NOT EXISTS pump_signals( ts INTEGER NOT NULL, mint TEXT NOT NULL, pump_prob REAL NOT NULL, samples INTEGER NOT NULL );`
] as const;

const BOOTSTRAP_INDEX_DDLS = [
  { name: 'idx_candidates_created_at', ddl: `CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON candidates(created_at);` },
  { name: 'idx_orders_mint', ddl: `CREATE INDEX IF NOT EXISTS idx_orders_mint ON orders(mint);` },
  { name: 'idx_fills_mint', ddl: `CREATE INDEX IF NOT EXISTS idx_fills_mint ON fills(mint);` },
  { name: 'idx_events_type', ddl: `CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);` },
  { name: 'idx_sizing_created_at', ddl: `CREATE INDEX IF NOT EXISTS idx_sizing_created_at ON sizing_decisions(created_at);` },
  { name: 'idx_heartbeats_component', ddl: `CREATE INDEX IF NOT EXISTS idx_heartbeats_component ON heartbeats(component);` },
  { name: 'idx_social_posts_platform', ddl: `CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(platform);` },
  { name: 'idx_social_posts_published_at', ddl: `CREATE INDEX IF NOT EXISTS idx_social_posts_published_at ON social_posts(published_at);` },
  { name: 'idx_policy_actions_mint', ddl: `CREATE INDEX IF NOT EXISTS idx_policy_actions_mint ON policy_actions(mint);` },
  { name: 'idx_topic_clusters_updated_at', ddl: `CREATE INDEX IF NOT EXISTS idx_topic_clusters_updated_at ON topic_clusters(updated_at);` },
  { name: 'idx_topic_windows_topic', ddl: `CREATE INDEX IF NOT EXISTS idx_topic_windows_topic ON topic_windows(topic_id);` },
  { name: 'idx_topic_windows_expires', ddl: `CREATE INDEX IF NOT EXISTS idx_topic_windows_expires ON topic_windows(expires_at);` },
  { name: 'idx_topic_matches_topic', ddl: `CREATE INDEX IF NOT EXISTS idx_topic_matches_topic ON topic_matches(topic_id);` },
  { name: 'idx_topic_matches_mint', ddl: `CREATE INDEX IF NOT EXISTS idx_topic_matches_mint ON topic_matches(mint);` },
  { name: 'idx_migration_events_mint_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_migration_events_mint_ts ON migration_events(mint, ts);` },
  { name: 'idx_scores_mint_horizon_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_scores_mint_horizon_ts ON scores(mint, horizon, ts);` },
  { name: 'idx_rug_verdicts_mint_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_rug_verdicts_mint_ts ON rug_verdicts(mint, ts);` },
  { name: 'idx_fill_preds_route_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_fill_preds_route_ts ON fill_preds(route, ts);` },
  { name: 'idx_fee_decisions_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_fee_decisions_ts ON fee_decisions(ts);` },
  { name: 'idx_exec_outcomes_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_exec_outcomes_ts ON exec_outcomes(ts);` },
  { name: 'idx_hazard_states_mint_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_hazard_states_mint_ts ON hazard_states(mint, ts);` },
  { name: 'idx_sizing_decisions_mint_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_sizing_decisions_mint_ts ON sizing_decisions(mint, ts);` },
  { name: 'idx_sizing_outcomes_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_sizing_outcomes_ts ON sizing_outcomes(ts);` },
  { name: 'idx_shadow_fee_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_shadow_fee_ts ON shadow_decisions_fee(ts);` },
  { name: 'idx_shadow_sizing_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_shadow_sizing_ts ON shadow_decisions_sizing(ts);` },
  { name: 'idx_prices_symbol_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_prices_symbol_ts ON prices(symbol, ts);` },
  { name: 'idx_route_stats_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_route_stats_ts ON route_stats(window_start_ts);` },
  { name: 'idx_leader_hits_pool_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_leader_hits_pool_ts ON leader_hits(pool, ts);` },
  { name: 'idx_sizing_outcomes_mint_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_sizing_outcomes_mint_ts ON sizing_outcomes(mint, ts);` },
  { name: 'idx_exec_outcomes_route_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_exec_outcomes_route_ts ON exec_outcomes(route, ts);` },
  { name: 'idx_leader_hits_wallet_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_leader_hits_wallet_ts ON leader_hits(wallet, ts);` },
  { name: 'idx_pump_signals_mint_ts', ddl: `CREATE INDEX IF NOT EXISTS idx_pump_signals_mint_ts ON pump_signals(mint, ts);` }
] as const;

const BOOTSTRAP_COLUMN_ADDITIONS = [
  { table: 'candidates', column: 'pool_address', type: 'TEXT' },
  { table: 'candidates', column: 'lp_mint', type: 'TEXT' },
  { table: 'candidates', column: 'pool_coin_account', type: 'TEXT' },
  { table: 'candidates', column: 'pool_pc_account', type: 'TEXT' },
  { table: 'orders', column: 'side', type: 'TEXT DEFAULT \'buy\'' },
  { table: 'orders', column: 'token_amount', type: 'INTEGER' },
  { table: 'orders', column: 'expected_sol', type: 'REAL' },
  { table: 'topics', column: 'decayed_sss', type: 'REAL DEFAULT 0' },
  { table: 'topics', column: 'cluster_phrases', type: 'TEXT' },
  { table: 'topics', column: 'cluster_added', type: 'TEXT' },
  { table: 'topics', column: 'cluster_centroid', type: 'TEXT' },
  { table: 'sizing_decisions', column: 'ts', type: 'INTEGER' },
  { table: 'sizing_decisions', column: 'arm', type: 'TEXT' },
  { table: 'sizing_decisions', column: 'notional', type: 'REAL' },
  { table: 'sizing_decisions', column: 'ctx_json', type: 'TEXT' },
  { table: 'exec_outcomes', column: 'priority_fee_lamports', type: 'INTEGER' },
  { table: 'exec_outcomes', column: 'amount_in', type: 'INTEGER' },
  { table: 'exec_outcomes', column: 'amount_out', type: 'INTEGER' },
  { table: 'exec_outcomes', column: 'fee_lamports_total', type: 'INTEGER' },
  { table: 'exec_outcomes', column: 'order_id', type: 'TEXT' },
  { table: 'exec_outcomes', column: 'mint', type: 'TEXT' },
  { table: 'positions', column: 'mae_bps', type: 'REAL NOT NULL DEFAULT 0' }
] as const;

const CANONICAL_COLUMN_ADDITIONS = [
  { table: 'topics', column: 'id', type: 'INTEGER' },
  { table: 'topics', column: 'phrase', type: 'TEXT' },
  { table: 'topics', column: 'score', type: 'REAL' },
  { table: 'topics', column: 'created_ts', type: 'INTEGER' },
  { table: 'candidates', column: 'ts', type: 'INTEGER' },
  { table: 'candidates', column: 'pool', type: 'TEXT' },
  { table: 'candidates', column: 'age', type: 'INTEGER' },
  { table: 'candidates', column: 'lpSol', type: 'REAL' },
  { table: 'candidates', column: 'uniques', type: 'INTEGER' },
  { table: 'candidates', column: 'buys', type: 'INTEGER' },
  { table: 'candidates', column: 'sells', type: 'INTEGER' },
  { table: 'orders', column: 'created_ts', type: 'INTEGER' },
  { table: 'orders', column: 'size', type: 'REAL' },
  { table: 'orders', column: 'cu_price', type: 'INTEGER' },
  { table: 'orders', column: 'tokenAmount', type: 'INTEGER' },
  { table: 'orders', column: 'expectedSol', type: 'REAL' },
  { table: 'fills', column: 'order_id', type: 'TEXT' },
  { table: 'fills', column: 'ts', type: 'INTEGER' },
  { table: 'fills', column: 'amount_in', type: 'INTEGER' },
  { table: 'fills', column: 'amount_out', type: 'INTEGER' },
  { table: 'fills', column: 'exec_price', type: 'REAL' },
  { table: 'positions', column: 'entry_price', type: 'REAL' },
  { table: 'positions', column: 'entry_ts', type: 'INTEGER' },
  { table: 'positions', column: 'size', type: 'REAL' },
  { table: 'positions', column: 'quantity', type: 'INTEGER' },
  { table: 'events', column: 'ts', type: 'INTEGER' },
  { table: 'events', column: 'type', type: 'TEXT' },
  { table: 'events', column: 'payload_json', type: 'TEXT' }
] as const;

export function bootstrapDb(
  database: DatabaseConstructor.Database,
  log: { warn: (...args: any[]) => void } = console
): void {
  const bootstrapLogger = log ?? console;

  const safePragma = (pragma: string) => {
    try {
      database.pragma(pragma);
    } catch (err) {
      bootstrapLogger.warn({ err, pragma }, 'db bootstrap warning');
    }
  };

  safePragma('journal_mode = WAL');
  safePragma('synchronous = NORMAL');
  safePragma('foreign_keys = ON');
  safePragma('busy_timeout = 5000');

  const safeRun = (fn: () => void, meta: Record<string, unknown>) => {
    try {
      fn();
    } catch (err) {
      bootstrapLogger.warn({ err, ...meta }, 'db bootstrap warning');
    }
  };

  let startedTransaction = false;
  try {
    database.exec('BEGIN');
    startedTransaction = true;
  } catch (err) {
    bootstrapLogger.warn({ err, ddl: 'BEGIN' }, 'db bootstrap warning');
  }

  const columnSpecs = [...BOOTSTRAP_COLUMN_ADDITIONS, ...CANONICAL_COLUMN_ADDITIONS];

  for (const ddl of BOOTSTRAP_TABLE_DDLS) {
    safeRun(() => ensureTable(database, ddl), { ddl });
  }

  for (const spec of columnSpecs) {
    safeRun(() => ensureColumn(database, spec.table, spec.column, spec.type), {
      table: spec.table,
      column: spec.column,
      ddl: spec.type
    });
  }

  for (const index of BOOTSTRAP_INDEX_DDLS) {
    safeRun(() => ensureIndex(database, index.name, index.ddl), { idx: index.name, ddl: index.ddl });
  }

  // Best-effort backfill for exec_outcomes.order_id and exec_outcomes.mint
  try {
    database.exec('BEGIN');
    // Backfill order_id by nearest orders (within 5s) and same route if present
    const stmt1 = database.prepare(`
      UPDATE exec_outcomes AS eo
      SET order_id = (
        SELECT o.id FROM orders o
        WHERE o.created_ts BETWEEN eo.ts - 5 AND eo.ts + 5
          AND (eo.route IS NULL OR eo.route = o.route)
        ORDER BY ABS(o.created_ts - eo.ts) ASC
        LIMIT 1
      )
      WHERE eo.order_id IS NULL;
    `);
    stmt1.run();

    // Backfill mint from orders via order_id
    const stmt2 = database.prepare(`
      UPDATE exec_outcomes AS eo
      SET mint = (
        SELECT o.mint FROM orders o WHERE o.id = eo.order_id LIMIT 1
      )
      WHERE eo.mint IS NULL AND eo.order_id IS NOT NULL;
    `);
    stmt2.run();

    database.exec('COMMIT');
  } catch (err) {
    try { database.exec('ROLLBACK'); } catch {}
    bootstrapLogger.warn({ err, step: 'backfill_exec_outcomes' }, 'db bootstrap warning');
  }

  if (startedTransaction) {
    try {
      database.exec('COMMIT');
    } catch (err) {
      bootstrapLogger.warn({ err, ddl: 'COMMIT' }, 'db bootstrap warning');
      try {
        database.exec('ROLLBACK');
      } catch {
        // ignore rollback failure
      }
    }
  }
}


let bootstrapped = false;

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

  try { instance.pragma('temp_store = MEMORY'); } catch { /* optional */ }
  try { instance.pragma('mmap_size = 268435456'); } catch { /* optional */ }

  if (!bootstrapped) {
    bootstrapDb(instance, logger);
    bootstrapped = true;
  }

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

    const applyMigration = instance.transaction(() => {

      for (const statement of migration.statements) {

        if (typeof statement === 'function') {

          statement(instance);

          continue;

        }

        const trimmed = statement.trim();

        const withoutSemicolon = trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;

        const upper = withoutSemicolon.toUpperCase();

        if (upper.startsWith('ALTER TABLE') && upper.includes('ADD COLUMN')) {

          const match = withoutSemicolon.match(/^ALTER\s+TABLE\s+[\"`]?([A-Za-z0-9_]+)[\"`]?\s+ADD\s+COLUMN\s+[\"`]?([A-Za-z0-9_]+)[\"`]?\s+(.+)$/i);

          if (match) {

            const [, table, column, ddl] = match;

            ensureColumn(instance, table, column, ddl.trim());

            continue;

          }

        }

        if (upper.startsWith('CREATE') && upper.includes(' INDEX ')) {

          const match = withoutSemicolon.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`]?([A-Za-z0-9_]+)[\"`]?/i);

          if (match) {

            const [, indexName] = match;

            ensureIndex(instance, indexName, trimmed);

            continue;

          }

        }

        instance.exec(statement);

      }

      insertStmt.run(migration.id);

    });

    try {

      applyMigration();

      logger.info({ migration: migration.id }, 'applied sqlite migration');

    } catch (err) {

      logger.error({ err, migration: migration.id }, 'failed to apply sqlite migration');

    }

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

export function insertSimOutcome(o: {
  ts: number;
  mint: string | null;
  route: string | null;
  filled: number;
  quote_price: number | null;
  exec_price: number | null;
  slippageReq: number | null;
  slippageReal: number | null;
  timeToLandMs: number | null;
  cu_price: number | null;
  amountIn: number | null;
  amountOut: number | null;
  source?: string;
}): void {
  const database = getDb();
  const ins = database.prepare(`
    INSERT OR IGNORE INTO sim_exec_outcomes
    (ts,mint,route,filled,quote_price,exec_price,slippage_bps_req,slippage_bps_real,time_to_land_ms,cu_price,amount_in,amount_out,source)
    VALUES (@ts,@mint,@route,@filled,@quote_price,@exec_price,@slippageReq,@slippageReal,@timeToLandMs,@cu_price,@amountIn,@amountOut,@source)
  `);
  try {
    ins.run({ ...o, source: o.source ?? 'shadow' });
  } catch (err) {
    // best-effort; analytics-only
  }
}

export function countSimOutcomes(sinceSec?: number): number {
  const database = getDb();
  try {
    if (sinceSec && sinceSec > 0) {
      const stmt = database.prepare(
        `SELECT COUNT(*) AS n FROM sim_exec_outcomes WHERE (CASE WHEN ts>20000000000 THEN ts/1000 ELSE ts END) >= ?`
      );
      const row = stmt.get(Math.floor(Date.now() / 1000) - sinceSec) as { n?: number } | undefined;
      return Number(row?.n ?? 0);
    }
    const row = database.prepare(`SELECT COUNT(*) AS n FROM sim_exec_outcomes`).get() as { n?: number } | undefined;
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

export function lastSimOutcomeTs(): number {
  const database = getDb();
  try {
    const r = database
      .prepare(`SELECT MAX(CASE WHEN ts>20000000000 THEN ts/1000 ELSE ts END) AS ts FROM sim_exec_outcomes`)
      .get() as { ts?: number } | undefined;
    return Number(r?.ts ?? 0);
  } catch {
    return 0;
  }
}

export function countSimByMint(sinceSec?: number): Array<{ mint: string; n: number }> {
  const database = getDb();
  try {
    const sql = sinceSec && sinceSec > 0
      ? `SELECT mint, COUNT(*) AS n FROM sim_exec_outcomes
         WHERE mint IS NOT NULL AND (CASE WHEN ts>20000000000 THEN ts/1000 ELSE ts END) >= ?
         GROUP BY mint ORDER BY n DESC LIMIT 20`
      : `SELECT mint, COUNT(*) AS n FROM sim_exec_outcomes
         WHERE mint IS NOT NULL GROUP BY mint ORDER BY n DESC LIMIT 20`;
    const stmt = database.prepare(sql);
    const rows = sinceSec && sinceSec > 0
      ? (stmt.all(Math.floor(Date.now() / 1000) - sinceSec) as Array<{ mint: string; n: number }>)
      : (stmt.all() as Array<{ mint: string; n: number }>);
    return rows ?? [];
  } catch {
    return [];
  }
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
      .prepare(`INSERT INTO candidates (mint, name, symbol, source, age_sec, lp_sol, buys60, sells60, uniques60, spread_bps, safety_ok, safety_reasons, topic_id, match_score, pool_address, lp_mint, pool_coin_account, pool_pc_account)
              VALUES (@mint, @name, @symbol, @source, @ageSec, @lpSol, @buys60, @sells60, @uniques60, @spreadBps, @safetyOk, @safetyReasons, @topicId, @matchScore, @poolAddress, @lpMint, @poolCoinAccount, @poolPcAccount)
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
                safety_reasons = excluded.safety_reasons, topic_id = excluded.topic_id,
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



export function upsertPosition(payload: { mint: string; quantity: number; averagePrice: number; realizedPnl?: number; unrealizedPnl?: number; state: string; ladderHits: string[]; trailActive: boolean; maeBps?: number }) {

  const database = getDb();

  database

    .prepare(`INSERT INTO positions (mint, quantity, average_price, realized_pnl, unrealized_pnl, state, ladder_hits, trail_active, mae_bps)

              VALUES (@mint, @quantity, @averagePrice, @realizedPnl, @unrealizedPnl, @state, @ladderHits, @trailActive, @maeBps)

              ON CONFLICT(mint) DO UPDATE SET

                quantity = excluded.quantity,

                average_price = excluded.average_price,

                realized_pnl = excluded.realized_pnl,

                unrealized_pnl = excluded.unrealized_pnl,

                state = excluded.state,

                ladder_hits = excluded.ladder_hits,

                trail_active = excluded.trail_active,

                mae_bps = excluded.mae_bps,

                updated_at = datetime('now')`)

    .run({

      mint: payload.mint,

      quantity: payload.quantity,

      averagePrice: payload.averagePrice,

      realizedPnl: payload.realizedPnl ?? 0,

      unrealizedPnl: payload.unrealizedPnl ?? 0,

      state: payload.state,

      ladderHits: JSON.stringify(payload.ladderHits),

      trailActive: payload.trailActive ? 1 : 0,

      maeBps: payload.maeBps ?? 0

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


export function listOpenPositions(): Array<{ mint: string; quantity: number; averagePrice: number; realizedPnl: number; unrealizedPnl: number; state: string; ladderHits: string[]; trailActive: boolean; maeBps: number }> {
  const database = getDb();
  const rows = database
    .prepare(`SELECT mint, quantity, average_price, realized_pnl, unrealized_pnl, state, ladder_hits, trail_active, mae_bps FROM positions WHERE state != 'CLOSED'`)
    .all() as Array<{ mint: string; quantity: number; average_price: number; realized_pnl: number; unrealized_pnl: number; state: string; ladder_hits: string; trail_active: number; mae_bps: number | null }>;
  return rows.map((row) => ({
    mint: row.mint,
    quantity: row.quantity ?? 0,
    averagePrice: row.average_price ?? 0,
    realizedPnl: row.realized_pnl ?? 0,
    unrealizedPnl: row.unrealized_pnl ?? 0,
    state: row.state ?? 'OPEN',
    ladderHits: safeParseArray(row.ladder_hits),
    trailActive: Boolean(row.trail_active),
    maeBps: row.mae_bps ?? 0
  }));
}


export function getCandidateByMint(mint: string): TokenCandidate | undefined {
  const database = getDb();
  const row = database
    .prepare(`SELECT mint, name, symbol, source, age_sec, lp_sol, buys60, sells60, uniques60, spread_bps, safety_ok, safety_reasons, topic_id, match_score, pool_address, lp_mint, pool_coin_account, pool_pc_account FROM candidates WHERE mint = ?`)
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

  lp: number;
  buys: number;
  sells: number;
  uniques: number;
  safetyOk: boolean;
  pool?: string | null;
  lpMint?: string | null;
}> {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT mint, name, lp_sol AS lp, buys60 AS buys, sells60 AS sells, uniques60 AS uniques, safety_ok AS safety_ok, pool_address AS pool, lp_mint AS lpMint
       FROM candidates
       ORDER BY updated_at DESC
       LIMIT @limit`
    )
    .all({ limit }) as Array<{
      mint: string;
      name: string;

      lp: number;
      buys: number;
      sells: number;
      uniques: number;
      safety_ok: number;
      pool?: string | null;
      lpMint?: string | null;
    }>;
  return rows.map((r) => ({
    mint: r.mint,
    name: r.name,
    
    lp: r.lp ?? 0,
    buys: r.buys ?? 0,
    sells: r.sells ?? 0,
    uniques: r.uniques ?? 0,
    safetyOk: Boolean(r.safety_ok),
    pool: r.pool ?? null,
    lpMint: r.lpMint ?? null
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

export function upsertRouteStat(input: { route: string; windowStartTs: number; success: boolean; slipRealBps: number; slipExpBps: number; weights: { slipExcessWeight: number; failRateWeight: number } }): { route: string; attempts: number; fails: number; avgSlipRealBps: number; avgSlipExpBps: number; penalty: number } {
  const database = getDb();
  const { route, windowStartTs, success, slipRealBps, slipExpBps, weights } = input;
  const row = database
    .prepare(`SELECT attempts, fails, avg_slip_real_bps AS avgSlipRealBps, avg_slip_exp_bps AS avgSlipExpBps FROM route_stats WHERE route = ? AND window_start_ts = ?`)
    .get(route, windowStartTs) as { attempts: number; fails: number; avgSlipRealBps: number; avgSlipExpBps: number } | undefined;
  const prevAttempts = row?.attempts ?? 0;
  const prevFails = row?.fails ?? 0;
  const attempts = prevAttempts + 1;
  const fails = prevFails + (success ? 0 : 1);
  const prevAvgReal = row?.avgSlipRealBps ?? 0;
  const prevAvgExp = row?.avgSlipExpBps ?? 0;
  const slipReal = Number.isFinite(slipRealBps) ? slipRealBps : 0;
  const slipExp = Number.isFinite(slipExpBps) ? slipExpBps : 0;
  const avgSlipRealBps = (prevAvgReal * prevAttempts + slipReal) / attempts;
  const avgSlipExpBps = (prevAvgExp * prevAttempts + slipExp) / attempts;
  const failRate = attempts > 0 ? fails / attempts : 0;
  const slipExcess = Math.max(0, avgSlipRealBps - avgSlipExpBps);
  const penalty = failRate * weights.failRateWeight + slipExcess * weights.slipExcessWeight;
  database
    .prepare(`INSERT INTO route_stats (route, window_start_ts, attempts, fails, avg_slip_real_bps, avg_slip_exp_bps, penalty) VALUES (@route, @windowStartTs, @attempts, @fails, @avgSlipRealBps, @avgSlipExpBps, @penalty) ON CONFLICT(route, window_start_ts) DO UPDATE SET attempts = @attempts, fails = @fails, avg_slip_real_bps = @avgSlipRealBps, avg_slip_exp_bps = @avgSlipExpBps, penalty = @penalty`)
    .run({ route, windowStartTs, attempts, fails, avgSlipRealBps, avgSlipExpBps, penalty });
  return { route, attempts, fails, avgSlipRealBps, avgSlipExpBps, penalty };
}

export function getRouteStats(windowStartTs: number): Array<{ route: string; attempts: number; fails: number; avgSlipRealBps: number; avgSlipExpBps: number; penalty: number }> {
  const database = getDb();
  const rows = database
    .prepare(`SELECT route, attempts, fails, avg_slip_real_bps AS avgSlipRealBps, avg_slip_exp_bps AS avgSlipExpBps, penalty FROM route_stats WHERE window_start_ts = ?`)
    .all(windowStartTs) as Array<{ route: string; attempts: number; fails: number; avgSlipRealBps: number; avgSlipExpBps: number; penalty: number }>;
  return rows;
}

export function insertLeaderHit(hit: { pool: string; wallet: string; ts: number }): boolean {
  const database = getDb();
  const result = database
    .prepare(`INSERT OR IGNORE INTO leader_hits (pool, wallet, ts) VALUES (@pool, @wallet, @ts)`)
    .run(hit);
  return (result.changes ?? 0) > 0;
}

export function upsertLeaderScore(entry: { wallet: string; score: number; lastSeenTs: number }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO leader_wallets (wallet, score, lastSeenTs) VALUES (@wallet, @score, @lastSeenTs)
      ON CONFLICT(wallet) DO UPDATE SET score = excluded.score, lastSeenTs = excluded.lastSeenTs`)
    .run(entry);
}

export function getRecentLeaderHits(pool: string, sinceTs: number): Array<{ wallet: string; ts: number }> {
  const database = getDb();
  const rows = database
    .prepare(`SELECT wallet, ts FROM leader_hits WHERE pool = @pool AND ts >= @sinceTs ORDER BY ts DESC`)
    .all({ pool, sinceTs }) as Array<{ wallet: string; ts: number }>;
  return rows;
}

export function getTopLeaderWallets(limit = 10): Array<{ wallet: string; score: number; lastSeenTs: number }> {
  const database = getDb();
  const rows = database
    .prepare(`SELECT wallet, score, lastSeenTs FROM leader_wallets ORDER BY score DESC LIMIT @limit`)
    .all({ limit }) as Array<{ wallet: string; score: number; lastSeenTs: number }>;
  return rows;
}


export function getLatestMigrationEvent(filter: { mint: string; pool?: string | null }): { ts: number; mint: string; pool: string | null } | undefined {
  const database = getDb();
  const { mint, pool } = filter;
  const byMint = database
    .prepare(`SELECT ts, mint, pool FROM migration_events WHERE mint = ? ORDER BY ts DESC LIMIT 1`)
    .get(mint) as { ts: number; mint: string; pool: string | null } | undefined;
  if (byMint) {
    return { ts: byMint.ts, mint: byMint.mint, pool: byMint.pool ?? null };
  }
  if (pool) {
    const byPool = database
      .prepare(`SELECT ts, mint, pool FROM migration_events WHERE pool = ? ORDER BY ts DESC LIMIT 1`)
      .get(pool) as { ts: number; mint: string; pool: string | null } | undefined;
    if (byPool) {
      return { ts: byPool.ts, mint: byPool.mint, pool: byPool.pool ?? null };
    }
  }
  return undefined;
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

export function insertExecOutcome(row: { ts: number; quotePrice: number; execPrice?: number | null; filled: number; route?: string | null; cuPrice?: number | null; slippageReq?: number | null; slippageReal?: number | null; timeToLandMs?: number | null; errorCode?: string | null; notes?: string | null; priorityFeeLamports?: number | null; amountIn?: number | null; amountOut?: number | null; feeLamportsTotal?: number | null }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO exec_outcomes (ts, quote_price, exec_price, filled, route, cu_price, slippage_bps_req, slippage_bps_real, time_to_land_ms, error_code, notes, priority_fee_lamports, amount_in, amount_out, fee_lamports_total)
              VALUES (@ts, @quotePrice, @execPrice, @filled, @route, @cuPrice, @slippageReq, @slippageReal, @timeToLandMs, @errorCode, @notes, @priorityFeeLamports, @amountIn, @amountOut, @feeLamportsTotal)`)
    .run({ ...row });
}

export type LunarScoreSummary = {
  windowMinutes: number;
  sampleCount: number;
  matchedCount: number;
  matchRate: number;
  avgBoost: number;
  maxBoost: number;
  avgGalaxy: number;
  avgDominance: number;
  avgInteractions: number;
  avgAltRank: number;
  avgRecency: number;
  lastScoreTs: number | null;
  lastMatchedTs: number | null;
};

export function getLunarSummary(windowMinutes = 60): LunarScoreSummary {
  const database = getDb();
  const minutes = Math.max(1, windowMinutes);
  const sinceTs = Date.now() - minutes * 60 * 1000;
  const rows = database
    .prepare('SELECT ts, features_json FROM scores WHERE ts >= ? ORDER BY ts DESC LIMIT 2000')
    .all(sinceTs) as Array<{ ts: number | null; features_json: string | null }>;
  if (!rows || rows.length === 0) {
    return {
      windowMinutes: minutes,
      sampleCount: 0,
      matchedCount: 0,
      matchRate: 0,
      avgBoost: 0,
      maxBoost: 0,
      avgGalaxy: 0,
      avgDominance: 0,
      avgInteractions: 0,
      avgAltRank: 0,
      avgRecency: 0,
      lastScoreTs: null,
      lastMatchedTs: null
    };
  }
  let sampleCount = 0;
  let matchedCount = 0;
  let sumBoost = 0;
  let maxBoost = 0;
  let sumGalaxy = 0;
  let sumDominance = 0;
  let sumInteractions = 0;
  let sumAltRank = 0;
  let sumRecency = 0;
  let lastScoreTs: number | null = null;
  let lastMatchedTs: number | null = null;

  for (const row of rows) {
    const tsRaw = typeof row.ts === 'number' ? row.ts : null;
    const ts = tsRaw && tsRaw < 1_000_000_000_000 ? tsRaw * 1000 : tsRaw;
    if (ts && (!lastScoreTs || ts > lastScoreTs)) {
      lastScoreTs = ts;
    }

    let features: any = null;
    try {
      features = row.features_json ? JSON.parse(row.features_json) : null;
    } catch {
      continue;
    }
    if (!features || typeof features !== 'object') {
      continue;
    }

    sampleCount += 1;
    const matched = Number(features.lunar_matched ?? features.lunarMatched) === 1;
    if (matched) {
      matchedCount += 1;
      if (ts && (!lastMatchedTs || ts > lastMatchedTs)) {
        lastMatchedTs = ts;
      }
      const boost = Number(features.lunar_boost);
      if (Number.isFinite(boost)) {
        sumBoost += boost;
        if (boost > maxBoost) {
          maxBoost = boost;
        }
      }
      const galaxy = Number(features.lunar_galaxy_norm);
      if (Number.isFinite(galaxy)) {
        sumGalaxy += galaxy;
      }
      const dominance = Number(features.lunar_dominance_norm);
      if (Number.isFinite(dominance)) {
        sumDominance += dominance;
      }
      const interactions = Number(features.lunar_interactions_log);
      if (Number.isFinite(interactions)) {
        sumInteractions += interactions;
      }
      const altRank = Number(features.lunar_alt_rank_norm);
      if (Number.isFinite(altRank)) {
        sumAltRank += altRank;
      }
      const recency = Number(features.lunar_recency_weight);
      if (Number.isFinite(recency)) {
        sumRecency += recency;
      }
    }
  }

  const matchedDenom = Math.max(1, matchedCount);
  return {
    windowMinutes: minutes,
    sampleCount,
    matchedCount,
    matchRate: sampleCount > 0 ? matchedCount / sampleCount : 0,
    avgBoost: matchedCount > 0 ? sumBoost / matchedDenom : 0,
    maxBoost,
    avgGalaxy: matchedCount > 0 ? sumGalaxy / matchedDenom : 0,
    avgDominance: matchedCount > 0 ? sumDominance / matchedDenom : 0,
    avgInteractions: matchedCount > 0 ? sumInteractions / matchedDenom : 0,
    avgAltRank: matchedCount > 0 ? sumAltRank / matchedDenom : 0,
    avgRecency: matchedCount > 0 ? sumRecency / matchedDenom : 0,
    lastScoreTs,
    lastMatchedTs
  };
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

export function getDailyPnlUsd(): number {
  try {
    const database = getDb();
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const row = database
      .prepare(`SELECT COALESCE(SUM(pnl_usd), 0) AS s FROM sizing_outcomes WHERE ts >= @since`)
      .get({ since: since.getTime() }) as { s?: number } | undefined;
    return Number(row?.s ?? 0);
  } catch {
    return 0;
  }
}

export function countOpenPositions(): number {
  try {
    const database = getDb();
    const row = database
      .prepare(`SELECT COUNT(*) AS n FROM positions WHERE quantity IS NOT NULL AND quantity > 0`)
      .get() as { n?: number } | undefined;
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

export function countNewPositionsToday(): number {
  try {
    const database = getDb();
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const row = database
      .prepare(`SELECT COUNT(*) AS n FROM exec_outcomes WHERE filled = 1 AND mint IS NOT NULL AND ts >= @since`)
      .get({ since: since.getTime() }) as { n?: number } | undefined;
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
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

// ---- Offline features helpers ----
export function listRecentSocialPosts(sinceTs: number): Array<{ author: string; text: string; ts: number; platform: string }> {
  const database = getDb();
  const rows = database
    .prepare(`SELECT author_id AS author, text, CAST(strftime('%s', captured_at) AS INTEGER) * 1000 AS ts, platform FROM social_posts WHERE CAST(strftime('%s', captured_at) AS INTEGER) * 1000 >= ? ORDER BY captured_at DESC LIMIT 5000`)
    .all(sinceTs) as Array<{ author: string; text: string; ts: number; platform: string }>;
  return rows.map((r) => ({ author: String(r.author ?? ''), text: String(r.text ?? ''), ts: Number(r.ts ?? 0), platform: String(r.platform ?? '') }));
}


export function getAuthorFeatures(authors: string[]): Record<string, { quality: number; posts24h: number; lastCalcTs: number }> {
  if (!authors || authors.length === 0) {
    return {};
  }
  const unique = Array.from(new Set(authors.filter((a) => typeof a === 'string' && a.length > 0)));
  if (unique.length === 0) {
    return {};
  }
  const database = getDb();
  const placeholders = unique.map((_, idx) => `@a${idx}`).join(', ');
  const stmt = database.prepare(`SELECT author, quality, posts24h, lastCalcTs FROM author_features WHERE author IN (${placeholders})`);
  const params: Record<string, string> = {};
  unique.forEach((author, idx) => {
    params[`a${idx}`] = author;
  });
  const rows = stmt.all(params) as Array<{ author: string; quality: number; posts24h: number; lastCalcTs: number }>;
  const out: Record<string, { quality: number; posts24h: number; lastCalcTs: number }> = {};
  for (const row of rows) {
    if (!row || typeof row.author !== 'string') continue;
    out[row.author] = {
      quality: Number(row.quality ?? 0),
      posts24h: Number(row.posts24h ?? 0),
      lastCalcTs: Number(row.lastCalcTs ?? 0)
    };
  }
  return out;
}

export function listAuthorsByKeywords(keywords: string[], sinceTs: number, limit = 200): string[] {
  const terms = Array.from(new Set((keywords ?? []).map((k) => (k ?? '').toLowerCase()).filter((k) => k.length > 1)));
  if (terms.length === 0) {
    return [];
  }
  const database = getDb();
  const clauses = terms.map((_, idx) => `LOWER(text) LIKE @k${idx}`);
  const sql = `SELECT DISTINCT author_id AS author
    FROM social_posts
    WHERE CAST(strftime('%s', captured_at) AS INTEGER) * 1000 >= @since
      AND (${clauses.join(' OR ')})
    ORDER BY captured_at DESC
    LIMIT @limit`;
  const stmt = database.prepare(sql);
  const params: Record<string, unknown> = { since: sinceTs, limit };
  terms.forEach((term, idx) => {
    params[`k${idx}`] = `%${term}%`;
  });
  const rows = stmt.all(params) as Array<{ author: string | null | undefined }>;
  return rows
    .map((row) => (row.author ?? '').toString())
    .filter((author) => author.length > 0);
}

export function upsertAuthorFeature(row: { author: string; quality: number; posts24h: number; lastCalcTs: number }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO author_features (author, quality, posts24h, lastCalcTs)
              VALUES (@author, @quality, @posts24h, @lastCalcTs)
              ON CONFLICT(author) DO UPDATE SET
                quality = excluded.quality,
                posts24h = excluded.posts24h,
                lastCalcTs = excluded.lastCalcTs`)
    .run(row);
}

export function insertPumpSignal(row: { ts: number; mint: string; pumpProb: number; samples: number }): void {
  const database = getDb();
  database
    .prepare(`INSERT INTO pump_signals (ts, mint, pump_prob, samples) VALUES (@ts, @mint, @pumpProb, @samples)`)
    .run(row);
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
