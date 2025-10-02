# Audit Quick Fixes

## Applied (2025-10-01)

- **env.example** (applied): add missing service port overrides so the sample file matches the config schema.
```diff
@@
-# ---- Service Ports ----
-MIGRATION_WATCHER_PORT=4018
+# ---- Service Ports ----
+AGENT_CORE_PORT=4010
+EXECUTOR_PORT=4011
+SOCIAL_INGESTOR_PORT=4012
+ONCHAIN_DISCOVERY_PORT=4013
+SAFETY_ENGINE_PORT=4014
+POLICY_ENGINE_PORT=4015
+POSITION_MANAGER_PORT=4016
+NARRATIVE_MINER_PORT=4017
+MIGRATION_WATCHER_PORT=4018
+UI_PORT=3000
```

- **env.example** (applied): drop the unused `MODE` variable to avoid suggesting a dead knob.
```diff
@@
-AGENT_MODE=SIM
-MODE=SIM
+AGENT_MODE=SIM
```

- **apps/ui-gateway/app/api/metrics/route.ts** (applied): default missing metrics to 0 so the dashboard never surfaces `NaN`.
```diff
@@
-  const exposure = pm['position_manager_total_size_sol'];
-  const opened = pm['positions_opened_total'];
-  const trailing = pm['position_trailing_activated_total'];
+  const exposure = pm['position_manager_total_size_sol'] ?? 0;
+  const opened = pm['positions_opened_total'] ?? 0;
+  const trailing = pm['position_trailing_activated_total'] ?? 0;
```

- **services/executor/src/index.ts** (applied): persist `slippage_bps_real` using the realized execution vs quoted price so downstream telemetry sees non-zero slip.

- **services/position-manager/src/index.ts**, **packages/persistence/src/sqlite.ts** (applied): track running MAE per open position, add `mae_bps` to the `positions` table, persist on every update and on sizing outcomes.

- **packages/util/src/sseClient.ts** + consumers (applied): shared SSE client with Last-Event-ID reconnect now powers executor, safety-engine, onchain-discovery, policy-engine, and UI dashboard; added short TTL deduping for candidate/migration feeds.

- **packages/config/src/index.ts** (applied): feature flag `features.jitoEnabled` now gates runtime fallback to Jito endpoints; metrics reflect the flag.

- **training/fillnet/train.ts**, **training/alpha_ranker/train.ts**, **training/rugguard/train.ts** (applied): trainers emit calibration/validation metrics to stdout and embed summaries into exported model JSON.

## Pending

- _None._
