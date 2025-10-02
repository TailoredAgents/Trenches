# Metric/UI Check

Implemented (high-level):
- leader_wallets_top (gauge per rank/wallet)
- policy_leader_boost_total (counter)
- OPE (IPS/WIS/DR) via CLI backtest_results rows (not Prometheus)

Notes:
- OPE outputs are persisted to SQLite backtest_results from tools/ope and tools/backtest; consume via agent-core snapshot or external scripts.
- Route quarantine stats are exposed by executor (/route-quality) and surfaced in UI table.

