import { GameState, Player } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { loadBoardForSize } from '../graph/loadBoard';

export interface RobberPlacement {
  hexId: number;
  targetPlayerId?: string;
  score: number;
  reasoning: string;
}

export function selectRobberPlacement(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  difficulty: 'easy' | 'normal' | 'hard'
): RobberPlacement {
  console.log(`\n🎲 [${player.name}] SELECTING ROBBER PLACEMENT (${difficulty} difficulty)`);

  const boardData = loadBoardForSize(boardSize);
  const validHexes = boardData.centers.filter(center =>
    center.id !== gameState.robberPosition
  );

  if (difficulty === 'easy') {
    const randomHex = validHexes[Math.floor(Math.random() * validHexes.length)];
    const targetPlayer = selectStealTarget(randomHex.id, gameState, player.id, boardSize);
    console.log(`   ✓ Random selection: Hex ${randomHex.id}`);
    if (targetPlayer) {
      const target = gameState.players.find(p => p.id === targetPlayer);
      console.log(`   Target: ${target?.name}`);
    }
    return {
      hexId: randomHex.id,
      targetPlayerId: targetPlayer,
      score: 0,
      reasoning: 'Random placement (easy difficulty)'
    };
  }

  const scoredPlacements = validHexes.map(hex => {
    const score = scoreRobberPlacement(hex.id, player, gameState, boardSize);
    const targetPlayer = selectStealTarget(hex.id, gameState, player.id, boardSize);

    return {
      hexId: hex.id,
      targetPlayerId: targetPlayer,
      score,
      reasoning: `Blocking hex ${hex.id} (${hex.resourceType} ${hex.value})`
    };
  });

  scoredPlacements.sort((a, b) => b.score - a.score);

  console.log(`   Top 3 placements:`);
  scoredPlacements.slice(0, 3).forEach((p, i) => {
    const hex = boardData.centers.find(c => c.id === p.hexId);
    const target = p.targetPlayerId ? gameState.players.find(pl => pl.id === p.targetPlayerId) : null;
    console.log(`     ${i + 1}. Hex ${p.hexId} (${hex?.resourceType} ${hex?.value}) - Score: ${p.score.toFixed(1)} ${target ? `→ ${target.name}` : ''}`);
  });

  if (difficulty === 'normal') {
    const topPlacements = scoredPlacements.slice(0, Math.max(3, Math.ceil(scoredPlacements.length * 0.2)));
    const selected = topPlacements[Math.floor(Math.random() * topPlacements.length)];
    console.log(`   ✓ Selected from top ${topPlacements.length}: Hex ${selected.hexId}`);
    return selected;
  }

  console.log(`   ✓ Selected best: Hex ${scoredPlacements[0].hexId}`);
  return scoredPlacements[0];
}

function scoreRobberPlacement(
  hexId: number,
  player: Player,
  gameState: GameState,
  boardSize: BoardSize
): number {
  const boardData = loadBoardForSize(boardSize);
  const hex = boardData.centers.find(c => c.id === hexId);

  if (!hex) return 0;

  let score = 0;

  if (hex.resourceType === 'desert') {
    return -100;
  }

  const productionValue = getHexProductionValue(hex.value);
  score += productionValue * 10;

  if (hex.value === 6 || hex.value === 8) {
    score += 20;
  } else if (hex.value === 5 || hex.value === 9) {
    score += 10;
  }

  const playersOnHex = getPlayersOnHex(hexId, gameState, boardSize);

  const leader = getGameLeader(gameState, player.id);
  const secondPlace = getSecondPlacePlayer(gameState, player.id);
  const pointsToWin = gameState.gameSettings.pointsToWin;

  for (const playerId of playersOnHex) {
    if (playerId === player.id) {
      score -= 50;
      continue;
    }

    const targetPlayer = gameState.players.find(p => p.id === playerId);
    if (!targetPlayer) continue;

    const pointsAway = pointsToWin - (targetPlayer.score + targetPlayer.secretPoints);

    if (pointsAway <= 2) {
      score += 60;
    } else if (pointsAway <= 4) {
      score += 40;
    } else if (leader && playerId === leader.id) {
      score += 30;
    } else if (secondPlace && playerId === secondPlace.id) {
      score += 20;
    } else {
      score += 10;
    }

    const villageCount = gameState.villages.filter(
      v => v.playerId === playerId && hex.vertices.includes(v.vertexId)
    ).length;

    const cityCount = gameState.villages.filter(
      v => v.playerId === playerId && v.type === 'city' && hex.vertices.includes(v.vertexId)
    ).length;

    score += villageCount * 5;
    score += cityCount * 10;
  }

  return score;
}

function getHexProductionValue(pipValue: number): number {
  const probabilities: Record<number, number> = {
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    7: 6,
    8: 5,
    9: 4,
    10: 3,
    11: 2,
    12: 1
  };

  return probabilities[pipValue] || 0;
}

function getPlayersOnHex(hexId: number, gameState: GameState, boardSize: BoardSize): string[] {
  const boardData = loadBoardForSize(boardSize);
  const hex = boardData.centers.find(c => c.id === hexId);

  if (!hex) return [];

  const players = new Set<string>();

  for (const village of gameState.villages) {
    if (hex.vertices.includes(village.vertexId)) {
      players.add(village.playerId);
    }
  }

  return Array.from(players);
}

function getGameLeader(gameState: GameState, excludePlayerId: string): Player | null {
  let leader: Player | null = null;
  let maxScore = -1;

  for (const player of gameState.players) {
    if (player.id === excludePlayerId) continue;

    const totalScore = player.score + player.secretPoints;
    if (totalScore > maxScore) {
      maxScore = totalScore;
      leader = player;
    }
  }

  return leader;
}

function getSecondPlacePlayer(gameState: GameState, excludePlayerId: string): Player | null {
  const sortedPlayers = gameState.players
    .filter(p => p.id !== excludePlayerId)
    .sort((a, b) => (b.score + b.secretPoints) - (a.score + a.secretPoints));

  return sortedPlayers.length >= 2 ? sortedPlayers[1] : null;
}

function selectStealTarget(
  hexId: number,
  gameState: GameState,
  currentPlayerId: string,
  boardSize: BoardSize
): string | undefined {
  const playersOnHex = getPlayersOnHex(hexId, gameState, boardSize).filter(
    pid => pid !== currentPlayerId
  );

  if (playersOnHex.length === 0) {
    return undefined;
  }

  const leader = getGameLeader(gameState, currentPlayerId);

  if (leader && playersOnHex.includes(leader.id)) {
    const leaderHasResources = leader.resources.total > 0;
    if (leaderHasResources) {
      return leader.id;
    }
  }

  const playersWithResources = playersOnHex.filter(pid => {
    const p = gameState.players.find(player => player.id === pid);
    return p && p.resources.total > 0;
  });

  if (playersWithResources.length === 0) {
    return playersOnHex[0];
  }

  const scoredTargets = playersWithResources.map(pid => {
    const p = gameState.players.find(player => player.id === pid);
    if (!p) return { playerId: pid, score: 0 };

    let score = 0;
    score += p.resources.total * 2;
    score += (p.score + p.secretPoints) * 3;

    return { playerId: pid, score };
  });

  scoredTargets.sort((a, b) => b.score - a.score);
  return scoredTargets[0].playerId;
}
