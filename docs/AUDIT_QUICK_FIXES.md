# Audit Quick Fixes

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
