export interface DifficultySettings {
  selectionTopPercent: number;
  randomnessWeight: number;
  tradeFrequency: number;
  buildingAggression: number;
  devCardPlayRate: number;
  robberOptimality: number;
  planningHorizon: number;
}

export const DIFFICULTY_PRESETS: Record<'easy' | 'normal' | 'hard', DifficultySettings> = {
  easy: {
    selectionTopPercent: 0.5,
    randomnessWeight: 0.4,
    tradeFrequency: 0.3,
    buildingAggression: 0.5,
    devCardPlayRate: 0.4,
    robberOptimality: 0.3,
    planningHorizon: 1
  },
  normal: {
    selectionTopPercent: 0.3,
    randomnessWeight: 0.15,
    tradeFrequency: 0.5,
    buildingAggression: 0.7,
    devCardPlayRate: 0.6,
    robberOptimality: 0.6,
    planningHorizon: 2
  },
  hard: {
    selectionTopPercent: 0.15,
    randomnessWeight: 0.05,
    tradeFrequency: 0.7,
    buildingAggression: 0.85,
    devCardPlayRate: 0.8,
    robberOptimality: 0.9,
    planningHorizon: 3
  }
};

export function applyDifficultyVariance<T extends { score: number }>(
  options: T[],
  difficulty: 'easy' | 'normal' | 'hard'
): T[] {
  const settings = DIFFICULTY_PRESETS[difficulty];

  const optionsWithVariance = options.map(option => ({
    ...option,
    score: option.score + (Math.random() - 0.5) * option.score * settings.randomnessWeight
  }));

  optionsWithVariance.sort((a, b) => b.score - a.score);

  return optionsWithVariance;
}

export function selectFromTopOptions<T>(
  options: T[],
  difficulty: 'easy' | 'normal' | 'hard'
): T {
  const settings = DIFFICULTY_PRESETS[difficulty];
  const topCount = Math.max(1, Math.ceil(options.length * settings.selectionTopPercent));
  const topOptions = options.slice(0, topCount);

  const randomIndex = Math.floor(Math.random() * topOptions.length);
  return topOptions[randomIndex];
}

export function shouldPerformAction(
  baseRate: number,
  difficulty: 'easy' | 'normal' | 'hard'
): boolean {
  const settings = DIFFICULTY_PRESETS[difficulty];

  const adjustedRate = baseRate * getDifficultyMultiplier(difficulty);

  return Math.random() < adjustedRate;
}

function getDifficultyMultiplier(difficulty: 'easy' | 'normal' | 'hard'): number {
  switch (difficulty) {
    case 'easy':
      return 0.7;
    case 'normal':
      return 1.0;
    case 'hard':
      return 1.2;
  }
}

export function addDecisionDelay(difficulty: 'easy' | 'normal' | 'hard'): number {
  switch (difficulty) {
    case 'easy':
      return Math.random() * 200 + 100;
    case 'normal':
      return Math.random() * 150 + 50;
    case 'hard':
      return Math.random() * 100 + 25;
  }
}

export function adjustScoreByDifficulty(
  score: number,
  difficulty: 'easy' | 'normal' | 'hard',
  isOptimalChoice: boolean
): number {
  if (difficulty === 'easy' && isOptimalChoice) {
    return score * 0.7;
  } else if (difficulty === 'easy' && !isOptimalChoice) {
    return score * 1.3;
  }

  return score;
}

export function shouldMakeSuboptimalChoice(
  difficulty: 'easy' | 'normal' | 'hard'
): boolean {
  const suboptimalRates = {
    easy: 0.35,
    normal: 0.15,
    hard: 0.05
  };

  return Math.random() < suboptimalRates[difficulty];
}

export function calculateMistakeRate(difficulty: 'easy' | 'normal' | 'hard'): number {
  switch (difficulty) {
    case 'easy':
      return 0.25;
    case 'normal':
      return 0.10;
    case 'hard':
      return 0.03;
  }
}

export function applyDifficultyToEvaluation(
  evaluation: number,
  difficulty: 'easy' | 'normal' | 'hard'
): number {
  const settings = DIFFICULTY_PRESETS[difficulty];

  const variance = (Math.random() - 0.5) * 2 * settings.randomnessWeight;
  const adjustedEvaluation = evaluation * (1 + variance);

  return Math.max(0, adjustedEvaluation);
}
