import { GameState, Player } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { loadBoardForSize } from '../graph/loadBoard';
import { getMostNeededResources, BUILDING_COSTS } from './buildingCosts';
import { isHighThreat } from './aiTradingStrategy';
import { DIFFICULTY_PRESETS } from './aiDifficultyTuning';

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

  if (!gameState.boardCenters || gameState.boardCenters.length === 0) {
    console.error('ERROR: boardCenters is undefined or empty in selectRobberPlacement');
    const boardData = loadBoardForSize(boardSize);
    const fallbackHex = boardData.centers.find(c => c.resourceType !== 'desert') || boardData.centers[0];
    return {
      hexId: fallbackHex.id,
      targetPlayerId: undefined,
      score: 0,
      reasoning: 'Fallback - boardCenters was undefined'
    };
  }

  const validHexes = gameState.boardCenters.filter(center =>
    center.id !== gameState.robberPosition
  );

  if (validHexes.length === 0) {
    console.error('ERROR: No valid hexes available for robber placement');
    const fallbackHex = gameState.boardCenters.find(c => c.resourceType !== 'desert') || gameState.boardCenters[0];
    return {
      hexId: fallbackHex.id,
      targetPlayerId: undefined,
      score: 0,
      reasoning: 'Fallback - no valid hexes'
    };
  }

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
    const reasoning = generateRobberReasoning(hex, targetPlayer, player, gameState, boardSize);

    return {
      hexId: hex.id,
      targetPlayerId: targetPlayer,
      score,
      reasoning
    };
  });

  scoredPlacements.sort((a, b) => b.score - a.score);

  console.log(`   Top 3 placements:`);
  scoredPlacements.slice(0, 3).forEach((p, i) => {
    const hex = gameState.boardCenters.find(c => c.id === p.hexId);
    const target = p.targetPlayerId ? gameState.players.find(pl => pl.id === p.targetPlayerId) : null;
    console.log(`     ${i + 1}. Hex ${p.hexId} (${hex?.resourceType} ${hex?.value}) - Score: ${p.score.toFixed(1)} ${target ? `→ ${target.name}` : ''}`);
  });

  if (difficulty === 'normal') {
    // Candidate band driven by the shared difficulty preset (normal = top 30%),
    // keeping at least the top 3 so placement stays sensible on small boards.
    const topPercent = DIFFICULTY_PRESETS.normal.selectionTopPercent;
    const topPlacements = scoredPlacements.slice(0, Math.max(3, Math.ceil(scoredPlacements.length * topPercent)));
    const selected = topPlacements[Math.floor(Math.random() * topPlacements.length)];
    console.log(`   ✓ Selected from top ${topPlacements.length}: Hex ${selected.hexId}`);
    return selected;
  }

  console.log(`   ✓ Selected best: Hex ${scoredPlacements[0].hexId}`);
  return scoredPlacements[0];
}

function generateRobberReasoning(
  hex: { id: number; resourceType: string; value: number; vertices: number[] },
  targetPlayerId: string | undefined,
  currentPlayer: Player,
  gameState: GameState,
  boardSize: BoardSize
): string {
  const reasons: string[] = [];
  const pointsToWin = gameState.gameSettings.pointsToWin;

  if (targetPlayerId) {
    const targetPlayer = gameState.players.find(p => p.id === targetPlayerId);
    if (targetPlayer) {
      const targetPoints = targetPlayer.score + targetPlayer.secretPoints;
      const pointsAway = pointsToWin - targetPoints;

      const leader = getGameLeader(gameState, currentPlayer.id);
      const isLeader = leader && targetPlayer.id === leader.id;

      if (pointsAway <= 2) {
        reasons.push(`block ${targetPlayer.name} (${pointsAway} pts from winning)`);
      } else if (isLeader) {
        reasons.push(`block leader ${targetPlayer.name} (${targetPoints} pts)`);
      } else {
        reasons.push(`block ${targetPlayer.name}`);
      }
    }
  }

  const productionQuality = hex.value === 6 || hex.value === 8 ? 'high-production' :
                            hex.value === 5 || hex.value === 9 ? 'good' : 'moderate';

  if (productionQuality !== 'moderate') {
    reasons.push(`${productionQuality} ${hex.resourceType}`);
  } else {
    reasons.push(`${hex.resourceType}`);
  }

  if (reasons.length === 0) {
    return `Block ${hex.resourceType} hex`;
  }

  const capitalizedReasons = reasons.map((r, i) => i === 0 ? r.charAt(0).toUpperCase() + r.slice(1) : r);
  return capitalizedReasons.join(', ');
}

function scoreRobberPlacement(
  hexId: number,
  player: Player,
  gameState: GameState,
  boardSize: BoardSize
): number {
  const hex = gameState.boardCenters.find(c => c.id === hexId);

  if (!hex) return 0;

  let score = 0;

  if (hex.resourceType === 'desert') {
    return -100;
  }

  const currentRobberHex = gameState.boardCenters.find(c => c.id === gameState.robberPosition);
  const isRobberBlockingSelf = currentRobberHex && getPlayersOnHex(gameState.robberPosition, gameState, boardSize).includes(player.id);

  if (isRobberBlockingSelf && currentRobberHex) {
    const currentHexProductionValue = getHexProductionValue(currentRobberHex.value);
    const isHighProduction = currentRobberHex.value === 6 || currentRobberHex.value === 8;

    if (isHighProduction) {
      score += 80;
    } else if (currentHexProductionValue >= 4) {
      score += 50;
    } else {
      score += 30;
    }
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

    // Threat-aware targeting: a player about to seize Longest Road / Largest Army
    // (or otherwise close to winning) is worth denying production to, even if
    // they aren't the current points leader.
    if (isHighThreat(targetPlayer, gameState)) {
      score += 35;
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
  const hex = gameState.boardCenters.find(c => c.id === hexId);

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

  const currentPlayer = gameState.players.find(p => p.id === currentPlayerId);
  if (!currentPlayer) return playersOnHex[0];

  const neededResources = getMostNeededResources(currentPlayer, ['village', 'estate', 'dev_card', 'road']);
  const topNeeds = new Set(neededResources.slice(0, 3).map(r => r.resource));

  const leader = getGameLeader(gameState, currentPlayerId);
  const pointsToWin = gameState.gameSettings.pointsToWin;

  const playersWithResources = playersOnHex.filter(pid => {
    const p = gameState.players.find(player => player.id === pid);
    return p && p.resources.total > 0;
  });

  if (playersWithResources.length === 0) {
    return playersOnHex[0];
  }

  const hex = gameState.boardCenters.find(c => c.id === hexId);

  const scoredTargets = playersWithResources.map(pid => {
    const p = gameState.players.find(player => player.id === pid);
    if (!p) return { playerId: pid, score: 0 };

    let score = 0;

    const pointsAway = pointsToWin - (p.score + p.secretPoints);
    if (pointsAway <= 2) {
      score += 40;
    } else if (leader && p.id === leader.id) {
      score += 30;
    } else if (isHighThreat(p, gameState)) {
      score += 25;
    }

    if (hex && hex.resourceType !== 'desert' && topNeeds.has(hex.resourceType)) {
      score += 25;
    }

    const playerVillagesOnHex = gameState.villages.filter(
      v => v.playerId === pid && hex && hex.vertices.includes(v.vertexId)
    );

    const hasEstateOnHex = playerVillagesOnHex.some(v => v.type === 'city');
    if (hasEstateOnHex) {
      score += 15;
    } else if (playerVillagesOnHex.length > 0) {
      score += 10;
    }

    score += p.resources.total * 1.5;

    for (const neededRes of Array.from(topNeeds)) {
      const resKey = neededRes as keyof typeof p.resources;
      if (p.resources[resKey] && p.resources[resKey] >= 1) {
        score += 8;
      }
    }

    return { playerId: pid, score };
  });

  scoredTargets.sort((a, b) => b.score - a.score);
  return scoredTargets[0].playerId;
}
