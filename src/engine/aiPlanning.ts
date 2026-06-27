import { GameState, Player, Resources } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { ResourceType } from '../utils/tradingUtils';
import { BUILDING_COSTS } from './buildingCosts';
import { getValidVillagePlacements, getPlayerVillages } from './gameplayActions';
import { DIFFICULTY_PRESETS } from './aiDifficultyTuning';
import { countVillageSpotsByHops } from './aiLocationStrategy';

export type BuildingType = 'road' | 'village' | 'estate' | 'dev_card';

// Probability of rolling each number with 2d6 (the desert / 7 produce nothing).
const PIP_PROBABILITY: Record<number, number> = {
  2: 1 / 36, 3: 2 / 36, 4: 3 / 36, 5: 4 / 36, 6: 5 / 36,
  8: 5 / 36, 9: 4 / 36, 10: 3 / 36, 11: 2 / 36, 12: 1 / 36,
};

export type ExpectedIncome = Record<ResourceType, number>;

/**
 * Expected resources produced per turn for a player: for each owned
 * settlement/city, sum the pip probability of every adjacent producing hex,
 * doubled for cities. Hexes currently under the robber produce nothing.
 */
export function computeExpectedIncome(player: Player, gameState: GameState): ExpectedIncome {
  const income: ExpectedIncome = { clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0 };

  if (!gameState.boardCenters || gameState.boardCenters.length === 0) {
    return income;
  }

  const playerVillages = gameState.villages.filter(v => v.playerId === player.id);

  for (const village of playerVillages) {
    const multiplier = village.type === 'city' ? 2 : 1;
    for (const center of gameState.boardCenters) {
      if (center.resourceType === 'desert') continue;
      if (center.id === gameState.robberPosition) continue;
      if (!center.vertices.includes(village.vertexId)) continue;

      const prob = PIP_PROBABILITY[center.value] || 0;
      income[center.resourceType as ResourceType] += prob * multiplier;
    }
  }

  return income;
}

/**
 * Expected number of turns until the player can afford `buildingType` from
 * production alone (no trading), given current resources and expected income.
 * Returns Infinity if a required resource has zero income and is missing.
 */
export function expectedTurnsToAfford(
  resources: Resources,
  buildingType: BuildingType,
  income: ExpectedIncome
): number {
  const cost = BUILDING_COSTS[buildingType];
  let turns = 0;

  for (const [resource, required] of Object.entries(cost)) {
    const key = resource as ResourceType;
    const have = resources[key] || 0;
    const deficit = (required as number) - have;
    if (deficit <= 0) continue;

    const rate = income[key] || 0;
    if (rate <= 0) return Infinity; // cannot be produced; would require trading
    turns = Math.max(turns, deficit / rate);
  }

  return turns;
}

/** Does building `candidate` now consume a resource that `target` also needs? */
function buildsConflict(
  resources: Resources,
  candidate: BuildingType,
  target: BuildingType
): boolean {
  const candidateCost = BUILDING_COSTS[candidate];
  const targetCost = BUILDING_COSTS[target];

  for (const resource of Object.keys(candidateCost) as ResourceType[]) {
    const targetNeeds = (targetCost as Record<string, number>)[resource] || 0;
    if (targetNeeds <= 0) continue;
    // Spending this resource now would dip below what the target still needs.
    const have = resources[resource] || 0;
    const spend = (candidateCost as Record<string, number>)[resource] || 0;
    if (have - spend < targetNeeds) return true;
  }

  return false;
}

export interface HoldDecision {
  hold: boolean;
  reason: string;
}

/**
 * Should the AI decline to spend resources on a low-value build now in order to
 * save toward a higher-value one reachable within its planning horizon?
 *
 * Only ever defers low-value builds (road / dev_card) — never villages or
 * estates. The horizon comes from the difficulty preset (easy=1 never holds,
 * normal=2, hard=3), so easy stays greedy while hard plans ahead. Holding is
 * suppressed when it would create discard risk.
 */
export function shouldHoldForHigherValue(
  player: Player,
  gameState: GameState,
  candidate: BuildingType,
  boardSize: BoardSize,
  difficulty: 'easy' | 'normal' | 'hard'
): HoldDecision {
  // Only consider deferring cheap, low-value builds.
  if (candidate !== 'road' && candidate !== 'dev_card') {
    return { hold: false, reason: 'candidate is high-value; never deferred' };
  }

  const horizon = DIFFICULTY_PRESETS[difficulty].planningHorizon;
  if (horizon <= 1) {
    return { hold: false, reason: 'planning horizon 1 (greedy)' };
  }

  // Holding keeps resources in hand, which raises discard risk. Don't hold if
  // we're already at/over the discard threshold.
  const maxHold = gameState.gameSettings.maxResourceHold || 7;
  if (player.resources.total >= maxHold) {
    return { hold: false, reason: 'at discard risk; spend instead of holding' };
  }

  const income = computeExpectedIncome(player, gameState);

  // Candidate high-value targets we might save toward, best first.
  const targets: BuildingType[] = [];
  if (getPlayerVillages(player.id, gameState).length > 0) {
    targets.push('estate'); // upgrading to a city: +1 pt and doubled production
  }
  const settlementCount = gameState.villages.filter(
    v => v.playerId === player.id && v.type === 'settlement'
  ).length;
  // Saving toward another settlement is worthwhile when there is a legal spot
  // either reachable NOW (0 roads) or reachable with 1 road (approaching).
  // Only consider candidate=road as conflicting when the spot is already
  // placeable; for the approaching case the road is actually helping, so we
  // skip the conflict check and won't wrongly hold.
  const villageReach = settlementCount >= 2
    ? countVillageSpotsByHops(player.id, gameState, boardSize, 1)
    : null;
  const hasImmediateVillageSpot = (villageReach?.byDepth[0] ?? 0) > 0;
  const hasApproachingVillageSpot = (villageReach?.byDepth[1] ?? 0) > 0;

  if (hasImmediateVillageSpot) {
    // Spot is directly placeable — save for it (old behaviour, broadened to 1-road as well)
    targets.push('village');
  } else if (hasApproachingVillageSpot && candidate !== 'road') {
    // Spot needs 1 more road: don't block road builds (they help), but DO block
    // dev-card buys that would drain grain/fabric needed for the settlement later.
    targets.push('village');
  }

  for (const target of targets) {
    const turns = expectedTurnsToAfford(player.resources, target, income);
    if (turns <= horizon && buildsConflict(player.resources, candidate, target)) {
      return {
        hold: true,
        reason: `Holding resources: ${target} reachable in ~${turns.toFixed(1)} turns (≤ horizon ${horizon}); building ${candidate} now would set it back`,
      };
    }
  }

  return { hold: false, reason: 'no higher-value target within horizon' };
}
