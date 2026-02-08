import { GameState, Player } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { evaluateVertex, evaluateRoadEdge, getResourceDistribution } from './aiStrategicEval';
import { loadBoardForSize } from '../graph/loadBoard';

export interface SetupPhaseWeights {
  production: number;
  diversity: number;
  portAccess: number;
  expansion: number;
}

export const PHASE_1_WEIGHTS: SetupPhaseWeights = {
  production: 5.0,
  diversity: 3.5,  // Increased from 2.0 for better resource balance
  portAccess: 1.0,
  expansion: 1.5,
};

export const PHASE_2_WEIGHTS: SetupPhaseWeights = {
  production: 4.0,
  diversity: 4.5,  // Increased from 3.5 to prioritize filling resource gaps
  portAccess: 1.5,
  expansion: 1.0,
};

function evaluateBlockingPotential(
  vertexId: number,
  gameState: GameState,
  boardSize: BoardSize,
  player: Player
): number {
  const boardData = loadBoardForSize(boardSize);
  const adjacentCenters = gameState.boardCenters.filter(center =>
    center.vertices.includes(vertexId)
  );

  const nonDesertCenters = adjacentCenters.filter(c => c.resourceType !== 'desert');
  if (nonDesertCenters.length < 2) {
    return 0;
  }

  let highValueCenters = 0;
  for (const center of nonDesertCenters) {
    if (center.value === 6 || center.value === 8) {
      highValueCenters++;
    } else if (center.value === 5 || center.value === 9) {
      highValueCenters += 0.5;
    }
  }

  if (highValueCenters >= 1.5) {
    const adjacentVertices = boardData.adjacencyMap[vertexId] || [];
    let opponentNearby = false;

    for (const adjVertex of adjacentVertices) {
      const occupyingPlayerId = gameState.verticesOccupiedBy[adjVertex];
      if (occupyingPlayerId && occupyingPlayerId !== player.id) {
        opponentNearby = true;
        break;
      }
    }

    if (opponentNearby) {
      return highValueCenters * 8.0;
    }
  }

  return 0;
}

export function evaluateSetupVertex(
  vertexId: number,
  gameState: GameState,
  boardSize: BoardSize,
  player: Player,
  isPhase2: boolean
): number {
  const evaluation = evaluateVertex(vertexId, gameState, boardSize, player);
  const weights = isPhase2 ? PHASE_2_WEIGHTS : PHASE_1_WEIGHTS;

  let score =
    evaluation.productionValue * weights.production +
    evaluation.resourceDiversity * weights.diversity +
    evaluation.portAccess * weights.portAccess +
    evaluation.expansionPotential * weights.expansion;

  const pipBonus = calculatePipCountBonus(vertexId, boardSize, gameState.boardCenters);
  score += pipBonus;

  const centerCountPenalty = calculateCenterCountBonus(vertexId, boardSize, gameState.boardCenters);
  score += centerCountPenalty;

  if (isPhase2) {
    score += evaluateComplementaryResources(vertexId, player, boardSize, gameState);
  }

  const blockingBonus = evaluateBlockingPotential(vertexId, gameState, boardSize, player);
  score += blockingBonus;

  const adjacentCenters = gameState.boardCenters.filter(center =>
    center.vertices.includes(vertexId)
  );

  if (adjacentCenters.length > 0) {
    const centerInfo = adjacentCenters.map(c =>
      `C${c.id}:${c.resourceType}/${c.value}`
    ).join(', ');
    console.log(`[AI Eval] V${vertexId} adjacent centers: ${centerInfo} | Score: ${score.toFixed(1)}`);
  }

  return score;
}

function calculatePipCountBonus(vertexId: number, boardSize: BoardSize, boardCenters: any[]): number {
  const adjacentCenters = boardCenters.filter(center =>
    center.vertices.includes(vertexId)
  );

  let pipBonus = 0;

  for (const center of adjacentCenters) {
    if (center.resourceType === 'desert') continue;

    if (center.value === 6 || center.value === 8) {
      pipBonus += 15.0;
    } else if (center.value === 5 || center.value === 9) {
      pipBonus += 12.0;
    } else if (center.value === 4 || center.value === 10) {
      pipBonus += 6.0;
    } else if (center.value === 3 || center.value === 11) {
      pipBonus += 2.0;
    } else if (center.value === 2 || center.value === 12) {
      pipBonus += 0.5;
    }
  }

  return pipBonus;
}

function calculateCenterCountBonus(vertexId: number, boardSize: BoardSize, boardCenters: any[]): number {
  const adjacentCenters = boardCenters.filter(center =>
    center.vertices.includes(vertexId)
  );

  const nonDesertCenters = adjacentCenters.filter(c => c.resourceType !== 'desert').length;

  if (nonDesertCenters === 3) {
    return 15.0;  // Increased from 12.0 - 3 centres is optimal
  } else if (nonDesertCenters === 2) {
    return -5.0;  // Changed from +5.0 to penalty - edge positions are suboptimal
  } else if (nonDesertCenters === 1) {
    return -80.0;  // Increased penalty from -50.0
  } else if (nonDesertCenters === 0) {
    return -120.0;  // Increased penalty from -100.0
  }

  return 0;
}

function evaluateComplementaryResources(
  vertexId: number,
  player: Player,
  boardSize: BoardSize,
  gameState: GameState
): number {
  const adjacentCenters = gameState.boardCenters.filter(center =>
    center.vertices.includes(vertexId)
  );

  const currentResources = getResourceProduction(player, gameState.boardCenters, gameState);
  const newResources = adjacentCenters
    .filter(c => c.resourceType !== 'desert')
    .map(c => c.resourceType);

  let complementaryScore = 0;
  let newResourceTypes = 0;

  for (const resource of newResources) {
    const currentCount = currentResources[resource] || 0;

    if (currentCount === 0) {
      complementaryScore += 25.0;  // Increased from 20.0
      newResourceTypes++;
    } else if (currentCount === 1) {
      complementaryScore += 14.0;  // Increased from 12.0
    } else if (currentCount === 2) {
      complementaryScore += 4.0;  // Increased from 3.0
    }
  }

  // Check if this would complete all 5 resource types
  const totalUniqueResources = Object.keys(currentResources).filter(r => currentResources[r] > 0).length + newResourceTypes;
  if (totalUniqueResources >= 5) {
    complementaryScore += 30.0;  // Major bonus for completing all 5 types
  }

  return complementaryScore;
}

function getResourceProduction(
  player: Player,
  allCenters: Array<{ id: number; vertices: number[]; resourceType: string; value: number }>,
  gameState: GameState
): Record<string, number> {
  const production: Record<string, number> = {
    clay: 0,
    lumber: 0,
    grain: 0,
    fabric: 0,
    mineral: 0,
  };

  const playerVillages = gameState.villages.filter(v => v.playerId === player.id);

  for (const village of playerVillages) {
    const adjacentCenters = allCenters.filter(center =>
      center.vertices.includes(village.vertexId)
    );

    for (const center of adjacentCenters) {
      if (center.resourceType !== 'desert') {
        production[center.resourceType] = (production[center.resourceType] || 0) + 1;
      }
    }
  }

  return production;
}

function evaluateRoadExpansionPath(
  edgeId: string,
  fromVertex: number,
  gameState: GameState,
  boardSize: BoardSize,
  player: Player
): number {
  const [v1, v2] = edgeId.split('__').map(Number);
  const toVertex = v1 === fromVertex ? v2 : v1;

  const boardData = loadBoardForSize(boardSize);
  const adjacentToTarget = boardData.adjacencyMap[toVertex] || [];

  let expansionScore = 0;

  for (const potentialVertex of adjacentToTarget) {
    if (potentialVertex === fromVertex) continue;
    if (gameState.verticesOccupiedBy[potentialVertex]) continue;

    const adjacentToCandidate = boardData.adjacencyMap[potentialVertex] || [];
    const hasAdjacentSettlement = adjacentToCandidate.some(v => gameState.verticesOccupiedBy[v]);

    if (!hasAdjacentSettlement) {
      const adjacentCenters = gameState.boardCenters.filter(center =>
        center.vertices.includes(potentialVertex)
      );

      const nonDesertCenters = adjacentCenters.filter(c => c.resourceType !== 'desert');

      if (nonDesertCenters.length >= 2) {
        let vertexValue = 0;

        for (const center of nonDesertCenters) {
          if (center.value === 6 || center.value === 8) {
            vertexValue += 5.0;
          } else if (center.value === 5 || center.value === 9) {
            vertexValue += 3.0;
          } else if (center.value === 4 || center.value === 10) {
            vertexValue += 1.5;
          }
        }

        expansionScore += vertexValue;
      }
    }
  }

  return expansionScore;
}

export function evaluateSetupRoad(
  edgeId: string,
  fromVertex: number,
  gameState: GameState,
  boardSize: BoardSize,
  player: Player,
  isPhase2: boolean
): number {
  const evaluation = evaluateRoadEdge(edgeId, fromVertex, gameState, boardSize, player);

  const weights = isPhase2 ? PHASE_2_WEIGHTS : PHASE_1_WEIGHTS;

  let score =
    evaluation.expansionValue * weights.expansion +
    evaluation.productionAccess * weights.production +
    evaluation.portConnectionValue * weights.portAccess;

  const expansionPath = evaluateRoadExpansionPath(edgeId, fromVertex, gameState, boardSize, player);
  score += expansionPath * (isPhase2 ? 1.5 : 2.0);  // Increased from 0.5:1.0 - roads should point toward good village spots

  return score;
}
