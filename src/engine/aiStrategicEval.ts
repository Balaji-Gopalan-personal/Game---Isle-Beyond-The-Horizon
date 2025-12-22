import { GameState, Player, TradingPort } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { loadBoardForSize } from '../graph/loadBoard';
import { getAdjacentVertices } from './boardService';

export interface VertexEvaluation {
  vertexId: number;
  productionValue: number;
  resourceDiversity: number;
  portAccess: number;
  expansionPotential: number;
  totalScore: number;
}

export interface EdgeEvaluation {
  edgeId: string;
  toVertex: number;
  expansionValue: number;
  productionAccess: number;
  portConnectionValue: number;
  totalScore: number;
}

const PIP_PROBABILITIES: Record<number, number> = {
  2: 1 / 36,
  3: 2 / 36,
  4: 3 / 36,
  5: 4 / 36,
  6: 5 / 36,
  7: 6 / 36,
  8: 5 / 36,
  9: 4 / 36,
  10: 3 / 36,
  11: 2 / 36,
  12: 1 / 36,
};

export function evaluateVertex(
  vertexId: number,
  gameState: GameState,
  boardSize: BoardSize,
  player: Player
): VertexEvaluation {
  const productionValue = calculateProductionValue(vertexId, boardSize, gameState.boardCenters);
  const resourceDiversity = calculateResourceDiversity(vertexId, boardSize, gameState.boardCenters);
  const portAccess = calculatePortAccess(vertexId, gameState, boardSize);
  const expansionPotential = calculateExpansionPotential(vertexId, gameState, boardSize, player.id);

  const totalScore =
    productionValue * 3.0 +
    resourceDiversity * 2.0 +
    portAccess * 1.5 +
    expansionPotential * 1.0;

  return {
    vertexId,
    productionValue,
    resourceDiversity,
    portAccess,
    expansionPotential,
    totalScore,
  };
}

export function calculateProductionValue(vertexId: number, boardSize: BoardSize, boardCenters?: any[]): number {
  const centers = boardCenters || loadBoardForSize(boardSize).centers;
  const adjacentCenters = centers.filter(center =>
    center.vertices.includes(vertexId)
  );

  let totalValue = 0;

  for (const center of adjacentCenters) {
    if (center.resourceType === 'desert') continue;

    const pipProbability = PIP_PROBABILITIES[center.value] || 0;
    const resourceValue = getResourceBaseValue(center.resourceType);

    totalValue += pipProbability * resourceValue * 100;
  }

  return totalValue;
}

function getResourceBaseValue(
  resourceType: 'desert' | 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral'
): number {
  switch (resourceType) {
    case 'clay':
      return 1.5;
    case 'lumber':
      return 1.5;
    case 'grain':
      return 1.2;
    case 'fabric':
      return 1.1;
    case 'mineral':
      return 1.0;
    case 'desert':
      return 0;
    default:
      return 1.0;
  }
}

export function calculateResourceDiversity(vertexId: number, boardSize: BoardSize, boardCenters?: any[]): number {
  const centers = boardCenters || loadBoardForSize(boardSize).centers;
  const adjacentCenters = centers.filter(center =>
    center.vertices.includes(vertexId)
  );

  const uniqueResources = new Set(
    adjacentCenters
      .filter(c => c.resourceType !== 'desert')
      .map(c => c.resourceType)
  );

  const diversityScore = uniqueResources.size;

  if (uniqueResources.size === 5) {
    return 10.0;
  } else if (uniqueResources.size === 4) {
    return 7.0;
  } else if (uniqueResources.size === 3) {
    return 5.0;
  } else if (uniqueResources.size === 2) {
    return 3.0;
  } else if (uniqueResources.size === 1) {
    return 1.0;
  }

  return 0;
}

export function calculatePortAccess(
  vertexId: number,
  gameState: GameState,
  boardSize: BoardSize
): number {
  if (!gameState.tradingPorts || gameState.tradingPorts.length === 0) {
    return 0;
  }

  const port = gameState.tradingPorts.find(p => p.vertices.includes(vertexId));

  if (!port) return 0;

  if (port.type === 'generic') {
    return 5.0;
  } else {
    return 7.0;
  }
}

export function calculateExpansionPotential(
  vertexId: number,
  gameState: GameState,
  boardSize: BoardSize,
  playerId: string
): number {
  const adjacentVertices = getAdjacentVertices(vertexId, boardSize);

  let availableSpots = 0;
  let blockedSpots = 0;

  for (const adjVertex of adjacentVertices) {
    if (!gameState.verticesOccupiedBy[adjVertex]) {
      const adjAdjVertices = getAdjacentVertices(adjVertex, boardSize);
      const isBlocked = adjAdjVertices.some(v => gameState.verticesOccupiedBy[v]);

      if (!isBlocked) {
        availableSpots++;
      } else {
        blockedSpots++;
      }
    }
  }

  return availableSpots * 2.0 + blockedSpots * 0.5;
}

export function evaluateRoadEdge(
  edgeId: string,
  fromVertex: number,
  gameState: GameState,
  boardSize: BoardSize,
  player: Player
): EdgeEvaluation {
  const [v1, v2] = edgeId.split('__').map(Number);
  const toVertex = v1 === fromVertex ? v2 : v1;

  const expansionValue = calculateEdgeExpansionValue(toVertex, gameState, boardSize, player.id);
  const productionAccess = calculateProductionValue(toVertex, boardSize, gameState.boardCenters);
  const portConnectionValue = calculatePortAccess(toVertex, gameState, boardSize);

  const totalScore =
    expansionValue * 2.0 +
    productionAccess * 1.5 +
    portConnectionValue * 1.0;

  return {
    edgeId,
    toVertex,
    expansionValue,
    productionAccess,
    portConnectionValue,
    totalScore,
  };
}

function calculateEdgeExpansionValue(
  vertexId: number,
  gameState: GameState,
  boardSize: BoardSize,
  playerId: string
): number {
  const adjacentVertices = getAdjacentVertices(vertexId, boardSize);

  let validBuildSpots = 0;

  for (const adjVertex of adjacentVertices) {
    if (gameState.verticesOccupiedBy[adjVertex]) continue;

    const adjAdjVertices = getAdjacentVertices(adjVertex, boardSize);
    const hasAdjacentSettlement = adjAdjVertices.some(v => gameState.verticesOccupiedBy[v]);

    if (!hasAdjacentSettlement) {
      validBuildSpots++;
    }
  }

  return validBuildSpots * 3.0;
}

export function getResourceDistribution(player: Player): Record<string, number> {
  return {
    clay: player.resources.clay,
    lumber: player.resources.lumber,
    grain: player.resources.grain,
    fabric: player.resources.fabric,
    mineral: player.resources.mineral,
  };
}

export function identifyResourceDeficit(player: Player): string[] {
  const deficits: string[] = [];

  if (player.resources.clay === 0) deficits.push('clay');
  if (player.resources.lumber === 0) deficits.push('lumber');
  if (player.resources.grain === 0) deficits.push('grain');
  if (player.resources.fabric === 0) deficits.push('fabric');
  if (player.resources.mineral === 0) deficits.push('mineral');

  return deficits;
}

export function calculateBuildingPriority(
  player: Player,
  gameState: GameState
): { type: 'village' | 'estate' | 'road'; priority: number }[] {
  const priorities: { type: 'village' | 'estate' | 'road'; priority: number }[] = [];

  const villageCount = gameState.villages.filter(v => v.playerId === player.id && v.type === 'settlement').length;
  const cityCount = gameState.villages.filter(v => v.playerId === player.id && v.type === 'city').length;
  const roadCount = gameState.roads.filter(r => r.playerId === player.id).length;

  const villageResourcesNeeded =
    (player.resources.clay >= 1 ? 0 : 1) +
    (player.resources.lumber >= 1 ? 0 : 1) +
    (player.resources.grain >= 1 ? 0 : 1) +
    (player.resources.fabric >= 1 ? 0 : 1);

  const estateResourcesNeeded =
    (player.resources.grain >= 2 ? 0 : 2 - player.resources.grain) +
    (player.resources.mineral >= 3 ? 0 : 3 - player.resources.mineral);

  let villagePriority = (10 - villageCount) * 2.5;
  villagePriority -= villageResourcesNeeded * 3;

  let estatePriority = villageCount > 0 ? (5 - cityCount) * 2.5 : 0;
  estatePriority -= estateResourcesNeeded * 3;

  priorities.push({ type: 'village', priority: Math.max(villagePriority, 1) });
  priorities.push({ type: 'estate', priority: Math.max(estatePriority, 1) });

  const roadPriority = Math.max(8 - roadCount, 3);
  priorities.push({ type: 'road', priority: roadPriority });

  priorities.sort((a, b) => b.priority - a.priority);

  return priorities;
}
