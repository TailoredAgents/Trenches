# SHADOW Soak Checklist

## SLOs to watch in SHADOW
- First-minute (age<=60s): landed >= 0.94, p50 TTL <= 1300 ms, p95 <= 2600 ms, avg slip <= 25 bps
- Overall: landed >= 0.92
- Quarantine: >=1 bad route excluded; avg slip (bps) improves vs prior window
- Net after costs: non-negative over soak window (if prices available)

## How to run
- Example: `pnpm soak:summary --from <ISO> --to <ISO>`
