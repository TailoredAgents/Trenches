# Policy & Safety Patch Map

## Safety: RugGuard

- New module: services/safety-engine/src/rugguard.ts
  - `export async function classify(mint, features): Promise<RugGuardVerdict>`
  - Features include: mint authority/freeze authority revocation, LP lock/burn truth, transfer-tax/blacklist indicators, holder skew/sniper share, spread/age/flow.
  - Returns `rugProb` [0..1] and reasons.

- Integrate into safety-engine
  - During `evaluateCandidate`, call RugGuard and compute `rugProb`.
  - Replace OCRS hard-threshold gating with rugProb threshold + reasons (keep OCRS as feature if helpful); emit on `/events/safe` only when `rugProb <= threshold`.
  - Persist `rug_verdicts` with reasons and ts.

## Policy: Constrained Sizing & Execution Policy

- Constrained Contextual Bandit (policy-engine)
  - New module: services/policy-engine/src/sizing_constrained.ts
  - `chooseSize(context): SizeDecision` using cVaR-tilted reward, wallet caps, daily loss, per-mint caps.
  - Replace LinUCB for size; keep bandit bundles for route/gate until FeeBandit is enabled.

- Execution Policy Inputs
  - Consume `AlphaRanker` scores (aux signal), `RugGuardVerdict`, and congestion proxy.
  - When `features.feeBandit`/`features.fillNet` enabled, include decision in `OrderPlan` (compute unit price, slippage) and record in SQLite.

## Feature Flags

- `features.rugGuard`, `features.constrainedSizing`

