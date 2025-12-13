import { GameState, Player } from '../types/game';

export interface PhaseTransitionResult {
  shouldTransition: boolean;
  nextPhase?: GameState['phase'];
  nextStep?: string;
  message?: string;
  nextPlayerId?: string;
}

export function checkSetupPhase1Completion(gameState: GameState): PhaseTransitionResult {
  const allPlayersCompletedPhase1 = gameState.players.every(player =>
    player.villageCount >= 1 && player.roadCount >= 1
  );

  if (!allPlayersCompletedPhase1) {
    return { shouldTransition: false };
  }

  const firstPlayer = gameState.players.find(p => p.order === 1);

  return {
    shouldTransition: true,
    nextPhase: 'setup-phase-2',
    nextStep: 'init_place_village',
    message: 'Setup Phase 1 Complete - Beginning Setup Phase 2',
    nextPlayerId: firstPlayer?.id
  };
}

export function checkSetupPhase2Completion(gameState: GameState): PhaseTransitionResult {
  const allPlayersCompletedPhase2 = gameState.players.every(player =>
    player.villageCount >= 2 && player.roadCount >= 2
  );

  if (!allPlayersCompletedPhase2) {
    return { shouldTransition: false };
  }

  const firstPlayer = gameState.players.find(p => p.order === 1);

  return {
    shouldTransition: true,
    nextPhase: 'playing',
    nextStep: 'awaiting_dice_roll',
    message: 'Setup Phase 2 Complete - Beginning Main Game',
    nextPlayerId: firstPlayer?.id
  };
}

export function getNextPlayerInTurn(gameState: GameState): Player | null {
  const currentIndex = gameState.players.findIndex(p => p.id === gameState.currentPlayer);
  if (currentIndex === -1) return null;

  const nextIndex = (currentIndex + 1) % gameState.players.length;
  return gameState.players[nextIndex];
}

export function isPlayerTurnComplete(gameState: GameState, playerId: string): boolean {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return false;

  if (gameState.phase === 'setup-phase-1') {
    return player.hasPlacedVillage && player.hasPlacedRoad;
  }

  if (gameState.phase === 'setup-phase-2') {
    return player.villageCount >= 2 && player.roadCount >= 2;
  }

  return false;
}

export function shouldAdvanceTurn(gameState: GameState): boolean {
  const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
  if (!currentPlayer) return false;

  return (
    gameState.turnState.step === 'init_place_village' &&
    gameState.turnState.placementContext.lastVillageVertex === null &&
    (currentPlayer.hasPlacedVillage || currentPlayer.villageCount > 0) &&
    (currentPlayer.hasPlacedRoad || currentPlayer.roadCount > 0)
  );
}

export function calculatePhaseCompletion(gameState: GameState): {
  phase: string;
  playersCompleted: number;
  totalPlayers: number;
  percentComplete: number;
} {
  const totalPlayers = gameState.players.length;
  let playersCompleted = 0;

  if (gameState.phase === 'setup-phase-1') {
    playersCompleted = gameState.players.filter(p =>
      p.villageCount >= 1 && p.roadCount >= 1
    ).length;
  } else if (gameState.phase === 'setup-phase-2') {
    playersCompleted = gameState.players.filter(p =>
      p.villageCount >= 2 && p.roadCount >= 2
    ).length;
  }

  return {
    phase: gameState.phase,
    playersCompleted,
    totalPlayers,
    percentComplete: totalPlayers > 0 ? (playersCompleted / totalPlayers) * 100 : 0
  };
}

export function resetPlayerTurnFlags(player: Player): Player {
  return {
    ...player,
    hasPlacedVillage: false,
    hasPlacedRoad: false
  };
}
