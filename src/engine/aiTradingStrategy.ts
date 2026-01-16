import { GameState, Player, Resources, TradingPort } from '../types/game';
import { ResourceType, getBestTradeRateForResource } from '../utils/tradingUtils';
import { canAffordVillage, canAffordEstate, canAffordRoad, canAffordDevelopmentCard } from './aiBuilding';

export interface TradeGoal {
  targetBuilding: 'village' | 'estate' | 'road' | 'dev_card';
  neededResources: Partial<Resources>;
  priority: number;
}

export interface TradeEvaluation {
  shouldTrade: boolean;
  tradeType: 'bank' | 'player';
  offering?: ResourceType;
  offeringAmount?: number;
  requesting?: ResourceType;
  requestingAmount?: number;
  reasoning?: string;
  fairness?: number;
  score?: number;
}

export interface RankedTrade {
  offering: ResourceType;
  offeringAmount: number;
  requesting: ResourceType;
  requestingAmount: number;
  fairness: number;
  score: number;
  reasoning: string;
}

export function evaluateTradeOpportunity(
  player: Player,
  gameState: GameState
): TradeEvaluation {
  console.log(`\n💱 [${player.name}] EVALUATING TRADE OPPORTUNITIES`);

  const goals = identifyTradeGoals(player, gameState);

  if (goals.length === 0) {
    console.log(`   ✗ No trade goals identified`);
    return { shouldTrade: false, tradeType: 'bank', reasoning: 'No immediate building goals' };
  }

  console.log(`   📊 Identified ${goals.length} possible trade goals:`);
  goals.forEach((goal, idx) => {
    const neededList = Object.entries(goal.neededResources).map(([r, amt]) => `${amt} ${r}`).join(', ');
    const neededCount = Object.keys(goal.neededResources).length;
    if (neededCount === 0) {
      console.log(`   ${idx + 1}. ${goal.targetBuilding} (priority ${goal.priority}) - Can afford now, considering post-build trades`);
    } else {
      console.log(`   ${idx + 1}. ${goal.targetBuilding} (priority ${goal.priority}) - Needs: ${neededList}`);
    }
  });

  const topGoal = goals[0];
  console.log(`   🎯 Prioritizing: ${topGoal.targetBuilding} (priority ${topGoal.priority})`);

  const bestPlayerTrade = findBestPlayerTrade(player, gameState, topGoal);
  if (bestPlayerTrade) {
    console.log(`   ✓ Found P2P trade opportunity: ${bestPlayerTrade.offeringAmount}x ${bestPlayerTrade.offering} → ${bestPlayerTrade.requesting}`);
    console.log(`   Reason: ${bestPlayerTrade.reasoning}`);
    return bestPlayerTrade;
  } else {
    console.log(`   ✗ No viable player trades found`);
  }

  const bestBankTrade = findBestBankTrade(player, gameState, topGoal);
  if (bestBankTrade) {
    console.log(`   ✓ Found bank trade: ${bestBankTrade.offeringAmount}x ${bestBankTrade.offering} → ${bestBankTrade.requesting}`);
    console.log(`   Reason: ${bestBankTrade.reasoning}`);
    return bestBankTrade;
  } else {
    console.log(`   ✗ No viable bank trades found`);
  }

  console.log(`   ✗ No beneficial trades available`);
  return { shouldTrade: false, tradeType: 'bank', reasoning: 'No beneficial trades available' };
}

export function identifyTradeGoals(player: Player, gameState: GameState): TradeGoal[] {
  const goals: TradeGoal[] = [];

  const pointsToWin = gameState.gameSettings.pointsToWin;
  const currentPoints = player.score + player.secretPoints;
  const isEarlyGame = currentPoints < 5;
  const villageCount = gameState.villages.filter(v => v.playerId === player.id && v.type === 'settlement').length;

  const totalResources = player.resources.clay + player.resources.lumber +
                         player.resources.grain + player.resources.fabric + player.resources.mineral;

  const villageNeeds = calculateResourceNeeds(player.resources, {
    clay: 1,
    lumber: 1,
    grain: 1,
    fabric: 1,
    mineral: 0,
    total: 4
  });

  const neededCount = Object.keys(villageNeeds).length;
  const maxNeededForVillage = isEarlyGame || villageCount < 3 ? 3 : 2;

  if (neededCount >= 0 && neededCount <= maxNeededForVillage && (neededCount > 0 || totalResources >= 5)) {
    let villagePriority = 10;
    if (isEarlyGame && villageCount < 3) {
      villagePriority = 15;
    } else if (villageCount < 4) {
      villagePriority = 12;
    }
    goals.push({
      targetBuilding: 'village',
      neededResources: villageNeeds,
      priority: villagePriority
    });
  }

  const estateNeeds = calculateResourceNeeds(player.resources, {
    clay: 0,
    lumber: 0,
    grain: 2,
    fabric: 0,
    mineral: 3,
    total: 5
  });

  const estateNeededCount = Object.keys(estateNeeds).length;
  if (estateNeededCount >= 0 && estateNeededCount <= 2 && (estateNeededCount > 0 || totalResources >= 6)) {
    let estatePriority = 12;
    if (isEarlyGame && villageCount < 3) {
      estatePriority = 6;
    }

    const hasUpgradeableVillage = gameState.villages.some(v =>
      v.playerId === player.id && v.type === 'settlement'
    );
    if (hasUpgradeableVillage && villageCount >= 2) {
      estatePriority += 2;
    }

    goals.push({
      targetBuilding: 'estate',
      neededResources: estateNeeds,
      priority: estatePriority
    });
  }

  const roadNeeds = calculateResourceNeeds(player.resources, {
    clay: 1,
    lumber: 1,
    grain: 0,
    fabric: 0,
    mineral: 0,
    total: 2
  });

  const roadNeededCount = Object.keys(roadNeeds).length;
  if (roadNeededCount >= 0 && roadNeededCount <= 1 && (roadNeededCount > 0 || totalResources >= 3)) {
    let roadPriority = 6;
    if (isEarlyGame && villageCount < 3) {
      roadPriority = 4;
    }
    goals.push({
      targetBuilding: 'road',
      neededResources: roadNeeds,
      priority: roadPriority
    });
  }

  const devCardNeeds = calculateResourceNeeds(player.resources, {
    clay: 0,
    lumber: 0,
    grain: 1,
    fabric: 1,
    mineral: 1,
    total: 3
  });

  const devCardNeededCount = Object.keys(devCardNeeds).length;
  if (devCardNeededCount >= 0 && devCardNeededCount <= 2 && (devCardNeededCount > 0 || totalResources >= 4)) {
    let devCardPriority = 8;
    if (isEarlyGame && villageCount < 3) {
      devCardPriority = 5;
    }
    goals.push({
      targetBuilding: 'dev_card',
      neededResources: devCardNeeds,
      priority: devCardPriority
    });
  }

  goals.sort((a, b) => b.priority - a.priority);
  return goals;
}

function calculateResourceNeeds(
  current: Resources,
  required: Resources
): Partial<Resources> {
  const needs: Partial<Resources> = {};

  (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as ResourceType[]).forEach(resource => {
    const deficit = required[resource] - current[resource];
    if (deficit > 0) {
      needs[resource] = deficit;
    }
  });

  return needs;
}

function findBestPlayerTrade(
  player: Player,
  gameState: GameState,
  goal: TradeGoal
): TradeEvaluation | null {
  const neededResources = Object.keys(goal.neededResources) as ResourceType[];
  const surplus = getSurplusResources(player.resources, goal);

  console.log(`   💰 Surplus resources available for trading: ${surplus.length > 0 ? surplus.join(', ') : 'None'}`);

  if (surplus.length === 0 || neededResources.length === 0) {
    if (surplus.length === 0) {
      console.log(`   ⚠️ No surplus resources to offer in player trade`);
    }
    if (neededResources.length === 0) {
      console.log(`   ⚠️ No resources needed for goal (can already afford)`);
    }
    return null;
  }

  const difficulty = player.difficulty || 'normal';
  const personality = player.character?.personality || 'balanced';

  const possibleTrades: Array<{
    offering: ResourceType;
    offeringAmount: number;
    requesting: ResourceType;
    requestingAmount: number;
    fairness: number;
  }> = [];

  for (const surplusResource of surplus) {
    for (const neededResource of neededResources) {
      // Skip if trying to trade the same resource for itself
      if (surplusResource === neededResource) {
        continue;
      }

      const availableAmount = player.resources[surplusResource];
      const neededAmount = goal.neededResources[neededResource] || 1;

      if (availableAmount >= 1) {
        possibleTrades.push({
          offering: surplusResource,
          offeringAmount: 1,
          requesting: neededResource,
          requestingAmount: 1,
          fairness: 1.0
        });
      }

      if (availableAmount >= 2) {
        possibleTrades.push({
          offering: surplusResource,
          offeringAmount: 2,
          requesting: neededResource,
          requestingAmount: 1,
          fairness: 0.5
        });
      }

      if (availableAmount >= 2 && neededAmount >= 2) {
        possibleTrades.push({
          offering: surplusResource,
          offeringAmount: 2,
          requesting: neededResource,
          requestingAmount: 2,
          fairness: 1.0
        });
      }

      if (availableAmount >= 3) {
        possibleTrades.push({
          offering: surplusResource,
          offeringAmount: 3,
          requesting: neededResource,
          requestingAmount: 1,
          fairness: 0.33
        });
      }

      if (availableAmount >= 3 && neededAmount >= 2) {
        possibleTrades.push({
          offering: surplusResource,
          offeringAmount: 3,
          requesting: neededResource,
          requestingAmount: 2,
          fairness: 0.67
        });
      }

      if (availableAmount >= 1 && neededAmount >= 2) {
        possibleTrades.push({
          offering: surplusResource,
          offeringAmount: 1,
          requesting: neededResource,
          requestingAmount: 2,
          fairness: 2.0
        });
      }
    }
  }

  if (possibleTrades.length === 0) {
    return null;
  }

  const scoredTrades = possibleTrades.map(trade => {
    let score = 0;

    const totalPriority = goal.priority;
    const resourceScarcity = 1.0 / (player.resources[trade.offering] + 1);

    if (difficulty === 'easy') {
      if (trade.fairness >= 0.8 && trade.fairness <= 1.2) {
        score += 10;
      } else if (trade.fairness >= 0.6) {
        score += 5;
      }
    } else if (difficulty === 'normal') {
      if (trade.fairness >= 0.7) {
        score += 8;
      } else if (trade.fairness >= 0.4) {
        score += 5;
      }
    } else {
      if (trade.fairness >= 0.5) {
        score += 6;
      } else if (trade.fairness >= 0.3) {
        score += 8;
      }
    }

    if (personality === 'aggressive') {
      score += (1.0 - trade.fairness) * 5;
    } else if (personality === 'defensive') {
      if (trade.fairness >= 0.8) {
        score += 3;
      }
    } else if (personality === 'balanced') {
      if (trade.fairness >= 0.5 && trade.fairness <= 1.0) {
        score += 4;
      }
    } else if (personality === 'economic') {
      if (trade.fairness >= 1.0) {
        score += 5;
      }
    }

    score += totalPriority * 0.3;
    score -= resourceScarcity * 2;

    if (trade.offeringAmount === 1 && trade.requestingAmount === 1) {
      score += 2;
    }

    return { ...trade, score };
  });

  scoredTrades.sort((a, b) => b.score - a.score);

  const bestTrade = scoredTrades[0];

  if (bestTrade.score > 0) {
    return {
      shouldTrade: true,
      tradeType: 'player',
      offering: bestTrade.offering,
      offeringAmount: bestTrade.offeringAmount,
      requesting: bestTrade.requesting,
      reasoning: `P2P trade: ${bestTrade.offeringAmount} ${bestTrade.offering} for ${bestTrade.requestingAmount} ${bestTrade.requesting} to build ${goal.targetBuilding}`,
      fairness: bestTrade.fairness,
      score: bestTrade.score
    };
  }

  return null;
}

export function getAllRankedPlayerTrades(
  player: Player,
  gameState: GameState,
  goal: TradeGoal
): RankedTrade[] {
  const neededResources = Object.keys(goal.neededResources) as ResourceType[];
  const surplus = getSurplusResources(player.resources, goal);

  if (surplus.length === 0 || neededResources.length === 0) {
    return [];
  }

  const difficulty = player.difficulty || 'normal';
  const personality = player.character?.personality || 'balanced';

  const possibleTrades: Array<{
    offering: ResourceType;
    offeringAmount: number;
    requesting: ResourceType;
    requestingAmount: number;
    fairness: number;
  }> = [];

  for (const surplusResource of surplus) {
    for (const neededResource of neededResources) {
      // Skip if trying to trade the same resource for itself
      if (surplusResource === neededResource) {
        continue;
      }

      const availableAmount = player.resources[surplusResource];
      const neededAmount = goal.neededResources[neededResource] || 1;

      if (availableAmount >= 1) {
        possibleTrades.push({
          offering: surplusResource,
          offeringAmount: 1,
          requesting: neededResource,
          requestingAmount: 1,
          fairness: 1.0
        });
      }

      if (availableAmount >= 2) {
        possibleTrades.push({
          offering: surplusResource,
          offeringAmount: 2,
          requesting: neededResource,
          requestingAmount: 1,
          fairness: 0.5
        });
      }

      if (availableAmount >= 2 && neededAmount >= 2) {
        possibleTrades.push({
          offering: surplusResource,
          offeringAmount: 2,
          requesting: neededResource,
          requestingAmount: 2,
          fairness: 1.0
        });
      }

      if (availableAmount >= 3) {
        possibleTrades.push({
          offering: surplusResource,
          offeringAmount: 3,
          requesting: neededResource,
          requestingAmount: 1,
          fairness: 0.33
        });
      }

      if (availableAmount >= 3 && neededAmount >= 2) {
        possibleTrades.push({
          offering: surplusResource,
          offeringAmount: 3,
          requesting: neededResource,
          requestingAmount: 2,
          fairness: 0.67
        });
      }

      if (availableAmount >= 1 && neededAmount >= 2) {
        possibleTrades.push({
          offering: surplusResource,
          offeringAmount: 1,
          requesting: neededResource,
          requestingAmount: 2,
          fairness: 2.0
        });
      }
    }
  }

  const scoredTrades = possibleTrades.map(trade => {
    let score = 0;

    const totalPriority = goal.priority;
    const resourceScarcity = 1.0 / (player.resources[trade.offering] + 1);

    if (difficulty === 'easy') {
      if (trade.fairness >= 0.8 && trade.fairness <= 1.2) {
        score += 10;
      } else if (trade.fairness >= 0.6) {
        score += 5;
      }
    } else if (difficulty === 'normal') {
      if (trade.fairness >= 0.7) {
        score += 8;
      } else if (trade.fairness >= 0.4) {
        score += 5;
      }
    } else {
      if (trade.fairness >= 0.5) {
        score += 6;
      } else if (trade.fairness >= 0.3) {
        score += 8;
      }
    }

    if (personality === 'aggressive') {
      score += (1.0 - trade.fairness) * 5;
    } else if (personality === 'defensive') {
      if (trade.fairness >= 0.8) {
        score += 3;
      }
    } else if (personality === 'balanced') {
      if (trade.fairness >= 0.5 && trade.fairness <= 1.0) {
        score += 4;
      }
    } else if (personality === 'economic') {
      if (trade.fairness >= 1.0) {
        score += 5;
      }
    }

    score += totalPriority * 0.3;
    score -= resourceScarcity * 2;

    if (trade.offeringAmount === 1 && trade.requestingAmount === 1) {
      score += 2;
    }

    return {
      ...trade,
      score,
      reasoning: `P2P trade: ${trade.offeringAmount} ${trade.offering} for ${trade.requestingAmount} ${trade.requesting} to build ${goal.targetBuilding} (fairness: ${trade.fairness.toFixed(2)}, score: ${score.toFixed(1)})`
    };
  });

  scoredTrades.sort((a, b) => b.score - a.score);

  const minFairnessThreshold = 0.25;
  return scoredTrades.filter(trade => trade.score > 0 && trade.fairness >= minFairnessThreshold);
}

function findBestBankTrade(
  player: Player,
  gameState: GameState,
  goal: TradeGoal
): TradeEvaluation | null {
  const neededResources = Object.keys(goal.neededResources) as ResourceType[];
  const surplus = getSurplusResources(player.resources, goal);

  if (surplus.length === 0 || neededResources.length === 0) {
    return null;
  }

  let bestTrade: TradeEvaluation | null = null;
  let bestTradeEfficiency = Infinity;

  console.log(`   🏦 Evaluating bank trade options...`);

  for (const surplusResource of surplus) {
    const tradeRate = getBestTradeRateForResource(player.id, surplusResource, gameState);

    console.log(`      ${surplusResource}: Have ${player.resources[surplusResource]}, Rate ${tradeRate.rate}:1 ${tradeRate.portType ? `(${tradeRate.portType} port)` : '(4:1 bank)'}`);

    if (player.resources[surplusResource] >= tradeRate.rate) {
      for (const neededResource of neededResources) {
        const efficiency = tradeRate.rate;

        if (efficiency < bestTradeEfficiency) {
          bestTradeEfficiency = efficiency;
          bestTrade = {
            shouldTrade: true,
            tradeType: 'bank',
            offering: surplusResource,
            offeringAmount: tradeRate.rate,
            requesting: neededResource,
            reasoning: `Trading ${tradeRate.rate} ${surplusResource} for ${neededResource} to build ${goal.targetBuilding}`
          };
        }
      }
    } else {
      console.log(`         ✗ Not enough (need ${tradeRate.rate})`);
    }
  }

  return bestTrade;
}

function getSurplusResources(resources: Resources, goal?: TradeGoal): ResourceType[] {
  const surplus: ResourceType[] = [];

  const nearVillage = resources.clay >= 1 && resources.lumber >= 1 &&
                       resources.grain >= 1 && resources.fabric >= 1;
  const nearEstate = resources.grain >= 2 && resources.mineral >= 3;

  const totalResources = resources.clay + resources.lumber + resources.grain +
                        resources.fabric + resources.mineral;
  const hasMany = totalResources >= 8;

  (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as ResourceType[]).forEach(resource => {
    let keepThreshold = 1;

    if (nearVillage) {
      if (resource === 'clay' || resource === 'lumber' || resource === 'grain' || resource === 'fabric') {
        keepThreshold = 1;
      }
    }

    if (nearEstate) {
      if (resource === 'grain') {
        keepThreshold = 2;
      } else if (resource === 'mineral') {
        keepThreshold = 3;
      }
    }

    if (goal) {
      const isNeededForGoal = goal.neededResources[resource] && goal.neededResources[resource]! > 0;
      if (isNeededForGoal) {
        keepThreshold = 0;
      }
    }

    if (hasMany && resources[resource] > 0) {
      surplus.push(resource);
    } else if (resources[resource] > keepThreshold) {
      surplus.push(resource);
    }
  });

  if (goal && surplus.length === 0 && totalResources >= 4) {
    (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as ResourceType[]).forEach(resource => {
      const isNeeded = goal.neededResources[resource] && goal.neededResources[resource]! > 0;
      if (!isNeeded && resources[resource] >= 1) {
        surplus.push(resource);
      }
    });
  }

  return surplus;
}

function getGameLeader(gameState: GameState): Player | null {
  let leader: Player | null = null;
  let maxScore = -1;

  for (const p of gameState.players) {
    const totalScore = p.score + p.secretPoints;
    if (totalScore > maxScore) {
      maxScore = totalScore;
      leader = p;
    }
  }

  return leader;
}

export function evaluatePlayerTradeProposal(
  proposal: {
    offeredResources: Resources;
    requestedResources: Resources;
    fromPlayerId?: string;
  },
  player: Player,
  gameState: GameState
): boolean {
  if (proposal.fromPlayerId) {
    const proposingPlayer = gameState.players.find(p => p.id === proposal.fromPlayerId);
    if (proposingPlayer) {
      const pointsToWin = gameState.gameSettings.pointsToWin;
      const proposerPointsAway = pointsToWin - (proposingPlayer.score + proposingPlayer.secretPoints);

      if (proposerPointsAway <= 3) {
        console.log(`   ✗ Rejecting trade from ${proposingPlayer.name} - they're ${proposerPointsAway} points from winning`);
        return false;
      }

      if (proposerPointsAway <= 5 && isTradeEnablingWin(proposal.requestedResources, proposingPlayer)) {
        console.log(`   ✗ Rejecting trade from ${proposingPlayer.name} - resources may enable immediate win`);
        return false;
      }

      const gameLeader = getGameLeader(gameState);
      if (gameLeader && gameLeader.id === proposingPlayer.id) {
        const netGain = calculateTradeValue(proposal.offeredResources, proposal.requestedResources, player, gameState);
        const isVeryHelpful = netGain >= 3.0;

        if (!isVeryHelpful) {
          const difficulty = player.difficulty || 'normal';
          let rejectChance = 1.0;

          if (difficulty === 'easy') {
            rejectChance = 0.6;
          } else if (difficulty === 'normal') {
            rejectChance = 0.8;
          } else if (difficulty === 'hard') {
            rejectChance = 1.0;
          }

          if (Math.random() < rejectChance) {
            console.log(`   ✗ Rejecting trade from game leader ${proposingPlayer.name} (${difficulty} difficulty: ${(rejectChance * 100).toFixed(0)}% reject chance, not VERY helpful)`);
            return false;
          } else {
            console.log(`   ✓ Accepting trade from game leader ${proposingPlayer.name} despite policy (${difficulty} difficulty: rolled within ${(1 - rejectChance) * 100}% acceptance window)`);
          }
        } else {
          console.log(`   ✓ Accepting VERY helpful trade from game leader ${proposingPlayer.name} (value: ${netGain.toFixed(1)})`);
        }
      }
    }
  }

  const netGain = calculateTradeValue(proposal.offeredResources, proposal.requestedResources, player, gameState);

  if (netGain > 0) {
    const canAfford = canAffordProposal(proposal.offeredResources, player.resources);
    return canAfford;
  }

  return false;
}

function isTradeEnablingWin(requestedResources: Resources, proposingPlayer: Player): boolean {
  const afterTrade: Resources = {
    clay: proposingPlayer.resources.clay + requestedResources.clay,
    lumber: proposingPlayer.resources.lumber + requestedResources.lumber,
    grain: proposingPlayer.resources.grain + requestedResources.grain,
    fabric: proposingPlayer.resources.fabric + requestedResources.fabric,
    mineral: proposingPlayer.resources.mineral + requestedResources.mineral,
    total: 0
  };
  afterTrade.total = afterTrade.clay + afterTrade.lumber + afterTrade.grain + afterTrade.fabric + afterTrade.mineral;

  const canBuildVillage = afterTrade.clay >= 1 && afterTrade.lumber >= 1 &&
                           afterTrade.grain >= 1 && afterTrade.fabric >= 1;
  const canBuildEstate = afterTrade.grain >= 2 && afterTrade.mineral >= 3;

  return canBuildVillage || canBuildEstate;
}

function calculateTradeValue(
  offered: Resources,
  requested: Resources,
  player: Player,
  gameState: GameState
): number {
  let value = 0;

  (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as ResourceType[]).forEach(resource => {
    const offeredAmount = offered[resource] || 0;
    const requestedAmount = requested[resource] || 0;

    const resourceValue = getResourceValueForPlayer(resource, player, gameState);

    value += (requestedAmount * resourceValue) - (offeredAmount * resourceValue);
  });

  return value;
}

function getResourceValueForPlayer(
  resource: ResourceType,
  player: Player,
  gameState: GameState
): number {
  const baseValue = 1.0;

  const currentAmount = player.resources[resource];

  if (currentAmount === 0) {
    return baseValue * 2.0;
  } else if (currentAmount === 1) {
    return baseValue * 1.5;
  } else if (currentAmount >= 5) {
    return baseValue * 0.5;
  }

  return baseValue;
}

function canAffordProposal(offered: Resources, current: Resources): boolean {
  return (
    current.clay >= offered.clay &&
    current.lumber >= offered.lumber &&
    current.grain >= offered.grain &&
    current.fabric >= offered.fabric &&
    current.mineral >= offered.mineral
  );
}

export function shouldInitiatePlayerTrade(
  player: Player,
  gameState: GameState,
  attemptsThisTurn: number
): boolean {
  if (attemptsThisTurn >= 3) {
    return false;
  }

  const goals = identifyTradeGoals(player, gameState);
  if (goals.length === 0) {
    console.log(`   ✗ No trade goals, won't initiate trade`);
    return false;
  }

  const surplus = getSurplusResources(player.resources);
  if (surplus.length === 0) {
    console.log(`   ✗ No surplus resources, won't initiate trade`);
    return false;
  }

  const difficulty = player.difficulty || 'normal';
  let tradeChance = 0.8;

  if (difficulty === 'easy') {
    tradeChance = 0.6;
  } else if (difficulty === 'normal') {
    tradeChance = 0.8;
  } else if (difficulty === 'hard') {
    tradeChance = 1.0;
  }

  const willTrade = Math.random() < tradeChance;
  console.log(`   ${willTrade ? '✓' : '✗'} Trade chance for ${difficulty}: ${(tradeChance * 100).toFixed(0)}% (rolled ${willTrade ? 'yes' : 'no'})`);

  return willTrade;
}
