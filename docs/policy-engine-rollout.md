# Policy Engine Sizing & Reward Matching Rollout

This document outlines how to safely roll out the latest policy-engine changes:

- Flow-aware sizing caps (`flowCapRewrite`)
- Risk-aware constrained sizing (`constrainedRiskScaling`)
- Order-level reward attribution (`orderIdRewardMatching`)

Each feature is guarded by a config flag so you can stage the rollout and fall back quickly if needed.

## Feature Flags

| Feature | Config key | Env override | Default |
| ------- | ---------- | ------------ | ------- |
| Flow-aware sizing caps | `features.flowCapRewrite` | `FEATURE_FLOW_CAP_REWRITE` | `true` |
| Risk-aware constrained sizing | `features.constrainedRiskScaling` | `FEATURE_CONSTRAINED_RISK_SCALING` | `true` |
| Order-level reward matching | `features.orderIdRewardMatching` | `FEATURE_ORDER_ID_REWARD_MATCHING` | `true` |

Set any of the flags to `false` in `config/default.yaml`, an override file, or via the listed environment variable to revert to the legacy behaviour.

## Suggested Rollout Sequence

1. **Shadow / Replay Validation**
   - Deploy with all three flags set to `false` to reproduce the legacy behaviour.
   - Enable the new metrics (see below) and verify during replay or shadow runs.

2. **Enable Flow Caps (`flowCapRewrite`)**
   - Turn on `flowCapRewrite` alone.
   - Monitor `policy_sizing_cap_limit_total{cap="flow"}` to confirm flow-based clamps behave as expected and that total plan volume is healthy.

3. **Enable Risk Scaling (`constrainedRiskScaling`)**
   - Turn on `constrainedRiskScaling` while leaving `orderIdRewardMatching` disabled.
   - Watch `policy_sizing_risk_multiplier` and `policy_sizing_risk_scaled_total` for unexpected spikes.

4. **Enable Order-Level Reward Matching (`orderIdRewardMatching`)**
   - Once sizing looks stable, switch on the order-id queue so bandit updates use precise fill attribution.
   - Monitor bandit metrics and the debug log `no pending selection matched exec outcome`; if this regresses, toggle the flag off to revert to mint-only matching.

## Observability

New Prometheus metrics land with these changes:

- `policy_sizing_cap_limit_total{cap=...}` – which cap constrained sizing (includes `flow`, `usd_cap`, etc.).
- `policy_sizing_sol_price_source_total{source=...}` – tracks the SOL price source (`db`, `hint`, `missing`). Expect `missing` during cold starts only.
- `policy_sizing_risk_multiplier` – last applied risk multiplier (1.0 when risk scaling is disabled or not triggered).
- `policy_sizing_risk_scaled_total{factor=...}` – counts when a risk factor (`rugProb`, `pFill`, `expSlipBps`) reduced size.

## Rollback

If production behaviour regresses, toggle the relevant flags to `false` and redeploy. The service will immediately fall back to:

- Liquidity-only flow caps when `flowCapRewrite=false`
- Legacy constrained sizing when `constrainedRiskScaling=false`
- Mint/time based reward attribution when `orderIdRewardMatching=false`

No schema migrations are required; these changes are purely in-process.
