export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function quantileFloor(values: number[], q: number): number {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const ratio = Number.isFinite(q) ? q : 0;
  const index = Math.floor((sorted.length - 1) * ratio);
  const clampedIndex = Math.max(0, Math.min(sorted.length - 1, index));
  return sorted[clampedIndex];
}
