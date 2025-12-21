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
  diversity: 2.0,
  portAccess: 1.0,
  expansion: 1.5,
};

export const PHASE_2_WEIGHTS: SetupPhaseWeights = {
  production: 4.0,
  diversity: 3.5,
  portAccess: 1.5,
  expansion: 1.0,
};

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

  const pipBonus = calculatePipCountBonus(vertexId, boardSize);
  score += pipBonus;

  const centerCountPenalty = calculateCenterCountBonus(vertexId, boardSize);
  score += centerCountPenalty;

  if (isPhase2) {
    score += evaluateComplementaryResources(vertexId, player, boardSize, gameState);
  }

  return score;
}

function calculatePipCountBonus(vertexId: number, boardSize: BoardSize): number {
  const boardData = loadBoardForSize(boardSize);
  const adjacentCenters = boardData.centers.filter(center =>
    center.vertices.includes(vertexId)
  );

  let pipBonus = 0;

  for (const center of adjacentCenters) {
    if (center.resourceType === 'desert') continue;

    if (center.value === 6 || center.value === 8) {
      pipBonus += 15.0;
    } else if (center.value === 5 || center.value === 9) {
      pipBonus += 10.0;
    } else if (center.value === 4 || center.value === 10) {
      pipBonus += 6.0;
    } else if (center.value === 3 || center.value === 11) {
      pipBonus += 3.0;
    } else if (center.value === 2 || center.value === 12) {
      pipBonus += 1.0;
    }
  }

  return pipBonus;
}

function calculateCenterCountBonus(vertexId: number, boardSize: BoardSize): number {
  const boardData = loadBoardForSize(boardSize);
  const adjacentCenters = boardData.centers.filter(center =>
    center.vertices.includes(vertexId)
  );

  const nonDesertCenters = adjacentCenters.filter(c => c.resourceType !== 'desert').length;

  if (nonDesertCenters === 3) {
    return 12.0;
  } else if (nonDesertCenters === 2) {
    return 5.0;
  } else if (nonDesertCenters === 1) {
    return -8.0;
  }

  return 0;
}

function evaluateComplementaryResources(
  vertexId: number,
  player: Player,
  boardSize: BoardSize,
  gameState: GameState
): number {
  const boardData = loadBoardForSize(boardSize);
  const adjacentCenters = boardData.centers.filter(center =>
    center.vertices.includes(vertexId)
  );

  const currentResources = getResourceProduction(player, boardData.centers, gameState);
  const newResources = adjacentCenters
    .filter(c => c.resourceType !== 'desert')
    .map(c => c.resourceType);

  let complementaryScore = 0;

  for (const resource of newResources) {
    const currentCount = currentResources[resource] || 0;

    if (currentCount === 0) {
      complementaryScore += 15.0;
    } else if (currentCount === 1) {
      complementaryScore += 8.0;
    } else if (currentCount === 2) {
      complementaryScore += 3.0;
    }
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

  const score =
    evaluation.expansionValue * weights.expansion +
    evaluation.productionAccess * weights.production +
    evaluation.portConnectionValue * weights.portAccess;

  return score;
}
