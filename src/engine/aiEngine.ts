import { GameState, Player } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import {
  getValidVillageVertices,
  getValidRoadEdgesFromVertex,
  getPlayerOwnedVertices,
  getBoardData
} from './boardService';
import { evaluateVertex, evaluateRoadEdge } from './aiStrategicEval';
import { evaluateSetupVertex, evaluateSetupRoad } from './aiSetupStrategy';

export interface AIDecision {
  action: 'place_village' | 'place_road' | 'end_turn' | 'none';
  vertexId?: number;
  edgeId?: string;
  reasoning?: string;
}

export class AIEngine {
  private difficulty: 'easy' | 'normal' | 'hard';
  private boardSize: BoardSize;

  constructor(boardSize: BoardSize, difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
    this.boardSize = boardSize;
    this.difficulty = difficulty;
  }

  decideSetupPhase1Action(player: Player, gameState: GameState): AIDecision {
    if (gameState.turnState.step === 'init_place_village') {
      return this.decideVillagePlacement(player, gameState);
    }

    if (gameState.turnState.step === 'init_place_road') {
      return this.decideRoadPlacement(player, gameState);
    }

    return { action: 'none', reasoning: 'No valid action for current step' };
  }

  decideSetupPhase2Action(player: Player, gameState: GameState): AIDecision {
    if (gameState.turnState.step === 'init_place_village') {
      return this.decideVillagePlacement(player, gameState);
    }

    if (gameState.turnState.step === 'init_place_road') {
      return this.decideRoadPlacement(player, gameState);
    }

    return { action: 'none', reasoning: 'No valid action for current step' };
  }

  private decideVillagePlacement(player: Player, gameState: GameState): AIDecision {
    const validVertices = getValidVillageVertices(gameState.verticesOccupiedBy, this.boardSize);

    if (validVertices.length === 0) {
      return { action: 'none', reasoning: 'No valid village placement locations' };
    }

    const selectedVertex = this.selectBestVillageVertex(validVertices, player, gameState);

    return {
      action: 'place_village',
      vertexId: selectedVertex,
      reasoning: `AI selected vertex ${selectedVertex} from ${validVertices.length} options`
    };
  }

  private decideRoadPlacement(player: Player, gameState: GameState): AIDecision {
    const lastVillageVertex = gameState.turnState.placementContext.lastVillageVertex;

    if (!lastVillageVertex) {
      return { action: 'none', reasoning: 'No village vertex to place road from' };
    }

    const validEdges = getValidRoadEdgesFromVertex(
      lastVillageVertex,
      gameState.edgesOccupiedBy,
      this.boardSize
    );

    if (validEdges.length === 0) {
      return { action: 'none', reasoning: 'No valid road placement locations' };
    }

    const selectedEdge = this.selectBestRoadEdge(validEdges, lastVillageVertex, player, gameState);

    return {
      action: 'place_road',
      edgeId: selectedEdge,
      reasoning: `AI selected edge ${selectedEdge} from ${validEdges.length} options`
    };
  }

  private selectBestVillageVertex(
    validVertices: number[],
    player: Player,
    gameState: GameState
  ): number {
    const isSetupPhase = gameState.phase === 'setup-phase-1' || gameState.phase === 'setup-phase-2';
    const isPhase2 = gameState.phase === 'setup-phase-2';

    const scoredVertices = validVertices.map(vertexId => ({
      vertexId,
      score: isSetupPhase
        ? evaluateSetupVertex(vertexId, gameState, this.boardSize, player, isPhase2)
        : this.scoreVillageLocation(vertexId, player, gameState)
    }));

    scoredVertices.sort((a, b) => b.score - a.score);

    if (this.difficulty === 'easy') {
      const topCandidates = scoredVertices.slice(0, Math.ceil(scoredVertices.length * 0.6));
      return this.selectRandomVertex(topCandidates.map(v => v.vertexId));
    } else if (this.difficulty === 'normal') {
      const topCandidates = scoredVertices.slice(0, Math.ceil(scoredVertices.length * 0.3));
      return this.selectRandomVertex(topCandidates.map(v => v.vertexId));
    }

    return scoredVertices[0].vertexId;
  }

  private selectBestRoadEdge(
    validEdges: string[],
    fromVertex: number,
    player: Player,
    gameState: GameState
  ): string {
    if (this.difficulty === 'easy' || validEdges.length === 1) {
      return this.selectRandomEdge(validEdges);
    }

    const isSetupPhase = gameState.phase === 'setup-phase-1' || gameState.phase === 'setup-phase-2';
    const isPhase2 = gameState.phase === 'setup-phase-2';

    const scoredEdges = validEdges.map(edgeId => ({
      edgeId,
      score: isSetupPhase
        ? evaluateSetupRoad(edgeId, fromVertex, gameState, this.boardSize, player, isPhase2)
        : this.scoreRoadLocation(edgeId, fromVertex, player, gameState)
    }));

    scoredEdges.sort((a, b) => b.score - a.score);

    if (this.difficulty === 'normal') {
      const topCandidates = scoredEdges.slice(0, Math.ceil(scoredEdges.length * 0.3));
      return this.selectRandomEdge(topCandidates.map(e => e.edgeId));
    }

    return scoredEdges[0].edgeId;
  }

  private scoreVillageLocation(vertexId: number, player: Player, gameState: GameState): number {
    const evaluation = evaluateVertex(vertexId, gameState, this.boardSize, player);
    return evaluation.totalScore;
  }

  private scoreRoadLocation(
    edgeId: string,
    fromVertex: number,
    player: Player,
    gameState: GameState
  ): number {
    const evaluation = evaluateRoadEdge(edgeId, fromVertex, gameState, this.boardSize, player);
    return evaluation.totalScore;
  }

  private selectRandomVertex(vertices: number[]): number {
    const randomIndex = Math.floor(Math.random() * vertices.length);
    return vertices[randomIndex];
  }

  private selectRandomEdge(edges: string[]): string {
    const randomIndex = Math.floor(Math.random() * edges.length);
    return edges[randomIndex];
  }
}

export function createAIEngine(boardSize: BoardSize, difficulty?: 'easy' | 'normal' | 'hard'): AIEngine {
  return new AIEngine(boardSize, difficulty);
}
