import { TokenCandidate } from '@trenches/shared';

export type TokenSafetyResult = {
  ok: boolean;
  reasons: string[];
  isToken2022: boolean;
};

export type LpSafetyResult = {
  ok: boolean;
  reasons: string[];
  lockedRatio: number;
};

export type HolderSafetyResult = {
  ok: boolean;
  reasons: string[];
  topTenShare: number;
  whaleFlag: boolean;
};

export type SafetyEvaluation = {
  ok: boolean;
  reasons: string[];
  ocrs: number;
  whaleFlag: boolean;
  features: Record<string, number>;
  rugProb?: number;
};

export type CandidateContext = {
  candidate: TokenCandidate;
  now: number;
};
