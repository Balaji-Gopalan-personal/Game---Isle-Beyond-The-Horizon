import { GameState } from '../types/game';
import { BoardSize } from '../data/boardConfigs';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  gameStateHash: string;
}

class AICache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxAge: number = 5000;
  private maxSize: number = 100;

  set(key: string, data: T, gameState: GameState): void {
    const hash = this.hashGameState(gameState);

    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      gameStateHash: hash
    });
  }

  get(key: string, gameState: GameState): T | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    const hash = this.hashGameState(gameState);
    if (entry.gameStateHash !== hash) {
      this.cache.delete(key);
      return null;
    }

    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private hashGameState(gameState: GameState): string {
    return `${gameState.turn}_${gameState.phase}_${gameState.players.length}_${Object.keys(gameState.verticesOccupiedBy).length}`;
  }
}

export const vertexEvaluationCache = new AICache<number>();
export const edgeEvaluationCache = new AICache<number>();
export const tradeEvaluationCache = new AICache<any>();

export interface PerformanceMetrics {
  decisionTime: number;
  cacheHits: number;
  cacheMisses: number;
  evaluationsComputed: number;
}

let performanceMetrics: PerformanceMetrics = {
  decisionTime: 0,
  cacheHits: 0,
  cacheMisses: 0,
  evaluationsComputed: 0
};

export function startDecisionTimer(): number {
  return performance.now();
}

export function endDecisionTimer(startTime: number): number {
  const duration = performance.now() - startTime;
  performanceMetrics.decisionTime = duration;
  return duration;
}

export function recordCacheHit(): void {
  performanceMetrics.cacheHits++;
}

export function recordCacheMiss(): void {
  performanceMetrics.cacheMisses++;
}

export function recordEvaluation(): void {
  performanceMetrics.evaluationsComputed++;
}

export function getPerformanceMetrics(): PerformanceMetrics {
  return { ...performanceMetrics };
}

export function resetPerformanceMetrics(): void {
  performanceMetrics = {
    decisionTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    evaluationsComputed: 0
  };
}

export function shouldUseFastPath(
  optionsCount: number,
  timeRemaining: number
): boolean {
  const estimatedTime = optionsCount * 5;
  return estimatedTime > timeRemaining;
}

export function limitEvaluations<T>(
  options: T[],
  maxEvaluations: number
): T[] {
  if (options.length <= maxEvaluations) {
    return options;
  }

  const step = Math.ceil(options.length / maxEvaluations);
  const sampled: T[] = [];

  for (let i = 0; i < options.length; i += step) {
    sampled.push(options[i]);
  }

  return sampled;
}

export function optimizeEvaluationOrder<T extends { id: number | string }>(
  options: T[],
  previousBest?: T
): T[] {
  if (!previousBest) {
    return options;
  }

  const reordered = [...options];
  const previousIndex = reordered.findIndex(
    opt => opt.id === previousBest.id
  );

  if (previousIndex > 0) {
    const [item] = reordered.splice(previousIndex, 1);
    reordered.unshift(item);
  }

  return reordered;
}

const MAX_DECISION_TIME = 500;

export function enforceTimeLimit(startTime: number): boolean {
  const elapsed = performance.now() - startTime;
  return elapsed < MAX_DECISION_TIME;
}

export function estimateRemainingTime(startTime: number): number {
  const elapsed = performance.now() - startTime;
  return Math.max(0, MAX_DECISION_TIME - elapsed);
}

export function clearAllCaches(): void {
  vertexEvaluationCache.clear();
  edgeEvaluationCache.clear();
  tradeEvaluationCache.clear();
}

export function batchEvaluate<T, R>(
  items: T[],
  evaluator: (item: T) => R,
  batchSize: number = 10
): R[] {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = batch.map(evaluator);
    results.push(...batchResults);
  }

  return results;
}
