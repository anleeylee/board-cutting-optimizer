/**
 * score.ts — Layout scoring and strategy weights.
 *
 * Score = Yield Weight · yield + Waste Weight · (1 − waste%) + Cuts Weight · (1 − cuts/parts)
 *         − Grain Penalty − Defect Penalty
 *
 * Modes let the user switch between Maximum Yield, Minimum Waste, Minimum
 * Cuts, Grain Priority and Balanced.
 */

import type { BoardLayout, CutStrategy } from './types';

export interface ScoreWeights {
  yield: number;
  waste: number;
  cuts: number;
  grain: number;
}

export const LAYOUT_SCORE_WEIGHTS: Record<CutStrategy, ScoreWeights> = {
  'max-yield': { yield: 1.0, waste: 0.2, cuts: 0.1, grain: 0 },
  'min-waste': { yield: 0.8, waste: 1.0, cuts: 0.1, grain: 0 },
  'min-cuts': { yield: 0.5, waste: 0.1, cuts: 1.0, grain: 0 },
  'grain-priority': { yield: 0.5, waste: 0.2, cuts: 0.1, grain: 1.0 },
  balanced: { yield: 0.5, waste: 0.4, cuts: 0.3, grain: 0.1 },
};

export function scoreLayout(layout: BoardLayout, weights: ScoreWeights): number {
  const yieldScore = layout.yieldPct / 100;
  const wasteScore = 1 - layout.yieldPct / 100; // waste% = 1 − yield
  const idealCuts = layout.placements.length * 2;
  const cutsScore = idealCuts > 0 ? 1 - Math.min(1, layout.cutCount / idealCuts) : 1;

  // Grain penalty: rotated parts on a grain-priority run cost points.
  let grainScore = 1;
  if (weights.grain > 0) {
    const rotated = layout.placements.filter((p) => p.rotated).length;
    const total = layout.placements.length;
    grainScore = total > 0 ? 1 - rotated / total : 1;
  }

  return (
    weights.yield * yieldScore +
    weights.waste * wasteScore +
    weights.cuts * cutsScore +
    weights.grain * grainScore
  );
}
