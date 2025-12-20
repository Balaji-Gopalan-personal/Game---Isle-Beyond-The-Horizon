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
  production: 3.5,
  diversity: 2.5,
  portAccess: 1.0,
  expansion: 1.5,
};

export const PHASE_2_WEIGHTS: SetupPhaseWeights = {
  production: 3.0,
  diversity: 3.5,
  portAccess: 2.0,
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

  if (isPhase2) {
    score += evaluateComplementaryResources(vertexId, player, boardSize, gameState);
  }

  return score;
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
