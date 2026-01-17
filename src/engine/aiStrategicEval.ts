import { GameState, Player, TradingPort } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { loadBoardForSize } from '../graph/loadBoard';
import { getAdjacentVertices } from './boardService';
import { calculateLongestRoadPath, buildVerticesWithOwnership } from './gameplayActions';

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

  // Calculate bonus for filling resource gaps
  const gapFillingBonus = calculateResourceGapBonus(vertexId, boardSize, gameState, player);

  const totalScore =
    productionValue * 3.0 +
    resourceDiversity * 2.5 +  // Increased from 2.0
    portAccess * 1.5 +
    expansionPotential * 1.0 +
    gapFillingBonus * 3.0;  // New component for balanced resources

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
    return 12.0;  // Increased from 10.0
  } else if (uniqueResources.size === 4) {
    return 8.0;   // Increased from 7.0
  } else if (uniqueResources.size === 3) {
    return 5.0;
  } else if (uniqueResources.size === 2) {
    return 2.5;   // Decreased from 3.0
  } else if (uniqueResources.size === 1) {
    return 0.5;   // Decreased from 1.0
  }

  return 0;
}

function calculateResourceGapBonus(
  vertexId: number,
  boardSize: BoardSize,
  gameState: GameState,
  player: Player
): number {
  const centers = gameState.boardCenters && gameState.boardCenters.length > 0
    ? gameState.boardCenters
    : loadBoardForSize(boardSize).centers;

  // Get resources the player already has production access to
  const playerVillages = gameState.villages.filter(v => v.playerId === player.id);
  const existingResources = new Set<string>();

  for (const village of playerVillages) {
    const adjacentCenters = centers.filter(c => c.vertices.includes(village.vertexId));
    for (const center of adjacentCenters) {
      if (center.resourceType !== 'desert') {
        existingResources.add(center.resourceType);
      }
    }
  }

  // Get resources this vertex would provide
  const vertexCenters = centers.filter(c => c.vertices.includes(vertexId));
  const vertexResources = new Set(
    vertexCenters
      .filter(c => c.resourceType !== 'desert')
      .map(c => c.resourceType)
  );

  // Count how many NEW resources this vertex provides
  let newResourceCount = 0;
  let totalNewProductionValue = 0;

  for (const resource of vertexResources) {
    if (!existingResources.has(resource)) {
      newResourceCount++;

      // Find the production value of this new resource
      const resourceCenter = vertexCenters.find(c => c.resourceType === resource);
      if (resourceCenter) {
        const pipProb = PIP_PROBABILITIES[resourceCenter.value] || 0;
        totalNewProductionValue += pipProb * 100;
      }
    }
  }

  // Bonus scales with number of new resources and their production value
  let bonus = newResourceCount * 6.0;  // Increased from 4.0 to 6.0 points per new resource type
  bonus += totalNewProductionValue * 0.8;  // Increased from 0.5 to 0.8

  // Extra bonus if this would give the player access to all 5 resources
  if (existingResources.size + newResourceCount >= 5) {
    bonus += 12.0;  // Increased from 8.0 - having all 5 resources is very valuable
  }

  // Additional bonus for filling gaps in early game (first 2 settlements)
  if (playerVillages.length <= 1 && newResourceCount >= 2) {
    bonus += 8.0;  // Strong incentive to diversify early
  }

  return bonus;
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
): { type: 'village' | 'estate' | 'road' | 'dev_card'; priority: number }[] {
  const priorities: { type: 'village' | 'estate' | 'road' | 'dev_card'; priority: number }[] = [];

  const villageCount = gameState.villages.filter(v => v.playerId === player.id && v.type === 'settlement').length;
  const cityCount = gameState.villages.filter(v => v.playerId === player.id && v.type === 'city').length;
  const roadCount = gameState.roads.filter(r => r.playerId === player.id).length;

  const pointsToWin = gameState.gameSettings.pointsToWin;
  const currentPoints = player.score + player.secretPoints;
  const pointsAway = pointsToWin - currentPoints;
  const isEarlyGame = currentPoints < 5;
  const isMidGame = currentPoints >= 5 && currentPoints < 8;

  const villageResourcesNeeded =
    (player.resources.clay >= 1 ? 0 : 1) +
    (player.resources.lumber >= 1 ? 0 : 1) +
    (player.resources.grain >= 1 ? 0 : 1) +
    (player.resources.fabric >= 1 ? 0 : 1);

  const estateResourcesNeeded =
    (player.resources.grain >= 2 ? 0 : 2 - player.resources.grain) +
    (player.resources.mineral >= 3 ? 0 : 3 - player.resources.mineral);

  const avgVillages = gameState.players.reduce((sum, p) =>
    sum + gameState.villages.filter(v => v.playerId === p.id && v.type === 'settlement').length, 0
  ) / gameState.players.length;

  const isBehindOnVillages = villageCount < avgVillages - 0.5;

  let villagePriority = (10 - villageCount) * 4.0;

  if (isEarlyGame) {
    villagePriority *= 2.0;
    if (villageCount < 3) {
      villagePriority += 10;
    }
  } else if (isMidGame && villageCount < 4) {
    villagePriority *= 1.5;
  }

  if (isBehindOnVillages) {
    villagePriority += 8;
  }

  if (villageResourcesNeeded > 0) {
    villagePriority += villageResourcesNeeded * 1.5;
  }

  let estatePriority = villageCount > 0 ? (5 - cityCount) * 3.5 : 0;
  estatePriority -= estateResourcesNeeded * 2.5;

  if (isEarlyGame && villageCount < 3) {
    estatePriority *= 0.3;
  }

  let roadPriority = Math.max(8 - roadCount, 3);

  if (isEarlyGame && villageCount < 3) {
    roadPriority *= 0.6;
  }

  if (gameState.gameSettings.longestRoadEnabled) {
    const longestRoadBonus = gameState.gameSettings.longestRoadBonus;
    const longestRoadSize = gameState.gameSettings.longestRoadSize;

    const boardSize = gameState.gameSettings.boardSize as BoardSize;
    const boardData = loadBoardForSize(boardSize);
    const verticesWithOwnership = buildVerticesWithOwnership(boardData.graph, gameState.verticesOccupiedBy);

    const myLongestPath = calculateLongestRoadPath(player.id, gameState.roads, verticesWithOwnership);
    const currentLongestRoadHolder = gameState.players.find(p => p.hasLongestRoad);

    if (currentLongestRoadHolder && currentLongestRoadHolder.id === player.id) {
      roadPriority += longestRoadBonus * 1.5;
    } else if (myLongestPath >= longestRoadSize - 3) {
      let currentHolderLongestPath = 0;
      if (currentLongestRoadHolder) {
        currentHolderLongestPath = calculateLongestRoadPath(
          currentLongestRoadHolder.id,
          gameState.roads,
          verticesWithOwnership
        );
      }

      const roadsNeeded = currentLongestRoadHolder
        ? Math.max(currentHolderLongestPath + 1 - myLongestPath, 0)
        : longestRoadSize - myLongestPath;

      if (roadsNeeded <= 2) {
        roadPriority += longestRoadBonus * 2.0;
      } else if (roadsNeeded <= 3) {
        roadPriority += longestRoadBonus * 1.5;
      }
    }
  }

  let devCardPriority = 9;

  if (pointsAway <= 3) {
    devCardPriority += 3;
  } else if (pointsAway <= 5) {
    devCardPriority += 1.5;
  }

  if (gameState.gameSettings.largestArmyEnabled) {
    const largestArmySize = gameState.gameSettings.largestArmySize;
    const myGuardCount = player.guardsPlayed || 0;
    if (myGuardCount >= largestArmySize - 2) {
      devCardPriority += 2;
    }
  }

  if (isEarlyGame && villageCount < 3) {
    devCardPriority *= 0.5;
  }

  priorities.push({ type: 'village', priority: Math.max(villagePriority, 1) });
  priorities.push({ type: 'estate', priority: Math.max(estatePriority, 1) });
  priorities.push({ type: 'road', priority: roadPriority });
  priorities.push({ type: 'dev_card', priority: devCardPriority });

  priorities.sort((a, b) => b.priority - a.priority);

  return priorities;
}
