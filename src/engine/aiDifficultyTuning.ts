export interface DifficultySettings {
  /** Multi-turn lookahead depth used by build-vs-hold planning. */
  planningHorizon: number;
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultySettings> = {
  easy: {
    planningHorizon: 1
  },
  normal: {
    planningHorizon: 2
  },
  hard: {
    planningHorizon: 3
  }
};

/**
 * Chance the AI takes the single best-scored option outright, per difficulty.
 * This is the one rubric every AI decision in the game follows: Hard always
 * picks optimally; Normal does so 80% of the time; Easy does so 60% of the
 * time. The remainder is a "soft random" pick from a band of good-but-not-best
 * options (see getRandomnessBand) - never a genuinely bad choice.
 */
const OPTIMAL_RATE: Record<Difficulty, number> = {
  easy: 0.6,
  normal: 0.8,
  hard: 1.0
};

/**
 * Width of the soft-random band, as a fraction of the option list, that a
 * difficulty samples from when it doesn't take the optimal choice. Hard never
 * uses this (OPTIMAL_RATE is 1.0). Widths are floored at 3 options (or the
 * full list if shorter) so the band stays meaningful on short lists.
 */
const BAND_PERCENT: Record<Difficulty, number> = {
  easy: 0.5,
  normal: 0.3,
  hard: 0
};

/** The optimal choice from a list already sorted best-first by score. */
export function getOptimalChoice<T>(sortedByScoreDesc: T[]): T {
  return sortedByScoreDesc[0];
}

/**
 * The band of options a difficulty samples from when it misses the optimal
 * roll: the top slice of the sorted list, sized by BAND_PERCENT and floored
 * at min(3, list length) so the band is never a single option.
 */
export function getRandomnessBand<T>(sortedByScoreDesc: T[], difficulty: Difficulty): T[] {
  const minSize = Math.min(3, sortedByScoreDesc.length);
  const size = Math.max(minSize, Math.ceil(sortedByScoreDesc.length * BAND_PERCENT[difficulty]));
  return sortedByScoreDesc.slice(0, size);
}

/**
 * The single gate every AI decision routes through: given options already
 * sorted best-first by score, return the optimal one with probability
 * OPTIMAL_RATE[difficulty], otherwise a soft-random pick from the band
 * returned by getRandomnessBand. Binary decisions (do X vs don't) are modeled
 * as a 2-element list [optimalAction, alternative] so they follow the exact
 * same rule as multi-option selections.
 */
export function chooseByRubric<T>(sortedByScoreDesc: T[], difficulty: Difficulty): T {
  if (sortedByScoreDesc.length === 1) return sortedByScoreDesc[0];

  if (Math.random() < OPTIMAL_RATE[difficulty]) {
    return getOptimalChoice(sortedByScoreDesc);
  }

  const band = getRandomnessBand(sortedByScoreDesc, difficulty);
  const randomIndex = Math.floor(Math.random() * band.length);
  return band[randomIndex];
}
