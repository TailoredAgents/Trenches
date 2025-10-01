# Streaming Operations Guide

## Prerequisites
- Configure `SOLANA_PRIMARY_RPC_URL` (defaults to `http://127.0.0.1:8899`) and, if required, `SOLANA_WS_URL` and `SOLANA_RPC_HTTP_HEADERS` for auth tokens.
- Ensure the validator or reverse proxy is reachable from the host running onchain-discovery; open TCP 8899 and WS port if separate.
- Populate other provider keys (BirdEye, SolanaTracker) as needed in `.env`.

## Start and Stop
- `./scripts/start-stream.sh` – exports `.env`, launches `@trenches/onchain-discovery`, writes logs to `logs/onchain-discovery.log`, stores PID in `logs/onchain-discovery.pid`.
- `./scripts/stop-stream.sh` – reads PID file, sends `SIGTERM`, deletes the PID file.

## Routine Checks
- Log tail: `tail -f logs/onchain-discovery.log` – watch for `raydium_watcher` reconnects or auth errors.
- Health endpoint: `curl http://127.0.0.1:4013/healthz` – confirms Birdeye/SolanaTracker readiness and RPC reachability.
- Metrics: `curl http://127.0.0.1:4013/metrics` – key gauges/counters include `raydium_last_pool_slot`, `raydium_watcher_reconnects_total`, `raydium_watcher_errors_total`, and cache hit/miss ratios.

## Validator Maintenance
- Snapshot rotation or validator restarts: expect one reconnect spike; sustained increases in `raydium_watcher_reconnects_total` indicate instability.
- Authentication changes (token rotation, firewall update): set new headers in `SOLANA_RPC_HTTP_HEADERS` (JSON map) and restart the service with `stop-stream.sh` then `start-stream.sh`.
- To verify freshness, confirm `raydium_last_pool_slot` advances and compare against the validator’s current slot via your RPC monitoring tools.

## Operational Notes
- Keep the stream active only during monitoring windows to conserve resources.
- Investigate consecutive errors labelled `auth` or `network` in `raydium_watcher_errors_total`; they typically signal expired credentials or connectivity issues.
- When working from a restricted network, configure SSH tunnelling (e.g., `ssh -L 8899:validator:8899`) before starting the service so the local default URL remains valid.
