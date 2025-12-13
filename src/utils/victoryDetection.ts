import { GameState, Player } from '../types/game';

export interface PlayerVictoryStats {
  playerId: string;
  playerNumber: number;
  playerName: string;
  playerColor: string;
  villageCount: number;
  cityCount: number;
  longestRoadBonus: number;
  hasLongestRoad: boolean;
  largestArmyBonus: number;
  hasLargestArmy: boolean;
  extraPointCards: number;
  totalPoints: number;
}

export function calculatePlayerTotalPoints(player: Player, gameSettings: GameState['gameSettings']): number {
  // Player.score already includes bonuses from longest road and largest army
  // They are added when hasLongestRoad or hasLargestArmy is set to true
  return player.score;
}

export function checkVictoryCondition(gameState: GameState): { hasWinner: boolean; winner: Player | null } {
  const pointsToWin = gameState.gameSettings.pointsToWin;

  for (const player of gameState.players) {
    const totalPoints = calculatePlayerTotalPoints(player, gameState.gameSettings);

    if (totalPoints >= pointsToWin) {
      return { hasWinner: true, winner: player };
    }
  }

  return { hasWinner: false, winner: null };
}

export function getAllPlayerStats(gameState: GameState): PlayerVictoryStats[] {
  const stats: PlayerVictoryStats[] = gameState.players.map(player => {
    const totalPoints = calculatePlayerTotalPoints(player, gameState.gameSettings);

    return {
      playerId: player.id,
      playerNumber: player.order,
      playerName: player.name,
      playerColor: player.color,
      villageCount: player.villageCount,
      cityCount: player.cityCount,
      longestRoadBonus: player.hasLongestRoad && gameState.gameSettings.longestRoadEnabled
        ? gameState.gameSettings.longestRoadBonus
        : 0,
      hasLongestRoad: player.hasLongestRoad,
      largestArmyBonus: player.hasLargestArmy && gameState.gameSettings.largestArmyEnabled
        ? gameState.gameSettings.largestArmyBonus
        : 0,
      hasLargestArmy: player.hasLargestArmy,
      extraPointCards: player.secretPoints,
      totalPoints
    };
  });

  return stats.sort((a, b) => b.totalPoints - a.totalPoints);
}
