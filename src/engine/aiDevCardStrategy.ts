import { GameState, Player, DevelopmentCard } from '../types/game';
import { BoardSize } from '../data/boardConfigs';

export interface DevCardPlayDecision {
  shouldPlay: boolean;
  cardId?: string;
  reasoning?: string;
}

export function shouldBuyDevelopmentCard(
  player: Player,
  gameState: GameState
): boolean {
  if (gameState.developmentCardDeck.length === 0) {
    return false;
  }

  const pointsToWin = gameState.gameSettings.pointsToWin;
  const pointsAway = pointsToWin - (player.score + player.secretPoints);

  if (pointsAway <= 3) {
    return Math.random() < 0.8;
  } else if (pointsAway <= 5) {
    return Math.random() < 0.6;
  }

  return Math.random() < 0.4;
}

export function evaluateDevCardPlay(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  difficulty: 'easy' | 'normal' | 'hard'
): DevCardPlayDecision {
  if (player.developmentCardsInHand.length === 0) {
    return { shouldPlay: false, reasoning: 'No cards in hand' };
  }

  const playableCards = player.developmentCardsInHand.filter(
    card => card.turnDrawn !== gameState.turn && card.name !== 'Extra Point'
  );

  if (playableCards.length === 0) {
    return { shouldPlay: false, reasoning: 'No playable cards (all drawn this turn or Extra Point cards)' };
  }

  const scoredCards = playableCards.map(card => ({
    card,
    score: scoreCardPlayTiming(card, player, gameState, boardSize)
  }));

  scoredCards.sort((a, b) => b.score - a.score);

  if (difficulty === 'easy') {
    if (scoredCards[0].score > 5 && Math.random() < 0.4) {
      return {
        shouldPlay: true,
        cardId: scoredCards[0].card.id,
        reasoning: `Playing ${scoredCards[0].card.name} (score: ${scoredCards[0].score})`
      };
    }
  } else if (difficulty === 'normal') {
    if (scoredCards[0].score > 6 && Math.random() < 0.6) {
      return {
        shouldPlay: true,
        cardId: scoredCards[0].card.id,
        reasoning: `Playing ${scoredCards[0].card.name} (score: ${scoredCards[0].score})`
      };
    }
  } else {
    if (scoredCards[0].score > 4) {
      return {
        shouldPlay: true,
        cardId: scoredCards[0].card.id,
        reasoning: `Playing ${scoredCards[0].card.name} (score: ${scoredCards[0].score})`
      };
    }
  }

  return { shouldPlay: false, reasoning: 'No high-value card plays available' };
}

function scoreCardPlayTiming(
  card: DevelopmentCard,
  player: Player,
  gameState: GameState,
  boardSize: BoardSize
): number {
  const pointsToWin = gameState.gameSettings.pointsToWin;
  const pointsAway = pointsToWin - (player.score + player.secretPoints);

  let baseScore = 5;

  switch (card.name) {
    case 'Extra Point':
      if (pointsAway <= 1) {
        return 100;
      } else if (pointsAway <= 3) {
        return 20;
      }
      return 8;

    case 'Guard':
      const hasGuardPlayedThisTurn = player.guardsPlayedThisTurn > 0;
      if (hasGuardPlayedThisTurn) {
        return 0;
      }

      const leader = getGameLeader(gameState);
      if (leader && leader.id !== player.id) {
        const leaderPointsAway = pointsToWin - (leader.score + leader.secretPoints);
        if (leaderPointsAway <= 2) {
          return 15;
        } else if (leaderPointsAway <= 4) {
          return 10;
        }
      }

      if (player.resources.total >= gameState.gameSettings.maxResourceHold) {
        return 12;
      }

      return 5;

    case 'Road Construction':
      const roadCount = gameState.roads.filter(r => r.playerId === player.id).length;
      if (roadCount < 6) {
        return 12;
      } else if (roadCount < 10) {
        return 9;
      }
      return 6;

    case 'Free Upgrade':
      const villageCount = gameState.villages.filter(
        v => v.playerId === player.id && v.type === 'settlement'
      ).length;
      if (villageCount > 0) {
        return 14;
      }
      return 2;

    case 'Booming Economy':
      if (player.resources.total <= 3) {
        return 11;
      }
      return 7;

    case 'Resource Swap':
      let swapScore = 6;

      const atDiscardRisk = player.resources.total > gameState.gameSettings.maxResourceHold;
      const nearDiscardRisk = player.resources.total >= gameState.gameSettings.maxResourceHold - 1;

      if (atDiscardRisk) {
        swapScore += 12;
      } else if (nearDiscardRisk) {
        swapScore += 6;
      }

      const hasImbalance = checkResourceImbalance(player);
      const hasUselessSurplus = checkUselessResourceSurplus(player);

      if (hasUselessSurplus) {
        swapScore += 8;
      } else if (hasImbalance) {
        swapScore += 4;
      }

      const richestOpponent = getRichestOpponent(player, gameState);
      const isResourcePoor = player.resources.total <= 3;

      if (isResourcePoor && richestOpponent && richestOpponent.resources.total >= player.resources.total + 4) {
        swapScore += 10;
      }

      return swapScore;

    case 'Expert Negotiator':
      const hasSurplusResources = checkSurplusResources(player);
      if (!hasSurplusResources) {
        return 0;
      }

      if (pointsAway <= 4 && hasSurplusResources) {
        return 13;
      } else if (hasSurplusResources) {
        return 8;
      }
      return 0;

    case 'Closed Market':
      const leader2 = getGameLeader(gameState);
      if (leader2 && leader2.id !== player.id) {
        return 9;
      }
      return 5;

    default:
      return baseScore;
  }
}

function getGameLeader(gameState: GameState): Player | null {
  let leader: Player | null = null;
  let maxScore = -1;

  for (const player of gameState.players) {
    const totalScore = player.score + player.secretPoints;
    if (totalScore > maxScore) {
      maxScore = totalScore;
      leader = player;
    }
  }

  return leader;
}

function checkResourceImbalance(player: Player): boolean {
  const resources = [
    player.resources.clay,
    player.resources.lumber,
    player.resources.grain,
    player.resources.fabric,
    player.resources.mineral
  ];

  const max = Math.max(...resources);
  const min = Math.min(...resources);

  return max - min >= 3;
}

function checkSurplusResources(player: Player): boolean {
  const keepThreshold = 2;

  const resourceTypes = [
    player.resources.clay,
    player.resources.lumber,
    player.resources.grain,
    player.resources.fabric,
    player.resources.mineral
  ];

  return resourceTypes.some(amount => amount > keepThreshold);
}

function checkUselessResourceSurplus(player: Player): boolean {
  const nearVillage = player.resources.clay >= 1 && player.resources.lumber >= 1 &&
                       player.resources.grain >= 1 && player.resources.fabric >= 1;
  const nearEstate = player.resources.grain >= 2 && player.resources.mineral >= 3;

  if (nearVillage || nearEstate) {
    return false;
  }

  const resourceCounts = [
    player.resources.clay,
    player.resources.lumber,
    player.resources.grain,
    player.resources.fabric,
    player.resources.mineral
  ];

  const maxCount = Math.max(...resourceCounts);
  const minCount = Math.min(...resourceCounts);

  return maxCount >= 4 && minCount === 0;
}

function getRichestOpponent(player: Player, gameState: GameState): Player | null {
  let richest: Player | null = null;
  let maxResources = -1;

  for (const opponent of gameState.players) {
    if (opponent.id === player.id) continue;

    if (opponent.resources.total > maxResources) {
      maxResources = opponent.resources.total;
      richest = opponent;
    }
  }

  return richest;
}

export function shouldPlayDevCardBeforeRoll(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  difficulty: 'easy' | 'normal' | 'hard'
): DevCardPlayDecision {
  const decision = evaluateDevCardPlay(player, gameState, boardSize, difficulty);

  if (decision.shouldPlay && decision.cardId) {
    const card = player.developmentCardsInHand.find(c => c.id === decision.cardId);
    if (card && (card.name === 'Guard' || card.name === 'Road Construction')) {
      return decision;
    }
  }

  return { shouldPlay: false };
}

export function shouldPlayDevCardAfterRoll(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  difficulty: 'easy' | 'normal' | 'hard'
): DevCardPlayDecision {
  return evaluateDevCardPlay(player, gameState, boardSize, difficulty);
}
