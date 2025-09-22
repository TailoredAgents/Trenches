export function slippageBpsByPoolAge(ageSec: number): [number, number] {
  if (ageSec < 30) return [500, 800];
  if (ageSec < 60) return [300, 500];
  if (ageSec < 120) return [100, 200];
  return [50, 150];
}

export function pickSlippageBps(ageSec: number, actionSlippage: number): number {
  const [lo, hi] = slippageBpsByPoolAge(ageSec);
  const base = Math.min(Math.max(actionSlippage, lo), hi);
  return Math.round(base);
}
