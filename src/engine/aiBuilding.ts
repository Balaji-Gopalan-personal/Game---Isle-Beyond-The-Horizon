import { GameState, Player, Resources } from '../types/game';
import { BoardSize } from '../data/boardStructure';
import { getValidRoadPlacements, getValidVillagePlacements, getPlayerVillages } from './gameplayActions';
import { loadBoardForSize } from '../graph/loadBoard';
import { calculateBuildingPriority, evaluateVertex } from './aiStrategicEval';
import { shouldHoldForHigherValue } from './aiPlanning';
import { chooseByRubric } from './aiDifficultyTuning';

export type BuildingType = 'road' | 'village' | 'estate' | 'dev_card';

export interface BuildingOption {
  type: BuildingType;
  canAfford: boolean;
  hasValidLocation: boolean;
  priority: number;
}

export interface AIBuildDecision {
  shouldBuild: boolean;
  buildingType?: BuildingType;
}

export function canAffordRoad(resources: Resources): boolean {
  return resources.clay >= 1 && resources.lumber >= 1;
}

export function canAffordVillage(resources: Resources): boolean {
  return resources.clay >= 1 &&
         resources.lumber >= 1 &&
         resources.grain >= 1 &&
         resources.fabric >= 1;
}

export function canAffordEstate(resources: Resources): boolean {
  return resources.grain >= 2 && resources.mineral >= 3;
}

export function canAffordDevelopmentCard(resources: Resources): boolean {
  return resources.grain >= 1 && resources.fabric >= 1 && resources.mineral >= 1;
}

export function checkBuildingAvailability(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize
): BuildingOption[] {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return [];

  const priorities = calculateBuildingPriority(player, gameState);
  const priorityMap: Record<string, number> = {};
  priorities.forEach(p => {
    priorityMap[p.type] = p.priority;
  });

  const options: BuildingOption[] = [];

  const canAffordRoadRes = canAffordRoad(player.resources);
  const validRoadLocations = canAffordRoadRes ? getValidRoadPlacements(playerId, gameState, boardSize) : [];
  options.push({
    type: 'road',
    canAfford: canAffordRoadRes,
    hasValidLocation: validRoadLocations.length > 0,
    priority: priorityMap['road'] || 1
  });

  const canAffordVillageRes = canAffordVillage(player.resources);
  const validVillageLocations = canAffordVillageRes ? getValidVillagePlacements(playerId, gameState, boardSize) : [];
  options.push({
    type: 'village',
    canAfford: canAffordVillageRes,
    hasValidLocation: validVillageLocations.length > 0,
    priority: priorityMap['village'] || 1
  });

  const canAffordEstateRes = canAffordEstate(player.resources);
  const upgradableVillages = canAffordEstateRes ? getPlayerVillages(playerId, gameState) : [];
  options.push({
    type: 'estate',
    canAfford: canAffordEstateRes,
    hasValidLocation: upgradableVillages.length > 0,
    priority: priorityMap['estate'] || 1
  });

  const canAffordDevCardRes = canAffordDevelopmentCard(player.resources);
  const hasDevCardsAvailable = gameState.developmentCardDeck.length > 0;
  options.push({
    type: 'dev_card',
    canAfford: canAffordDevCardRes,
    hasValidLocation: hasDevCardsAvailable,
    priority: priorityMap['dev_card'] || 8  // Increased from 5, use calculated priority
  });

  return options;
}

export function getAvailableBuildingTypes(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize
): BuildingType[] {
  const options = checkBuildingAvailability(playerId, gameState, boardSize);
  return options
    .filter(opt => opt.canAfford && opt.hasValidLocation)
    .map(opt => opt.type);
}

export function makeStrategicBuildDecision(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize,
  actionCount: number = 0,
  difficulty: 'easy' | 'normal' | 'hard' = 'normal'
): AIBuildDecision {
  const options = checkBuildingAvailability(playerId, gameState, boardSize);
  let availableOptions = options.filter(opt => opt.canAfford && opt.hasValidLocation);

  if (availableOptions.length === 0) {
    return { shouldBuild: false };
  }

  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return { shouldBuild: false };

  // Planning-horizon lookahead: defer low-value builds (road / dev card) when a
  // higher-value build (city / settlement) is reachable within the horizon via
  // expected income and building now would set it back. Easy stays greedy.
  const heldBack = availableOptions.filter(opt => {
    const decision = shouldHoldForHigherValue(player, gameState, opt.type, boardSize, difficulty);
    if (decision.hold) {
      console.log(`   🪙 [${player.name}] Deferring ${opt.type}: ${decision.reason}`);
      return false;
    }
    return true;
  });

  if (heldBack.length === 0) {
    // Every affordable build is worth deferring - hold resources this turn.
    console.log(`   🪙 [${player.name}] Holding all resources to save toward a higher-value build`);
    return { shouldBuild: false };
  }
  availableOptions = heldBack;

  availableOptions.sort((a, b) => b.priority - a.priority);

  const selected = chooseByRubric(availableOptions, difficulty);
  return {
    shouldBuild: true,
    buildingType: selected.type
  };
}

export function selectRandomRoadLocation(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize
): { fromVertex: number; toVertex: number; edgeId: string } | null {
  const validVertices = getValidRoadPlacements(playerId, gameState, boardSize);

  if (validVertices.length === 0) return null;

  const playerRoads = gameState.roads.filter(r => r.playerId === playerId);
  const playerVillages = gameState.villages.filter(v => v.playerId === playerId);

  const allPlayerVertices = new Set<number>();
  playerRoads.forEach(r => {
    allPlayerVertices.add(r.from);
    allPlayerVertices.add(r.to);
  });
  playerVillages.forEach(v => allPlayerVertices.add(v.vertexId));

  const validEdges: { fromVertex: number; toVertex: number; edgeId: string }[] = [];

  // Load board data once outside the loop
  const boardData = loadBoardForSize(boardSize);

  for (const fromVertex of Array.from(allPlayerVertices)) {
    for (const toVertex of validVertices) {
      const edgeId = fromVertex < toVertex ? `${fromVertex}__${toVertex}` : `${toVertex}__${fromVertex}`;

      if (!gameState.edgesOccupiedBy[edgeId]) {
        const neighbors = boardData.adjacencyMap[fromVertex] || [];

        if (neighbors.includes(toVertex)) {
          validEdges.push({ fromVertex, toVertex, edgeId });
        }
      }
    }
  }

  if (validEdges.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * validEdges.length);
  return validEdges[randomIndex];
}

export function selectRandomVillageLocation(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize
): number | null {
  const validVertices = getValidVillagePlacements(playerId, gameState, boardSize);

  if (validVertices.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * validVertices.length);
  return validVertices[randomIndex];
}

export function selectRandomEstateLocation(
  playerId: string,
  gameState: GameState
): number | null {
  const upgradableVillages = getPlayerVillages(playerId, gameState);

  if (upgradableVillages.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * upgradableVillages.length);
  return upgradableVillages[randomIndex].vertexId;
}
