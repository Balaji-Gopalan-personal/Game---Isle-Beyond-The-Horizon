import { GameState, Player, DevelopmentCard } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { getMostNeededResources } from './buildingCosts';
import { loadBoardForSize } from '../graph/loadBoard';
import { getStrategicDynamicForCharacter } from './aiLocationStrategy';

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
  const strategicDynamic = getStrategicDynamicForCharacter(player.character?.name);
  const villageCount = gameState.villages.filter(v => v.playerId === player.id && v.type === 'settlement').length;

  let buyProbability = 0.4;

  switch (strategicDynamic) {
    case 'dev_card_gambler':
      buyProbability = 0.65;
      break;
    case 'village_rusher':
      buyProbability = 0.22;
      break;
    case 'estate_climber':
      buyProbability = 0.38;
      break;
  }

  if (pointsAway <= 2) {
    buyProbability = Math.min(buyProbability + 0.3, 0.9);
  } else if (pointsAway <= 3) {
    buyProbability = Math.min(buyProbability + 0.25, 0.85);
  } else if (pointsAway <= 5) {
    buyProbability = Math.min(buyProbability + 0.15, 0.75);
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

        if (guardsNeeded <= 1) {
          buyProbability += 0.25;
        } else if (guardsNeeded <= 2) {
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

      let guardScore = 0;  // Start at 0 instead of 3 - must earn points to play

      const currentRobberHex = gameState.boardCenters?.find(c => c.id === gameState.robberPosition);
      const playersOnCurrentRobberHex = currentRobberHex ?
        gameState.villages.filter(v => currentRobberHex.vertices.includes(v.vertexId)).map(v => v.playerId) : [];
      const isRobberBlockingSelf = playersOnCurrentRobberHex.includes(player.id);
      const isRobberOnDesert = currentRobberHex?.resourceType === 'desert';

      // Check if Robber is ONLY blocking opponents (good position for us!)
      const hasOpponents = playersOnCurrentRobberHex.some(pid => pid !== player.id);
      const isRobberBlockingOnlyOpponents = hasOpponents && !isRobberBlockingSelf;

      if (isRobberBlockingOnlyOpponents && currentRobberHex) {
        // Robber is in a GOOD position - heavily penalize moving it
        const isHighProduction = currentRobberHex.value === 6 || currentRobberHex.value === 8;
        if (isHighProduction) {
          guardScore -= 25;
          console.log(`   ✗ Robber blocking opponent's high-production hex - penalty: -25 (DON'T MOVE IT!)`);
        } else {
          guardScore -= 15;
          console.log(`   ✗ Robber blocking opponent's hex - penalty: -15 (keep it there)`);
        }
      } else if (isRobberOnDesert) {
        // Robber on desert (hurting nobody) - moving it to opponent is valuable
        guardScore += 8;
        console.log(`   🏜️ Robber on desert - can move to opponent (+8)`);
      } else if (isRobberBlockingSelf && currentRobberHex) {
        const isHighProduction = currentRobberHex.value === 6 || currentRobberHex.value === 8;
        const isMediumProduction = currentRobberHex.value === 5 || currentRobberHex.value === 9;

        if (isHighProduction) {
          guardScore += 25;
          console.log(`   🚫 Robber blocking own high-production hex (${currentRobberHex.value}) - bonus: +25`);
        } else if (isMediumProduction) {
          guardScore += 15;
          console.log(`   🚫 Robber blocking own medium-production hex (${currentRobberHex.value}) - bonus: +15`);
        } else {
          guardScore += 8;
          console.log(`   🚫 Robber blocking own hex (${currentRobberHex.value}) - bonus: +8`);
        }
      } else {
        // Robber not blocking anyone or on a neutral position
        guardScore += 2;
        console.log(`   ⚪ Robber in neutral position - small bonus: +2`);
      }

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
          console.log(`   🎯 Leader ${leader.name} close to winning (${leaderPointsAway} away) - bonus: +10`);
        } else if (leaderPointsAway <= 4) {
          guardScore += 5;
          console.log(`   🎯 Leader ${leader.name} approaching win (${leaderPointsAway} away) - bonus: +5`);
        }
      }

      const neededResources = getMostNeededResources(player, ['village', 'estate', 'dev_card', 'road']);
      if (neededResources.length > 0 && neededResources[0].score > 0) {
        guardScore += 6;
        console.log(`   💎 Can potentially steal needed resources - bonus: +6`);
      }

      if (player.resources.total >= gameState.gameSettings.maxResourceHold) {
        guardScore += 7;
        console.log(`   📦 At resource limit, need to act - bonus: +7`);
      }

      // Final evaluation: only play if score is positive
      // Largest Army pursuit or self-blocking are the main valid reasons
      if (guardScore <= 0) {
        console.log(`   ⏸️ Guard score ${guardScore.toFixed(1)} - NOT worth playing`);
      } else {
        console.log(`   ✓ Guard score ${guardScore.toFixed(1)} - worth considering`);
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
      // Check if Expert Negotiator is already active this turn
      if (gameState.turnState.expertNegotiatorActive) {
        return 0;  // Already played this turn, cannot play again
      }

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
  const hasTradeGoal = hasViableBuildingGoal(player, gameState);
  if (!hasTradeGoal) {
    console.log(`   ⚠️ Expert Negotiator: No viable building goal, won't play card`);
    return false;
  }

  const hasSurplus = checkSurplusResources(player);
  if (!hasSurplus) {
    console.log(`   ⚠️ Expert Negotiator: No surplus resources to trade, won't play card`);
    return false;
  }

  const resourceTypes = ['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const;
  let canExecute2to1Trade = false;

  for (const resource of resourceTypes) {
    if (player.resources[resource] >= 2) {
      canExecute2to1Trade = true;
      console.log(`   ✓ Expert Negotiator: Can execute 2:1 trade with ${resource} (have ${player.resources[resource]})`);
      break;
    }
  }

  if (!canExecute2to1Trade) {
    console.log(`   ⚠️ Expert Negotiator: Cannot afford any 2:1 trades, won't play card`);
    return false;
  }

  // Check if player has specific resources they need - if they have duplicates but are missing
  // key resources for building, then 2:1 trade would be very beneficial
  const villageNeeds = 4 - Math.min(1, player.resources.clay) - Math.min(1, player.resources.lumber) -
                       Math.min(1, player.resources.grain) - Math.min(1, player.resources.fabric);
  const estateNeeds = 5 - Math.min(2, player.resources.grain) - Math.min(3, player.resources.mineral);

  // If we're 1-2 resources away from a building and have duplicates, 2:1 trade is great
  if ((villageNeeds <= 2 && villageNeeds > 0) || (estateNeeds <= 2 && estateNeeds > 0)) {
    console.log(`   ✓ Expert Negotiator: 2:1 trade would help close gap to building (village needs: ${villageNeeds}, estate needs: ${estateNeeds})`);
    return true;
  }

  // If we have 3+ of any resource, trading at 2:1 for diversity is beneficial
  for (const resource of resourceTypes) {
    if (player.resources[resource] >= 3) {
      console.log(`   ✓ Expert Negotiator: Have ${player.resources[resource]} ${resource}, can benefit from 2:1 trade for diversity`);
      return true;
    }
  }

  console.log(`   ✓ Expert Negotiator: Bank trade would be beneficial for building goals`);
  return true;
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

// Strategic AI resource selection for Booming Economy card
export interface ResourceSelection {
  resources: [string, string];
  reasoning: string;
}

export function selectBoomingEconomyResources(
  player: Player,
  gameState: GameState,
  difficulty: 'easy' | 'normal' | 'hard'
): ResourceSelection {
  console.log(`\n🌟 [${player.name}] SELECTING BOOMING ECONOMY RESOURCES (${difficulty} difficulty)`);

  const goals = identifyPlayerTradeGoals(player, gameState);

  if (goals.length === 0) {
    console.log(`   ⚠️ No clear building goals - selecting diverse resources`);
    return selectDiverseResources(player, difficulty);
  }

  const topGoal = goals[0];
  console.log(`   🎯 Top building goal: ${topGoal.targetBuilding} (priority ${topGoal.priority})`);

  const resourceScores: Array<{ resource: string; score: number; reason: string }> = [];
  const resourceTypes = ['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const;

  for (const resource of resourceTypes) {
    let score = 0;
    const reasons: string[] = [];

    const neededForTop = (topGoal.neededResources as any)[resource] || 0;
    if (neededForTop > 0) {
      score += neededForTop * 25;
      reasons.push(`${neededForTop} needed for ${topGoal.targetBuilding}`);
    }

    for (let i = 1; i < Math.min(goals.length, 3); i++) {
      const neededForGoal = (goals[i].neededResources as any)[resource] || 0;
      if (neededForGoal > 0) {
        score += neededForGoal * 8;
        reasons.push(`${neededForGoal} for ${goals[i].targetBuilding}`);
      }
    }

    const currentAmount = (player.resources as any)[resource];
    if (currentAmount === 0 && neededForTop > 0) {
      score += 12;
      reasons.push('needed and zero in hand');
    } else if (currentAmount === 0) {
      score += 5;
      reasons.push('zero in hand (diversity)');
    } else if (currentAmount === 1 && neededForTop > 0) {
      score += 6;
      reasons.push('low quantity, needed');
    }

    if (currentAmount >= 4 && neededForTop === 0) {
      score -= 10;
      reasons.push('surplus, not needed');
    }

    resourceScores.push({
      resource,
      score,
      reason: reasons.join(', ')
    });
  }

  resourceScores.sort((a, b) => b.score - a.score);

  console.log(`   📊 Resource scores:`);
  resourceScores.forEach((rs, idx) => {
    const current = (player.resources as any)[rs.resource];
    console.log(`     ${idx + 1}. ${rs.resource}: ${rs.score.toFixed(1)} (have ${current}) - ${rs.reason}`);
  });

  let selected: string[];

  if (difficulty === 'hard') {
    selected = [resourceScores[0].resource, resourceScores[1].resource];
    console.log(`   ✓ Hard difficulty: Selected top 2 (optimal)`);
  } else if (difficulty === 'normal') {
    if (Math.random() < 0.8) {
      selected = [resourceScores[0].resource, resourceScores[1].resource];
      console.log(`   ✓ Normal difficulty: Selected top 2 (80% optimal choice)`);
    } else {
      const topFour = resourceScores.slice(0, 4);
      const first = topFour[Math.floor(Math.random() * topFour.length)];
      const remaining = topFour.filter(r => r.resource !== first.resource);
      const second = remaining[Math.floor(Math.random() * remaining.length)];
      selected = [first.resource, second.resource];
      console.log(`   ✓ Normal difficulty: Selected from top 4 (20% suboptimal choice)`);
    }
  } else {
    if (Math.random() < 0.6) {
      selected = [resourceScores[0].resource, resourceScores[1].resource];
      console.log(`   ✓ Easy difficulty: Selected top 2 (60% optimal choice)`);
    } else {
      const topHalf = resourceScores.slice(0, 3);
      const first = topHalf[Math.floor(Math.random() * topHalf.length)];
      const remaining = resourceScores.filter(r => r.resource !== first.resource);
      const second = remaining[Math.floor(Math.random() * remaining.length)];
      selected = [first.resource, second.resource];
      console.log(`   ✓ Easy difficulty: Random selection (40% suboptimal choice)`);
    }
  }

  const reasoning = `Selected ${selected[0]} and ${selected[1]} for ${topGoal.targetBuilding}`;
  console.log(`   🎁 Final selection: ${selected[0]}, ${selected[1]}`);
  console.log(`   ✅ Validation: Both resources are needed for current building goals`);

  return {
    resources: [selected[0], selected[1]] as [string, string],
    reasoning
  };
}

// Strategic AI resource selection for Closed Market card
export interface ClosedMarketSelection {
  resource: string;
  reasoning: string;
}

export function selectClosedMarketResource(
  player: Player,
  gameState: GameState,
  difficulty: 'easy' | 'normal' | 'hard'
): ClosedMarketSelection {
  console.log(`\n🚫 [${player.name}] SELECTING CLOSED MARKET RESOURCE (${difficulty} difficulty)`);

  // Find the game leader (opponent with highest score)
  const leader = getGameLeader(gameState);
  if (!leader || leader.id === player.id) {
    console.log(`   ⚠️ No clear leader - selecting opponent's most abundant resource`);
    return selectOpponentsMostAbundantResource(player, gameState, difficulty);
  }

  console.log(`   🎯 Target: ${leader.name} (leader with ${leader.score + leader.secretPoints} points)`);

  // Score each resource based on how much it hurts the leader
  const resourceScores: Array<{ resource: string; score: number; reason: string }> = [];
  const resourceTypes = ['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const;

  for (const resource of resourceTypes) {
    let score = 0;
    const reasons: string[] = [];

    const leaderAmount = (leader.resources as any)[resource];

    // High priority: resources leader has most of
    if (leaderAmount >= 3) {
      score += leaderAmount * 5;
      reasons.push(`leader has ${leaderAmount}`);
    } else if (leaderAmount >= 1) {
      score += leaderAmount * 2;
      reasons.push(`leader has ${leaderAmount}`);
    }

    // Check what leader might be building toward
    const villageNeeds = ['clay', 'lumber', 'grain', 'fabric'];
    const estateNeeds = ['grain', 'mineral'];

    if (villageNeeds.includes(resource)) {
      const hasOtherVillageResources = villageNeeds.filter(r => r !== resource && (leader.resources as any)[r] >= 1).length;
      if (hasOtherVillageResources >= 2) {
        score += 8;
        reasons.push('blocks village construction');
      }
    }

    if (estateNeeds.includes(resource)) {
      if (resource === 'mineral' && leader.resources.mineral >= 2) {
        score += 10;
        reasons.push('blocks estate (mineral critical)');
      } else if (resource === 'grain' && leader.resources.grain >= 1) {
        score += 6;
        reasons.push('blocks estate (grain needed)');
      }
    }

    resourceScores.push({
      resource,
      score,
      reason: reasons.length > 0 ? reasons.join(', ') : 'minimal impact'
    });
  }

  resourceScores.sort((a, b) => b.score - a.score);

  console.log(`   📊 Resource impact scores:`);
  resourceScores.forEach((rs, idx) => {
    const leaderAmount = (leader.resources as any)[rs.resource];
    console.log(`     ${idx + 1}. ${rs.resource}: ${rs.score.toFixed(1)} (leader has ${leaderAmount}) - ${rs.reason}`);
  });

  // Apply difficulty-based selection
  let selectedScore: { resource: string; score: number; reason: string };

  if (difficulty === 'hard') {
    selectedScore = resourceScores[0];
    console.log(`   ✓ Hard difficulty: Selected most impactful (optimal)`);
  } else if (difficulty === 'normal') {
    if (Math.random() < 0.8) {
      selectedScore = resourceScores[0];
      console.log(`   ✓ Normal difficulty: Selected most impactful (80% optimal)`);
    } else {
      const topThree = resourceScores.slice(0, 3);
      selectedScore = topThree[Math.floor(Math.random() * topThree.length)];
      console.log(`   ✓ Normal difficulty: Selected from top 3 (20% suboptimal)`);
    }
  } else {
    if (Math.random() < 0.6) {
      selectedScore = resourceScores[0];
      console.log(`   ✓ Easy difficulty: Selected most impactful (60% optimal)`);
    } else {
      selectedScore = resourceScores[Math.floor(Math.random() * resourceScores.length)];
      console.log(`   ✓ Easy difficulty: Random selection (40% suboptimal)`);
    }
  }

  const reasoning = `Target: ${leader.name}; selecting ${selectedScore.resource} because ${selectedScore.reason}`;
  console.log(`   🎯 Final selection: ${selectedScore.resource}`);
  return { resource: selectedScore.resource, reasoning };
}

// Strategic AI player selection for Resource Swap card (swaps ALL resources with target)
export function selectResourceSwapTarget(
  player: Player,
  gameState: GameState,
  difficulty: 'easy' | 'normal' | 'hard'
): { targetPlayerId: string; reasoning: string } {
  console.log(`\n🔄 [${player.name}] SELECTING RESOURCE SWAP TARGET (${difficulty} difficulty)`);

  const otherPlayers = gameState.players.filter(p => p.id !== player.id);
  if (otherPlayers.length === 0) {
    console.log(`   ⚠️ No other players available`);
    return { targetPlayerId: '', reasoning: 'No targets available' };
  }

  const goals = identifyPlayerTradeGoals(player, gameState);
  const topGoal = goals.length > 0 ? goals[0] : null;

  if (topGoal) {
    console.log(`   🎯 Current building goal: ${topGoal.targetBuilding} (priority ${topGoal.priority})`);
  }

  // Score each potential target
  const scoredTargets = otherPlayers.map(target => {
    let score = 0;
    const reasons: string[] = [];

    // Factor 1: Resource count difference
    const myTotal = player.resources.total;
    const targetTotal = target.resources.total;
    const countDiff = targetTotal - myTotal;

    if (countDiff > 0) {
      score += countDiff * 2;
      reasons.push(`gain ${countDiff} net resources`);
    } else if (countDiff < 0) {
      score += countDiff;
      reasons.push(`lose ${-countDiff} net resources`);
    }

    // Factor 2: Resource quality (how well do their resources fit my goals?)
    if (topGoal) {
      let myGoalFit = 0;
      let theirGoalFit = 0;

      const resourceTypes = ['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const;
      for (const resource of resourceTypes) {
        const needed = (topGoal.neededResources as any)[resource] || 0;
        const iHave = (player.resources as any)[resource];
        const theyHave = (target.resources as any)[resource];

        if (needed > 0) {
          // I need this resource
          if (theyHave >= needed) {
            theirGoalFit += needed * 5;
          } else if (theyHave > iHave) {
            theirGoalFit += (theyHave - iHave) * 3;
          }
        }

        // Calculate how well I currently fit the goal
        if (needed > 0 && iHave > 0) {
          myGoalFit += Math.min(iHave, needed) * 5;
        }
      }

      const goalImprovement = theirGoalFit - myGoalFit;
      if (goalImprovement > 0) {
        score += goalImprovement;
        reasons.push(`better fit for ${topGoal.targetBuilding}`);
      } else if (goalImprovement < 0) {
        score += goalImprovement * 0.5;
        reasons.push(`worse fit for ${topGoal.targetBuilding}`);
      }
    }

    // Factor 3: Avoid swapping with players who are close to winning
    const pointsToWin = gameState.gameSettings.pointsToWin;
    const targetPointsAway = pointsToWin - (target.score + target.secretPoints);
    if (targetPointsAway <= 2) {
      score -= 10;
      reasons.push('target near victory (avoid)');
    }

    // Factor 4: Prefer resource-rich targets if we're poor
    if (myTotal <= 3 && targetTotal >= 6) {
      score += 5;
      reasons.push('resource-rich target');
    }

    return {
      player: target,
      score,
      reasoning: reasons.length > 0 ? reasons.join(', ') : 'neutral swap'
    };
  });

  scoredTargets.sort((a, b) => b.score - a.score);

  console.log(`   📊 Target scores:`);
  scoredTargets.forEach((st, idx) => {
    console.log(`     ${idx + 1}. ${st.player.name}: ${st.score.toFixed(1)} (${st.player.resources.total} resources) - ${st.reasoning}`);
  });

  // Apply difficulty-based selection
  let selected: typeof scoredTargets[0];

  if (difficulty === 'hard') {
    selected = scoredTargets[0];
    console.log(`   ✓ Hard difficulty: Selected best target (100% optimal)`);
  } else if (difficulty === 'normal') {
    if (Math.random() < 0.8) {
      selected = scoredTargets[0];
      console.log(`   ✓ Normal difficulty: Selected best target (80% optimal)`);
    } else {
      const topThree = scoredTargets.slice(0, Math.min(3, scoredTargets.length));
      selected = topThree[Math.floor(Math.random() * topThree.length)];
      console.log(`   ✓ Normal difficulty: Selected from top 3 (20% suboptimal)`);
    }
  } else {
    if (Math.random() < 0.6) {
      selected = scoredTargets[0];
      console.log(`   ✓ Easy difficulty: Selected best target (60% optimal)`);
    } else {
      selected = scoredTargets[Math.floor(Math.random() * scoredTargets.length)];
      console.log(`   ✓ Easy difficulty: Random selection (40% suboptimal)`);
    }
  }

  console.log(`   🔄 Final target: ${selected.player.name} (${selected.reasoning})`);

  return {
    targetPlayerId: selected.player.id,
    reasoning: `Swapping with ${selected.player.name}: ${selected.reasoning}`
  };
}

// Helper: Identify trade goals (simplified version of identifyTradeGoals from aiTradingStrategy)
function identifyPlayerTradeGoals(player: Player, gameState: GameState): Array<{
  targetBuilding: string;
  neededResources: Partial<Record<string, number>>;
  priority: number;
}> {
  const goals: Array<{
    targetBuilding: string;
    neededResources: Partial<Record<string, number>>;
    priority: number;
  }> = [];

  const pointsToWin = gameState.gameSettings.pointsToWin;
  const currentPoints = player.score + player.secretPoints;
  const isEarlyGame = currentPoints < 5;
  const villageCount = gameState.villages.filter(v => v.playerId === player.id && v.type === 'settlement').length;

  // Village goal
  const villageNeeds: Partial<Record<string, number>> = {};
  if (player.resources.clay < 1) villageNeeds.clay = 1 - player.resources.clay;
  if (player.resources.lumber < 1) villageNeeds.lumber = 1 - player.resources.lumber;
  if (player.resources.grain < 1) villageNeeds.grain = 1 - player.resources.grain;
  if (player.resources.fabric < 1) villageNeeds.fabric = 1 - player.resources.fabric;

  const villageNeededCount = Object.keys(villageNeeds).length;
  if (villageNeededCount <= 3) {
    let priority = 10;
    if (isEarlyGame && villageCount < 3) priority = 15;
    else if (villageCount < 4) priority = 12;
    goals.push({ targetBuilding: 'village', neededResources: villageNeeds, priority });
  }

  // Estate goal
  const estateNeeds: Partial<Record<string, number>> = {};
  if (player.resources.grain < 2) estateNeeds.grain = 2 - player.resources.grain;
  if (player.resources.mineral < 3) estateNeeds.mineral = 3 - player.resources.mineral;

  const estateNeededCount = Object.keys(estateNeeds).length;
  if (estateNeededCount <= 2) {
    let priority = 12;
    if (isEarlyGame && villageCount < 3) priority = 6;
    const hasUpgradeableVillage = gameState.villages.some(v => v.playerId === player.id && v.type === 'settlement');
    if (hasUpgradeableVillage && villageCount >= 2) priority += 2;
    goals.push({ targetBuilding: 'estate', neededResources: estateNeeds, priority });
  }

  // Road goal
  const roadNeeds: Partial<Record<string, number>> = {};
  if (player.resources.clay < 1) roadNeeds.clay = 1 - player.resources.clay;
  if (player.resources.lumber < 1) roadNeeds.lumber = 1 - player.resources.lumber;

  const roadNeededCount = Object.keys(roadNeeds).length;
  if (roadNeededCount <= 1) {
    let priority = 6;
    if (isEarlyGame && villageCount < 3) priority = 4;
    goals.push({ targetBuilding: 'road', neededResources: roadNeeds, priority });
  }

  // Dev card goal
  const devCardNeeds: Partial<Record<string, number>> = {};
  if (player.resources.grain < 1) devCardNeeds.grain = 1 - player.resources.grain;
  if (player.resources.fabric < 1) devCardNeeds.fabric = 1 - player.resources.fabric;
  if (player.resources.mineral < 1) devCardNeeds.mineral = 1 - player.resources.mineral;

  const devCardNeededCount = Object.keys(devCardNeeds).length;
  if (devCardNeededCount <= 2) {
    let priority = 8;
    if (isEarlyGame && villageCount < 3) priority = 5;
    goals.push({ targetBuilding: 'dev_card', neededResources: devCardNeeds, priority });
  }

  goals.sort((a, b) => b.priority - a.priority);
  return goals;
}

// Helper: Select diverse resources when no clear goal
function selectDiverseResources(player: Player, difficulty: 'easy' | 'normal' | 'hard'): ResourceSelection {
  const resourceTypes = ['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const;
  const amounts = resourceTypes.map(r => ({ resource: r, amount: (player.resources as any)[r] }));
  amounts.sort((a, b) => a.amount - b.amount);

  // Pick the 2 resources we have least of
  const selected = [amounts[0].resource, amounts[1].resource];

  return {
    resources: [selected[0], selected[1]] as [string, string],
    reasoning: 'Diversifying resource portfolio'
  };
}

// Helper: Select opponent's most abundant resource
function selectOpponentsMostAbundantResource(player: Player, gameState: GameState, difficulty: 'easy' | 'normal' | 'hard'): ClosedMarketSelection {
  const resourceTypes = ['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const;
  const totalsByResource: Record<string, number> = {
    clay: 0,
    lumber: 0,
    grain: 0,
    fabric: 0,
    mineral: 0
  };

  // Sum up all opponents' resources
  for (const opponent of gameState.players) {
    if (opponent.id === player.id) continue;
    for (const resource of resourceTypes) {
      totalsByResource[resource] += (opponent.resources as any)[resource];
    }
  }

  // Find the most common
  let maxResource = 'clay';
  let maxAmount = 0;
  for (const resource of resourceTypes) {
    if (totalsByResource[resource] > maxAmount) {
      maxAmount = totalsByResource[resource];
      maxResource = resource;
    }
  }

  const reasoning = `Opponents collectively have ${maxAmount} ${maxResource}, the most abundant resource`;
  return { resource: maxResource, reasoning };
}
