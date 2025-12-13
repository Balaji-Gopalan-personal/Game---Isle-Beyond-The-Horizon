import { GameState, Player, Village, Road } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { GameStateManager } from './gameStateManager';
import { AIEngine } from './aiEngine';
import {
  canPlaceVillageAtVertex,
  canPlaceRoadOnEdge,
  getEdgeId
} from './boardService';
import {
  checkSetupPhase1Completion,
  checkSetupPhase2Completion,
  getNextPlayerInTurn
} from './phaseController';

export interface SetupPhaseAction {
  type: 'place_village' | 'place_road' | 'advance_turn' | 'complete_phase';
  playerId: string;
  vertexId?: number;
  edgeId?: string;
  message?: string;
}

export class SetupPhaseOrchestrator {
  private stateManager: GameStateManager;
  private aiEngine: AIEngine;
  private boardSize: BoardSize;
  private logCallback?: (message: string) => void;

  constructor(
    initialState: GameState,
    boardSize: BoardSize,
    aiDifficulty: 'easy' | 'normal' | 'hard' = 'normal',
    logCallback?: (message: string) => void
  ) {
    this.stateManager = new GameStateManager(initialState);
    this.aiEngine = new AIEngine(boardSize, aiDifficulty);
    this.boardSize = boardSize;
    this.logCallback = logCallback;
  }

  getState(): GameState {
    return this.stateManager.getState();
  }

  log(message: string): void {
    this.stateManager.addLogEntry(message);
    if (this.logCallback) {
      this.logCallback(message);
    }
  }

  placeVillage(playerId: string, vertexId: number): boolean {
    const state = this.stateManager.getState();
    const player = this.stateManager.getPlayerById(playerId);

    if (!player) {
      console.error(`Player ${playerId} not found`);
      return false;
    }

    if (state.turnState.currentPlayerId !== playerId) {
      console.error(`Not ${player.name}'s turn`);
      return false;
    }

    if (state.turnState.step !== 'init_place_village') {
      console.error(`Cannot place village in step ${state.turnState.step}`);
      return false;
    }

    const validation = canPlaceVillageAtVertex(
      vertexId,
      state.verticesOccupiedBy,
      this.boardSize
    );

    if (!validation.canPlace) {
      console.error(`Cannot place village: ${validation.reason}`);
      return false;
    }

    const village: Village = {
      id: `village_${state.villages.length + 1}`,
      playerId,
      vertexId,
      type: 'settlement'
    };

    this.stateManager.addVillage(village);
    this.stateManager.updateState({
      turnState: {
        step: 'init_place_road',
        placementContext: { lastVillageVertex: vertexId }
      }
    });

    this.stateManager.updatePlayer(playerId, { hasPlacedVillage: true });

    this.log(`${player.name} placed a village at vertex ${vertexId}`);

    return true;
  }

  placeRoad(playerId: string, edgeId: string): boolean {
    const state = this.stateManager.getState();
    const player = this.stateManager.getPlayerById(playerId);

    if (!player) {
      console.error(`Player ${playerId} not found`);
      return false;
    }

    if (state.turnState.currentPlayerId !== playerId) {
      console.error(`Not ${player.name}'s turn`);
      return false;
    }

    if (state.turnState.step !== 'init_place_road') {
      console.error(`Cannot place road in step ${state.turnState.step}`);
      return false;
    }

    const lastVillageVertex = state.turnState.placementContext.lastVillageVertex;
    if (!lastVillageVertex) {
      console.error('No village vertex found for road placement');
      return false;
    }

    const [v1, v2] = edgeId.split('__').map(Number);

    if (v1 !== lastVillageVertex && v2 !== lastVillageVertex) {
      console.error(`Road must connect to village at vertex ${lastVillageVertex}`);
      return false;
    }

    const validation = canPlaceRoadOnEdge(v1, v2, state.edgesOccupiedBy, this.boardSize);

    if (!validation.canPlace) {
      console.error(`Cannot place road: ${validation.reason}`);
      return false;
    }

    const road: Road = {
      id: `road_${state.roads.length + 1}`,
      playerId,
      from: v1,
      to: v2
    };

    this.stateManager.addRoad(road);
    this.stateManager.updatePlayer(playerId, { hasPlacedRoad: true });

    this.log(`${player.name} placed a road on edge ${edgeId}`);

    this.advanceTurn();

    return true;
  }

  private advanceTurn(): void {
    const state = this.stateManager.getState();
    const nextPlayer = getNextPlayerInTurn(state);

    if (!nextPlayer) {
      console.error('No next player found');
      return;
    }

    this.stateManager.updateState({
      currentPlayer: nextPlayer.id,
      turnState: {
        currentPlayerId: nextPlayer.id,
        step: 'init_place_village',
        placementContext: { lastVillageVertex: null }
      }
    });

    this.log(`${nextPlayer.name}'s turn`);

    this.checkPhaseCompletion();
  }

  private checkPhaseCompletion(): void {
    const state = this.stateManager.getState();

    if (state.phase === 'setup-phase-1') {
      const result = checkSetupPhase1Completion(state);
      if (result.shouldTransition) {
        this.transitionToPhase2();
      }
    } else if (state.phase === 'setup-phase-2') {
      const result = checkSetupPhase2Completion(state);
      if (result.shouldTransition) {
        this.transitionToMainGame();
      }
    }
  }

  private transitionToPhase2(): void {
    const state = this.stateManager.getState();
    const firstPlayer = state.players.find(p => p.order === 1);

    if (!firstPlayer) {
      console.error('No first player found for Phase 2');
      return;
    }

    this.log('=== Setup Phase 1 Complete ===');
    this.log('=== Setup Phase 2 Begins ===');

    this.stateManager.updateState({
      phase: 'setup-phase-2',
      currentPlayer: firstPlayer.id,
      turnState: {
        currentPlayerId: firstPlayer.id,
        step: 'init_place_village',
        placementContext: { lastVillageVertex: null }
      }
    });

    this.log(`${firstPlayer.name} begins Turn 2`);
  }

  private transitionToMainGame(): void {
    const state = this.stateManager.getState();
    const firstPlayer = state.players.find(p => p.order === 1);

    this.log('=== Setup Phase 2 Complete ===');
    this.log('=== Main Game Begins ===');

    this.stateManager.updateState({
      phase: 'playing',
      currentPlayer: firstPlayer?.id || state.currentPlayer,
      turnState: {
        currentPlayerId: firstPlayer?.id || state.currentPlayer,
        step: 'awaiting_dice_roll',
        placementContext: { lastVillageVertex: null }
      }
    });
  }

  executeAITurn(playerId: string): boolean {
    const state = this.stateManager.getState();
    const player = this.stateManager.getPlayerById(playerId);

    if (!player || player.isHuman) {
      return false;
    }

    const decision = state.phase === 'setup-phase-1'
      ? this.aiEngine.decideSetupPhase1Action(player, state)
      : this.aiEngine.decideSetupPhase2Action(player, state);

    if (decision.action === 'place_village' && decision.vertexId) {
      return this.placeVillage(playerId, decision.vertexId);
    }

    if (decision.action === 'place_road' && decision.edgeId) {
      return this.placeRoad(playerId, decision.edgeId);
    }

    return false;
  }
}
