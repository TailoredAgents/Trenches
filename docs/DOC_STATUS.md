# DOC STATUS

## Done in pre-flight
- Real slippage recorded and surfaced in executor metrics.
- Position manager MAE captured and persisted for dashboards.
- Shared SSE reconnect helper documented and rolled out across services.
- Trainer outputs now include validation metrics and are referenced in specs.
- Config flag wiring for Jito fallback and migration preset captured in docs.

## Done: Phase F Slices 1–5
- Migration Preset, Route Quarantine scaffolding, Leader Wallets wiring, OPE polish, Price Updater.

## Next: Soak & Tune
- Run 24–48h SHADOW soak with Preset + Quarantine + Leader + Price Updater.
- Use `pnpm soak:summary` to review route quality and execution SLOs.

## Done: Offline ML Pack
- Nightly features job and pump classifier (offline); FillNet calibration; docs and smokes.
