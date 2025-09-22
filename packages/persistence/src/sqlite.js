"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.withTransaction = withTransaction;
exports.recordHeartbeat = recordHeartbeat;
exports.storeTopicEvent = storeTopicEvent;
exports.upsertTopicCluster = upsertTopicCluster;
exports.fetchTopicClusters = fetchTopicClusters;
exports.upsertTopicWindow = upsertTopicWindow;
exports.removeTopicWindow = removeTopicWindow;
exports.fetchTopicWindows = fetchTopicWindows;
exports.fetchActiveTopicWindows = fetchActiveTopicWindows;
exports.recordTopicMatch = recordTopicMatch;
exports.loadPhraseBaseline = loadPhraseBaseline;
exports.upsertPhraseBaseline = upsertPhraseBaseline;
exports.storeTokenCandidate = storeTokenCandidate;
exports.logTradeEvent = logTradeEvent;
exports.upsertPosition = upsertPosition;
exports.recordSizingDecision = recordSizingDecision;
exports.closeDb = closeDb;
exports.storeSocialPost = storeSocialPost;
exports.getOpenPositionsCount = getOpenPositionsCount;
exports.getDailySizingSpendSince = getDailySizingSpendSince;
exports.getDailyRealizedPnlSince = getDailyRealizedPnlSince;
exports.recordPolicyAction = recordPolicyAction;
exports.loadBanditState = loadBanditState;
exports.upsertBanditState = upsertBanditState;
exports.listOpenPositions = listOpenPositions;
exports.getCandidateByMint = getCandidateByMint;
exports.recordOrderPlan = recordOrderPlan;
exports.recordFill = recordFill;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const config_1 = require("@trenches/config");
const logger_1 = require("@trenches/logger");
const logger = (0, logger_1.createLogger)('sqlite');
const MIGRATIONS = [
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
let db = null;
function ensureDataDir(filePath) {
    const dir = path_1.default.dirname(filePath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
function openDb() {
    const cfg = (0, config_1.getConfig)();
    ensureDataDir(cfg.persistence.sqlitePath);
    const instance = new better_sqlite3_1.default(cfg.persistence.sqlitePath, { timeout: 5000 });
    instance.pragma('journal_mode = WAL');
    instance.pragma('synchronous = NORMAL');
    instance.pragma('foreign_keys = ON');
    return instance;
}
function runMigrations(instance) {
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
function getDb() {
    if (!db) {
        db = openDb();
        runMigrations(db);
    }
    return db;
}
function withTransaction(fn) {
    const database = getDb();
    const trx = database.transaction(() => fn(database));
    return trx();
}
function recordHeartbeat(component, status, message) {
    const database = getDb();
    database
        .prepare('INSERT INTO heartbeats (component, status, message) VALUES (?, ?, ?)')
        .run(component, status, message ?? null);
}
function storeTopicEvent(event) {
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
function upsertTopicCluster(cluster) {
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
function fetchTopicClusters() {
    const database = getDb();
    const rows = database
        .prepare(`SELECT topic_id, label, centroid_json, phrases, sss, novelty, updated_at FROM topic_clusters ORDER BY updated_at DESC`)
        .all();
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
function upsertTopicWindow(window) {
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
function removeTopicWindow(windowId) {
    const database = getDb();
    database.prepare('DELETE FROM topic_windows WHERE window_id = ?').run(windowId);
}
function fetchTopicWindows() {
    const database = getDb();
    const rows = database
        .prepare(`SELECT window_id, topic_id, opened_at, expires_at, last_refresh, sss, novelty FROM topic_windows`)
        .all();
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
function fetchActiveTopicWindows(referenceIso) {
    const database = getDb();
    const rows = database
        .prepare(`SELECT window_id, topic_id, opened_at, expires_at, last_refresh, sss, novelty
              FROM topic_windows
              WHERE expires_at > @reference
              ORDER BY expires_at ASC`)
        .all({ reference: referenceIso });
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
function recordTopicMatch(match) {
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
function loadPhraseBaseline() {
    const database = getDb();
    const rows = database
        .prepare(`SELECT phrase, count, engagement, authors, updated_at FROM phrase_baseline`)
        .all();
    return rows.map((row) => ({
        phrase: row.phrase,
        count: row.count ?? 0,
        engagement: row.engagement ?? 0,
        authors: row.authors ?? 0,
        updatedAt: row.updated_at
    }));
}
function upsertPhraseBaseline(entry) {
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
function storeTokenCandidate(candidate) {
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
}
function logTradeEvent(event) {
    const database = getDb();
    database
        .prepare('INSERT INTO events (event_type, payload) VALUES (?, ?)')
        .run(event.t, JSON.stringify(event));
}
function upsertPosition(payload) {
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
function recordSizingDecision(input) {
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
function closeDb() {
    if (db) {
        db.close();
        db = null;
        logger.info('closed sqlite connection');
    }
}
function storeSocialPost(post) {
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
function getOpenPositionsCount() {
    const database = getDb();
    const row = database
        .prepare("SELECT COUNT(*) AS cnt FROM positions WHERE state NOT IN ('CLOSED', 'EXITED')")
        .get();
    return row?.cnt ?? 0;
}
function getDailySizingSpendSince(isoTimestamp) {
    const database = getDb();
    const row = database
        .prepare('SELECT COALESCE(SUM(final_size), 0) AS total FROM sizing_decisions WHERE created_at >= ?')
        .get(isoTimestamp);
    return row?.total ?? 0;
}
function getDailyRealizedPnlSince(isoTimestamp) {
    const database = getDb();
    const rows = database
        .prepare("SELECT payload FROM events WHERE event_type = 'exit' AND created_at >= ?")
        .all(isoTimestamp);
    let total = 0;
    for (const row of rows) {
        try {
            const payload = JSON.parse(row.payload);
            if (payload && typeof payload.pnl === 'number') {
                total += payload.pnl;
            }
        }
        catch (err) {
            logger.warn({ err }, 'failed to parse exit payload for pnl aggregation');
        }
    }
    return total;
}
function recordPolicyAction(input) {
    const database = getDb();
    database
        .prepare(`INSERT INTO policy_actions (action_id, mint, context, parameters, reward)
       VALUES (@actionId, @mint, @context, @parameters, @reward)`)
        .run({
        actionId: input.actionId,
        mint: input.mint,
        context: JSON.stringify(input.context),
        parameters: JSON.stringify(input.parameters),
        reward: input.reward ?? null
    });
}
function loadBanditState() {
    const database = getDb();
    const rows = database
        .prepare('SELECT action_id, ainv, b FROM bandit_state')
        .all();
    return rows.map((row) => ({
        actionId: row.action_id,
        ainv: JSON.parse(row.ainv),
        b: JSON.parse(row.b)
    }));
}
function upsertBanditState(input) {
    const database = getDb();
    database
        .prepare(`INSERT INTO bandit_state (action_id, ainv, b)
       VALUES (@actionId, @ainv, @b)
       ON CONFLICT(action_id) DO UPDATE SET
         ainv = excluded.ainv,
         b = excluded.b,
         updated_at = datetime('now')`)
        .run({
        actionId: input.actionId,
        ainv: JSON.stringify(input.ainv),
        b: JSON.stringify(input.b)
    });
}
function listOpenPositions() {
    const database = getDb();
    const rows = database
        .prepare(`SELECT mint, quantity, average_price, realized_pnl, unrealized_pnl, state, ladder_hits, trail_active FROM positions WHERE state != 'CLOSED'`)
        .all();
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
function getCandidateByMint(mint) {
    const database = getDb();
    const row = database
        .prepare(`SELECT mint, name, symbol, source, age_sec, lp_sol, buys60, sells60, uniques60, spread_bps, safety_ok, safety_reasons, ocrs, topic_id, match_score, pool_address, lp_mint, pool_coin_account, pool_pc_account FROM candidates WHERE mint = ?`)
        .get(mint);
    if (!row)
        return undefined;
    const candidate = {
        t: 'token_candidate',
        mint: row.mint,
        name: row.name,
        symbol: row.symbol,
        source: row.source ?? 'raydium',
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
function safeParseNumberArray(value) {
    if (!value)
        return [];
    let raw;
    if (typeof value === 'string') {
        try {
            raw = JSON.parse(value);
        }
        catch {
            return [];
        }
    }
    else if (Array.isArray(value)) {
        raw = value;
    }
    else {
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
function safeParseArray(value) {
    if (!value)
        return [];
    if (Array.isArray(value)) {
        return value.map(String);
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.map(String) : [];
        }
        catch {
            return [];
        }
    }
    return [];
}
function recordOrderPlan(order) {
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
function recordFill(fill) {
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
//# sourceMappingURL=sqlite.js.map