-- 1) FillNet training view
CREATE VIEW IF NOT EXISTS fill_training_view AS
SELECT
  (CASE WHEN eo.ts > 20000000000 THEN eo.ts/1000 ELSE eo.ts END) AS ts,
  eo.route,
  eo.mint,
  COALESCE(eo.filled, 0)                AS y_fill,
  COALESCE(eo.slippage_bps_real, 0)     AS y_slip_bps,
  COALESCE(eo.time_to_land_ms, 0)       AS y_ttl_ms,
  COALESCE(eo.slippage_bps_req, 0)      AS req_slippage_bps,
  COALESCE(eo.cu_price, 0)              AS req_cu_price
FROM exec_outcomes eo
WHERE (CASE WHEN eo.ts > 20000000000 THEN eo.ts/1000 ELSE eo.ts END) >= strftime('%s','now') - 90*24*3600
  AND eo.route IS NOT NULL
UNION ALL
SELECT
  (CASE WHEN se.ts > 20000000000 THEN se.ts/1000 ELSE se.ts END) AS ts,
  se.route,
  se.mint,
  COALESCE(se.filled, 0),
  COALESCE(se.slippage_bps_real, 0),
  COALESCE(se.time_to_land_ms, 0),
  COALESCE(se.slippage_bps_req, 0),
  COALESCE(se.cu_price, 0)
FROM sim_exec_outcomes se
WHERE (CASE WHEN se.ts > 20000000000 THEN se.ts/1000 ELSE se.ts END) >= strftime('%s','now') - 90*24*3600;

-- 2) AlphaRanker training view
CREATE VIEW IF NOT EXISTS alpha_training_view AS
WITH all_exec AS (
  SELECT mint, (CASE WHEN ts > 20000000000 THEN ts/1000 ELSE ts END) AS ts, exec_price
  FROM exec_outcomes
  WHERE (CASE WHEN ts > 20000000000 THEN ts/1000 ELSE ts END) >= strftime('%s','now') - 90*24*3600 AND mint IS NOT NULL AND filled = 1
  UNION ALL
  SELECT mint, (CASE WHEN ts > 20000000000 THEN ts/1000 ELSE ts END) AS ts, exec_price
  FROM sim_exec_outcomes
  WHERE (CASE WHEN ts > 20000000000 THEN ts/1000 ELSE ts END) >= strftime('%s','now') - 90*24*3600 AND mint IS NOT NULL AND filled = 1
),
first_exec AS (
  SELECT mint, MIN(ts) AS entry_ts
  FROM all_exec
  GROUP BY mint
),
entry AS (
  SELECT fe.mint, fe.entry_ts, ae.exec_price AS entry_price
  FROM first_exec fe
  JOIN all_exec ae ON ae.mint = fe.mint AND ae.ts = fe.entry_ts
),
win10 AS (
  SELECT e.mint, MAX(ae.exec_price) AS pmax10
  FROM entry e JOIN all_exec ae ON ae.mint = e.mint AND ae.ts BETWEEN e.entry_ts AND e.entry_ts + 600
  GROUP BY e.mint
),
win60 AS (
  SELECT e.mint, MAX(ae.exec_price) AS pmax60
  FROM entry e JOIN all_exec ae ON ae.mint = e.mint AND ae.ts BETWEEN e.entry_ts AND e.entry_ts + 3600
  GROUP BY e.mint
)
SELECT
  e.mint,
  e.entry_ts,
  e.entry_price,
  COALESCE(w10.pmax10, e.entry_price) AS pmax10,
  COALESCE(w60.pmax60, e.entry_price) AS pmax60,
  CASE WHEN COALESCE(w10.pmax10, e.entry_price) >= e.entry_price * 1.05 THEN 1 ELSE 0 END AS y_payoff_10m,
  CASE WHEN COALESCE(w60.pmax60, e.entry_price) >= e.entry_price * 1.15 THEN 1 ELSE 0 END AS y_payoff_60m
FROM entry e
LEFT JOIN win10 w10 ON w10.mint = e.mint
LEFT JOIN win60 w60 ON w60.mint = e.mint;

-- 3) RugGuard training view (SQLite-compatible, no FULL OUTER JOIN)
CREATE VIEW IF NOT EXISTS rug_training_view AS
WITH good AS (
  SELECT mint, MIN(ts) AS first_ts
  FROM exec_outcomes
  WHERE mint IS NOT NULL AND filled = 1
    AND ts >= strftime('%s','now') - 30*24*3600
  GROUP BY mint
),
alive24 AS (
  SELECT g.mint
  FROM good g
  JOIN exec_outcomes eo ON eo.mint = g.mint AND eo.ts >= g.first_ts + 24*3600
  GROUP BY g.mint
),
bad AS (
  SELECT DISTINCT mint
  FROM rug_verdicts
  WHERE ts >= strftime('%s','now') - 30*24*3600 AND rug_prob >= 0.8
),
labels AS (
  SELECT g.mint AS mint,
         CASE WHEN bad.mint IS NOT NULL THEN 1
              WHEN alive24.mint IS NOT NULL THEN 0
              ELSE NULL END AS y_bad
  FROM good g
  LEFT JOIN alive24 ON alive24.mint = g.mint
  LEFT JOIN bad ON bad.mint = g.mint
  UNION
  SELECT bad.mint AS mint,
         1 AS y_bad
  FROM bad LEFT JOIN good ON good.mint = bad.mint
  WHERE good.mint IS NULL
)
SELECT mint, y_bad AS label_rug
FROM labels
WHERE y_bad IS NOT NULL;

-- 4) Survival training view
CREATE VIEW IF NOT EXISTS survival_training_view AS
WITH all_exec AS (
  SELECT mint, (CASE WHEN ts > 20000000000 THEN ts/1000 ELSE ts END) AS ts, exec_price
  FROM exec_outcomes
  WHERE (CASE WHEN ts > 20000000000 THEN ts/1000 ELSE ts END) >= strftime('%s','now') - 90*24*3600 AND mint IS NOT NULL AND filled = 1
  UNION ALL
  SELECT mint, (CASE WHEN ts > 20000000000 THEN ts/1000 ELSE ts END) AS ts, exec_price
  FROM sim_exec_outcomes
  WHERE (CASE WHEN ts > 20000000000 THEN ts/1000 ELSE ts END) >= strftime('%s','now') - 90*24*3600 AND mint IS NOT NULL AND filled = 1
),
entry AS (
  SELECT mint, MIN(ts) AS entry_ts FROM all_exec GROUP BY mint
),
entry_price AS (
  SELECT e.mint, e.entry_ts, ae.exec_price AS entry_price
  FROM entry e JOIN all_exec ae ON ae.mint = e.mint AND ae.ts = e.entry_ts
),
path AS (
  SELECT e.mint,
         MAX(CASE WHEN ae.ts BETWEEN e.entry_ts AND e.entry_ts + 3600 THEN ae.exec_price END) AS pmax60,
         MIN(CASE WHEN ae.ts BETWEEN e.entry_ts AND e.entry_ts + 3600 THEN ae.exec_price END) AS pmin60
  FROM entry e
  LEFT JOIN all_exec ae ON ae.mint = e.mint
  GROUP BY e.mint
)
SELECT
  ep.mint,
  ep.entry_ts,
  ep.entry_price,
  p.pmax60,
  p.pmin60,
  (p.pmax60 - ep.entry_price) / ep.entry_price * 1e4 AS peak_bps_60m,
  (ep.entry_price - p.pmin60) / ep.entry_price * 1e4 AS mae_bps_60m
FROM entry_price ep
LEFT JOIN path p ON p.mint = ep.mint;
