# Model Promotion & Runtime Reload

This guide covers training, gating, promotion, and hot‑reloading of models (Alpha, FillNet, RugGuard, Survival).

## Prerequisites
- Node 20+, Python 3.10+, pnpm, SQLite write access.
- Verify data health and views:
  - `pnpm exec tsx tools/sql/check_training_data.ts`
  - Optional seed for dev: `pnpm exec tsx tools/sql/seed_training_data.ts`

## Train
- Alpha (Python): `pnpm run py:install` then `pnpm run train:alpha:gpu`
- FillNet: `pnpm run train:fillnet:gpu`
- RugGuard: `pnpm run train:rugguard`
- Survival: `pnpm run train:survival`

Outputs are written to `models/`:
- `models/alpha_ranker_v1.json`
- `models/fillnet_v2.json`
- `models/rugguard_v2.json`
- `models/survival_v1.json`

Trainers now emit flattened metrics and sample counts used by promotion gates.

## Promote
- Run: `python training_py/promote_gpu.py`
- The script gates each candidate using trainer metrics and (if present) `pnpm run backtest` / `pnpm run ope`.
- On success it copies the candidate file to the production alias and triggers a runtime reload.

Environment overrides:
- `PROMOTE_FILLNET_RELOAD_URL` (default `http://127.0.0.1:4011/control/reload-models`)
- `PROMOTE_ALPHA_RELOAD_URL` (default `http://127.0.0.1:4021/control/reload-models`)

## Runtime Reload
- Executor (FillNet): `POST http://127.0.0.1:4011/control/reload-models`
- Alpha ranker:        `POST http://127.0.0.1:4021/control/reload-models`

## Metrics
- Alpha:
  - `alpha_model_epoch_seconds`
  - `alpha_model_status{status="ok|degraded|missing|error|unknown"}`
- FillNet:
  - `fillnet_model_epoch_seconds`
  - `fillnet_model_status{status="ok|degraded|missing|error|unknown"}`

Grafana suggestions:
- Single‑stat for “Alpha Model Age” and “FillNet Model Age”.
- Bar or table for current `*_model_status` label active (=1).

## Troubleshooting
- Views missing/data thin → run `tools/sql/check_training_data.ts` and seed for dev.
- No reload effect → ensure the process runs on the same host/port; override `PROMOTE_*_RELOAD_URL` for remote.
- Backtest/OPE absent → define `pnpm run backtest` / `pnpm run ope` or rely on gates; promotion will skip if these fail.
