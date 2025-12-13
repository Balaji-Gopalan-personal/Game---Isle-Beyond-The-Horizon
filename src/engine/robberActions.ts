import { GameState, Player, Resources } from '../types/game';

export interface CentreData {
  id: number;
  topVertex: number;
  vertices: number[];
  x: number;
  y: number;
  resourceType: 'desert' | 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral';
  value: number;
}

export function findDesertCentre(centres: CentreData[]): number | null {
  const desertCentre = centres.find(c => c.resourceType === 'desert');
  return desertCentre ? desertCentre.id : null;
}

export function isValidRobberDestination(
  targetCentreId: number,
  currentRobberPosition: number | undefined,
  centres: CentreData[],
  robberCanReturnToDesert: boolean
): boolean {
  if (targetCentreId === currentRobberPosition) {
    return false;
  }

  if (!robberCanReturnToDesert) {
    const targetCentre = centres.find(c => c.id === targetCentreId);
    if (targetCentre && targetCentre.resourceType === 'desert') {
      return false;
    }
  }

  return true;
}

export function getPlayersWithAdjacentBuildings(
  centreId: number,
  centres: CentreData[],
  gameState: GameState,
  excludePlayerId: string
): Player[] {
  const centre = centres.find(c => c.id === centreId);
  if (!centre) return [];

  const adjacentPlayerIds = new Set<string>();

  centre.vertices.forEach(vertexId => {
    const village = gameState.villages.find(v => v.vertexId === vertexId);
    if (village && village.playerId !== excludePlayerId) {
      adjacentPlayerIds.add(village.playerId);
    }
  });

  return gameState.players.filter(p => adjacentPlayerIds.has(p.id));
}

export function getValidRobberDestinations(
  centres: CentreData[],
  currentRobberPosition: number | undefined,
  robberCanReturnToDesert: boolean
): number[] {
  return centres
    .filter(c => isValidRobberDestination(c.id, currentRobberPosition, centres, robberCanReturnToDesert))
    .map(c => c.id);
}

export function selectRandomRobberDestination(
  centres: CentreData[],
  currentRobberPosition: number | undefined,
  robberCanReturnToDesert: boolean
): number | null {
  const validDestinations = getValidRobberDestinations(centres, currentRobberPosition, robberCanReturnToDesert);

  if (validDestinations.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * validDestinations.length);
  return validDestinations[randomIndex];
}

export function stealRandomResource(
  fromPlayer: Player,
  toPlayer: Player
): { resource: keyof Resources | null; amount: number } {
  if (fromPlayer.resources.total === 0) {
    return { resource: null, amount: 0 };
  }

  const availableResources: Array<keyof Resources> = [];

  (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const).forEach(resource => {
    for (let i = 0; i < fromPlayer.resources[resource]; i++) {
      availableResources.push(resource);
    }
  });

  if (availableResources.length === 0) {
    return { resource: null, amount: 0 };
  }

  const randomIndex = Math.floor(Math.random() * availableResources.length);
  const stolenResource = availableResources[randomIndex];

  return { resource: stolenResource, amount: 1 };
}

export function selectRandomStealTarget(
  eligiblePlayers: Player[]
): Player | null {
  if (eligiblePlayers.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * eligiblePlayers.length);
  return eligiblePlayers[randomIndex];
}
