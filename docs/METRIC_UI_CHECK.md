# Metric/UI Check

Implemented (high-level):
- leader_wallets_top (gauge per rank/wallet)
- policy_leader_boost_total (counter)
- OPE (IPS/WIS/DR) via CLI backtest_results rows (not Prometheus)

Offline ML Pack metrics:
- features_job_runs_total
- features_job_posts_embedded_total
- author_quality_avg
- pump_classifier_inferences_total
- rugguard_avg_pump_prob
- fillnet_calib_bucket{bucket}
- fillnet_calib_brier

Notes:
- OPE outputs are persisted to SQLite backtest_results from tools/ope and tools/backtest; consume via agent-core snapshot or external scripts.
- Route quarantine stats are exposed by executor (/route-quality) and surfaced in UI table.
