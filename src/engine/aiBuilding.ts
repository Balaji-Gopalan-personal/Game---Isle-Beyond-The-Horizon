import { GameState, Player, Resources } from '../types/game';
import { BoardSize } from '../data/boardStructure';
import { getValidRoadPlacements, getValidVillagePlacements, getPlayerVillages } from './gameplayActions';
import { loadBoardForSize } from '../graph/loadBoard';

export type BuildingType = 'road' | 'village' | 'estate';

export interface BuildingOption {
  type: BuildingType;
  canAfford: boolean;
  hasValidLocation: boolean;
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

  const options: BuildingOption[] = [];

  const canAffordRoadRes = canAffordRoad(player.resources);
  const validRoadLocations = canAffordRoadRes ? getValidRoadPlacements(playerId, gameState, boardSize) : [];
  options.push({
    type: 'road',
    canAfford: canAffordRoadRes,
    hasValidLocation: validRoadLocations.length > 0
  });

  const canAffordVillageRes = canAffordVillage(player.resources);
  const validVillageLocations = canAffordVillageRes ? getValidVillagePlacements(playerId, gameState, boardSize) : [];
  options.push({
    type: 'village',
    canAfford: canAffordVillageRes,
    hasValidLocation: validVillageLocations.length > 0
  });

  const canAffordEstateRes = canAffordEstate(player.resources);
  const upgradableVillages = canAffordEstateRes ? getPlayerVillages(playerId, gameState) : [];
  options.push({
    type: 'estate',
    canAfford: canAffordEstateRes,
    hasValidLocation: upgradableVillages.length > 0
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

export function makeRandomBuildDecision(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize,
  actionCount: number = 0
): AIBuildDecision {
  const availableTypes = getAvailableBuildingTypes(playerId, gameState, boardSize);

  if (availableTypes.length === 0) {
    return { shouldBuild: false };
  }

  const probability = Math.max(0.5, 1.0 - (actionCount * 0.1));
  const shouldBuild = Math.random() < probability;

  if (!shouldBuild) {
    return { shouldBuild: false };
  }

  const randomIndex = Math.floor(Math.random() * availableTypes.length);
  return {
    shouldBuild: true,
    buildingType: availableTypes[randomIndex]
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
