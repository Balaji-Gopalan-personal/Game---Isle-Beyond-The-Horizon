export interface DifficultySettings {
  /** Fraction of (score-sorted) options the AI is willing to pick from. Lower = sharper. */
  selectionTopPercent: number;
  /** Random jitter applied to scores before ranking. Lower = more consistent. */
  randomnessWeight: number;
  /** Multiplier on how eagerly the AI trades toward its goals. */
  tradeFrequency: number;
  /** Multiplier on how aggressively the AI commits resources to building. */
  buildingAggression: number;
  /** Relative willingness to buy/play development cards (normal = 0.7 baseline). */
  devCardPlayRate: number;
  /** How close to optimal robber placement is (1 = always best). */
  robberOptimality: number;
  /** Reserved for future multi-turn lookahead depth. */
  planningHorizon: number;
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultySettings> = {
  easy: {
    selectionTopPercent: 0.6,
    randomnessWeight: 0.35,
    tradeFrequency: 0.5,
    buildingAggression: 0.75,
    devCardPlayRate: 0.5,
    robberOptimality: 0.5,
    planningHorizon: 1
  },
  normal: {
    selectionTopPercent: 0.3,
    randomnessWeight: 0.15,
    tradeFrequency: 0.7,
    buildingAggression: 1.1,
    devCardPlayRate: 0.7,
    robberOptimality: 0.7,
    planningHorizon: 2
  },
  hard: {
    selectionTopPercent: 0.1,
    randomnessWeight: 0.03,
    tradeFrequency: 0.85,
    buildingAggression: 1.25,
    devCardPlayRate: 0.9,
    robberOptimality: 0.95,
    planningHorizon: 3
  }
};

/** Normal difficulty is treated as the reference point (1.0x) for relative scalars. */
const BASELINE_DEV_CARD_RATE = DIFFICULTY_PRESETS.normal.devCardPlayRate;

/**
 * Scale a base probability by how dev-card-happy the difficulty is, using normal
 * as the 1.0x baseline. Hard buys/plays more, easy less.
 */
export function scaleDevCardProbability(baseProbability: number, difficulty: Difficulty): number {
  const settings = DIFFICULTY_PRESETS[difficulty];
  return baseProbability * (settings.devCardPlayRate / BASELINE_DEV_CARD_RATE);
}

/**
 * Pick from a list already sorted by score (best first), with sharpness driven by
 * the difficulty preset. Hard is deterministic (always the best option); normal and
 * easy sample from the top `selectionTopPercent` of options.
 */
export function pickByDifficulty<T>(sortedByScoreDesc: T[], difficulty: Difficulty): T {
  if (sortedByScoreDesc.length === 1) return sortedByScoreDesc[0];

  if (difficulty === 'hard') {
    return sortedByScoreDesc[0];
  }

  const settings = DIFFICULTY_PRESETS[difficulty];
  const topCount = Math.max(1, Math.ceil(sortedByScoreDesc.length * settings.selectionTopPercent));
  const randomIndex = Math.floor(Math.random() * topCount);
  return sortedByScoreDesc[randomIndex];
}
