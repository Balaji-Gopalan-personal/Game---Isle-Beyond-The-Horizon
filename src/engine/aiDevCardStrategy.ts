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

  let buyProbability = 0.4;

  if (pointsAway <= 3) {
    buyProbability = 0.8;
  } else if (pointsAway <= 5) {
    buyProbability = 0.6;
  }

  if (gameState.gameSettings.largestArmyEnabled) {
    const largestArmyBonus = gameState.gameSettings.largestArmyBonus;
    const largestArmySize = gameState.gameSettings.largestArmySize;
    const myGuardCount = player.guardsPlayed;
    const currentLargestArmyHolder = gameState.players.find(p => p.hasLargestArmy);

    if (largestArmyBonus >= 3) {
      if (currentLargestArmyHolder && currentLargestArmyHolder.id === player.id) {
        buyProbability += 0.15;
      } else if (myGuardCount >= largestArmySize - 2) {
        const guardsNeeded = currentLargestArmyHolder
          ? Math.max(currentLargestArmyHolder.guardsPlayed + 1 - myGuardCount, 0)
          : largestArmySize - myGuardCount;

        if (guardsNeeded <= 2) {
          buyProbability += 0.2;
        }
      }
    }
  }

  return Math.random() < Math.min(buyProbability, 0.95);
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

  const largestArmyBonus = gameState.gameSettings.largestArmyEnabled ? gameState.gameSettings.largestArmyBonus : 0;
  const longestRoadBonus = gameState.gameSettings.longestRoadEnabled ? gameState.gameSettings.longestRoadBonus : 0;
  const maxBonus = Math.max(largestArmyBonus, longestRoadBonus);
  const bonusAdjustment = maxBonus >= 4 ? -1 : 0;

  if (difficulty === 'easy') {
    if (scoredCards[0].score > (5 + bonusAdjustment) && Math.random() < 0.4) {
      return {
        shouldPlay: true,
        cardId: scoredCards[0].card.id,
        reasoning: `Playing ${scoredCards[0].card.name} (score: ${scoredCards[0].score})`
      };
    }
  } else if (difficulty === 'normal') {
    if (scoredCards[0].score > (6 + bonusAdjustment) && Math.random() < 0.6) {
      return {
        shouldPlay: true,
        cardId: scoredCards[0].card.id,
        reasoning: `Playing ${scoredCards[0].card.name} (score: ${scoredCards[0].score})`
      };
    }
  } else {
    if (scoredCards[0].score > (4 + bonusAdjustment)) {
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

      let guardScore = 5;

      if (gameState.gameSettings.largestArmyEnabled) {
        const largestArmyBonus = gameState.gameSettings.largestArmyBonus;
        const largestArmySize = gameState.gameSettings.largestArmySize;
        const myGuardCount = player.guardsPlayed;
        const currentLargestArmyHolder = gameState.players.find(p => p.hasLargestArmy);

        if (currentLargestArmyHolder && currentLargestArmyHolder.id === player.id) {
          const bonusValue = largestArmyBonus * 1.5;
          guardScore += bonusValue;
          console.log(`   🏆 Largest Army holder - bonus value: +${bonusValue.toFixed(1)} (${largestArmyBonus} pts)`);
        } else if (myGuardCount >= largestArmySize - 2) {
          const guardsNeeded = currentLargestArmyHolder
            ? Math.max(currentLargestArmyHolder.guardsPlayed + 1 - myGuardCount, 0)
            : largestArmySize - myGuardCount;

          if (guardsNeeded <= 1) {
            const bonusValue = largestArmyBonus * 3.0;
            guardScore += bonusValue;
            console.log(`   ⚔️ Close to Largest Army (${guardsNeeded} guards needed) - bonus value: +${bonusValue.toFixed(1)} (${largestArmyBonus} pts)`);
          } else if (guardsNeeded <= 2) {
            const bonusValue = largestArmyBonus * 2.0;
            guardScore += bonusValue;
            console.log(`   ⚔️ Pursuing Largest Army (${guardsNeeded} guards needed) - bonus value: +${bonusValue.toFixed(1)} (${largestArmyBonus} pts)`);
          } else if (guardsNeeded <= 3) {
            const bonusValue = largestArmyBonus * 1.5;
            guardScore += bonusValue;
            console.log(`   ⚔️ Working toward Largest Army (${guardsNeeded} guards needed) - bonus value: +${bonusValue.toFixed(1)} (${largestArmyBonus} pts)`);
          }
        }
      }

      const leader = getGameLeader(gameState);
      if (leader && leader.id !== player.id) {
        const leaderPointsAway = pointsToWin - (leader.score + leader.secretPoints);
        if (leaderPointsAway <= 2) {
          guardScore += 10;
        } else if (leaderPointsAway <= 4) {
          guardScore += 5;
        }
      }

      if (player.resources.total >= gameState.gameSettings.maxResourceHold) {
        guardScore += 7;
      }

      return guardScore;

    case 'Road Construction':
      const roadCount = gameState.roads.filter(r => r.playerId === player.id).length;
      let roadConstructionScore = 6;

      if (gameState.gameSettings.longestRoadEnabled) {
        const longestRoadBonus = gameState.gameSettings.longestRoadBonus;
        const longestRoadSize = gameState.gameSettings.longestRoadSize;
        const myLongestPath = player.longestRoadLength || 0;
        const currentLongestRoadHolder = gameState.players.find(p => p.hasLongestRoad);

        if (currentLongestRoadHolder && currentLongestRoadHolder.id === player.id) {
          const bonusValue = longestRoadBonus * 1.5;
          roadConstructionScore += bonusValue;
          console.log(`   🏆 Longest Road holder - bonus value: +${bonusValue.toFixed(1)} (${longestRoadBonus} pts)`);
        } else if (myLongestPath >= longestRoadSize - 3) {
          const roadsNeeded = currentLongestRoadHolder
            ? Math.max((currentLongestRoadHolder.longestRoadLength || 0) + 1 - myLongestPath, 0)
            : longestRoadSize - myLongestPath;

          if (roadsNeeded <= 2) {
            const bonusValue = longestRoadBonus * 3.0;
            roadConstructionScore += bonusValue;
            console.log(`   🛤️ Close to Longest Road (${roadsNeeded} roads needed) - bonus value: +${bonusValue.toFixed(1)} (${longestRoadBonus} pts)`);
          } else if (roadsNeeded <= 3) {
            const bonusValue = longestRoadBonus * 2.0;
            roadConstructionScore += bonusValue;
            console.log(`   🛤️ Pursuing Longest Road (${roadsNeeded} roads needed) - bonus value: +${bonusValue.toFixed(1)} (${longestRoadBonus} pts)`);
          }
        }
      }

      if (roadCount < 6) {
        roadConstructionScore += 6;
      } else if (roadCount < 10) {
        roadConstructionScore += 3;
      }

      return roadConstructionScore;

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
      // Only play Expert Negotiator if we're actually planning to do a bank trade
      const wouldBankTrade = checkIfBankTradeIsBeneficial(player, gameState);
      if (!wouldBankTrade) {
        return 0;  // Don't play if not intending to bank trade
      }

      // If we would benefit from a bank trade, Expert Negotiator is very valuable
      if (pointsAway <= 4) {
        return 13;
      } else {
        return 10;
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

function checkIfBankTradeIsBeneficial(player: Player, gameState: GameState): boolean {
  // Check if player has any trade goals (needs resources for buildings)
  const hasTradeGoal = hasViableBuildingGoal(player, gameState);
  if (!hasTradeGoal) {
    return false;
  }

  // Check if player has surplus resources they could trade
  const hasSurplus = checkSurplusResources(player);
  if (!hasSurplus) {
    return false;
  }

  // Check if player can afford at least one bank trade (4:1 or better with ports)
  const resourceTypes = ['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const;
  for (const resource of resourceTypes) {
    // Can afford 4:1 trade (minimum bank trade rate)?
    if (player.resources[resource] >= 4) {
      return true;
    }
    // Can afford 3:1 with generic port or 2:1 with specific port?
    if (player.resources[resource] >= 3) {
      return true;
    }
  }

  return false;
}

function hasViableBuildingGoal(player: Player, gameState: GameState): boolean {
  const res = player.resources;

  // Close to affording a village? (need 1 each of clay, lumber, grain, fabric)
  const villageDeficit =
    (res.clay >= 1 ? 0 : 1) +
    (res.lumber >= 1 ? 0 : 1) +
    (res.grain >= 1 ? 0 : 1) +
    (res.fabric >= 1 ? 0 : 1);
  if (villageDeficit <= 2 && villageDeficit > 0) {
    return true;
  }

  // Close to affording an estate? (need 2 grain, 3 mineral)
  const estateDeficit =
    (res.grain >= 2 ? 0 : 2 - res.grain) +
    (res.mineral >= 3 ? 0 : 3 - res.mineral);
  if (estateDeficit <= 2 && estateDeficit > 0) {
    return true;
  }

  // Close to affording a road? (need 1 clay, 1 lumber)
  const roadDeficit =
    (res.clay >= 1 ? 0 : 1) +
    (res.lumber >= 1 ? 0 : 1);
  if (roadDeficit === 1) {
    return true;
  }

  // Close to affording a dev card? (need 1 grain, 1 fabric, 1 mineral)
  const devCardDeficit =
    (res.grain >= 1 ? 0 : 1) +
    (res.fabric >= 1 ? 0 : 1) +
    (res.mineral >= 1 ? 0 : 1);
  if (devCardDeficit <= 2 && devCardDeficit > 0) {
    return true;
  }

  return false;
}
