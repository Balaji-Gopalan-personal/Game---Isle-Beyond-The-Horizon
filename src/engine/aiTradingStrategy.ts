import { GameState, Player, Resources, TradingPort, BoardSize } from '../types/game';
import { ResourceType, getBestTradeRateForResource } from '../utils/tradingUtils';
import { canAffordVillage, canAffordEstate, canAffordRoad, canAffordDevelopmentCard } from './aiBuilding';
import { getValidVillagePlacements, getValidRoadPlacements, getPlayerVillages } from './gameplayActions';

export interface TradeGoal {
  targetBuilding: 'village' | 'estate' | 'road' | 'dev_card';
  neededResources: Partial<Resources>;
  priority: number;
  hasViablePlacement?: boolean;
  achievableThisTurn?: boolean;
  tradeSequenceSteps?: number;
}

export interface TurnTradeHistory {
  tradesExecuted: Array<{
    offering: ResourceType;
    offeringAmount: number;
    requesting: ResourceType;
    requestingAmount: number;
  }>;
  targetGoal?: TradeGoal;
  resourcesGained: Partial<Record<ResourceType, number>>;
  resourcesLost: Partial<Record<ResourceType, number>>;
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
  targetBuilding?: 'village' | 'estate' | 'road' | 'dev_card';  // Added for committed goal tracking
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
  gameState: GameState,
  boardSize: BoardSize,
  tradeHistory?: TurnTradeHistory
): TradeEvaluation {
  console.log(`\n💱 [${player.name}] EVALUATING TRADE OPPORTUNITIES`);

  // Check if Expert Negotiator is active - if so, prioritize bank trades heavily
  const expertNegotiatorActive = gameState.turnState.expertNegotiatorActive;
  if (expertNegotiatorActive) {
    console.log(`   ⭐ Expert Negotiator is active - prioritizing 2:1 bank trades!`);
  }

  // Calculate "frustration meter" based on failed P2P attempts this turn
  const failedProposals = gameState.turnState.aiFailedTradeProposalsThisTurn || new Set<string>();
  const failedAttempts = failedProposals.size;
  const frustrationLevel = Math.min(failedAttempts, 3); // Cap at 3 for scoring purposes

  if (failedAttempts > 0) {
    console.log(`   📉 Failed P2P attempts this turn: ${failedAttempts} (frustration level: ${frustrationLevel})`);
  }

  // If we have a trade history, validate we should continue trading
  if (tradeHistory && tradeHistory.tradesExecuted.length > 0) {
    console.log(`   📊 Analyzing ${tradeHistory.tradesExecuted.length} previous trades this turn`);

    // Check if we're cycling resources (trading away what we just got)
    if (isResourceCycling(tradeHistory)) {
      console.log(`   ✗ Detected resource cycling - stopping trades to prevent waste`);
      return { shouldTrade: false, tradeType: 'bank', reasoning: 'Preventing resource cycling' };
    }

    // Limit total trades per turn (unless close to winning)
    const pointsAway = gameState.gameSettings.pointsToWin - (player.score + player.secretPoints);
    const maxTrades = expertNegotiatorActive ? 4 : (pointsAway <= 2 ? 5 : 3);
    if (tradeHistory.tradesExecuted.length >= maxTrades) {
      console.log(`   ✗ Max trades reached (${maxTrades}) for this turn`);
      return { shouldTrade: false, tradeType: 'bank', reasoning: 'Max trades per turn reached' };
    }
  }

  const goals = identifyTradeGoals(player, gameState, boardSize);

  // Filter goals: must have viable placement AND be achievable this turn (if requiring trades)
  const viableGoals = goals.filter(g => {
    if (g.hasViablePlacement === false) return false;

    // If already can afford (no needs), always include
    if (Object.keys(g.neededResources).length === 0) return true;

    // If needs trades, must be marked as achievable
    return g.achievableThisTurn !== false;
  });

  // Separate into achievable and unachievable for better logging
  const achievableGoals = goals.filter(g =>
    g.hasViablePlacement !== false && g.achievableThisTurn !== false
  );
  const unachievableGoals = goals.filter(g =>
    g.hasViablePlacement !== false && g.achievableThisTurn === false
  );

  if (viableGoals.length === 0) {
    console.log(`   ✗ No viable trade goals (all buildings have no valid placement locations or are unachievable this turn)`);
    if (unachievableGoals.length > 0) {
      console.log(`   ℹ️ ${unachievableGoals.length} goals exist but are not achievable this turn`);
      unachievableGoals.forEach(g => {
        console.log(`      - ${g.targetBuilding}: needs ${Object.entries(g.neededResources).map(([r, amt]) => `${amt} ${r}`).join(', ')}`);
      });
    }
    return { shouldTrade: false, tradeType: 'bank', reasoning: 'No viable building placements available' };
  }

  // Determine the active goal with priority order:
  // 1. Committed goal from turnState (highest priority - locked in from previous successful trade)
  // 2. Target goal from trade history (locked in from current trading session)
  // 3. Top viable goal from fresh evaluation
  let activeGoal = tradeHistory?.targetGoal;

  // Check if there's a committed building goal from a previous successful trade
  const committedGoal = gameState.turnState.committedBuildingGoal;
  if (committedGoal) {
    const committedGoalData = viableGoals.find(g => g.targetBuilding === committedGoal);
    if (committedGoalData) {
      activeGoal = committedGoalData;
      console.log(`   🔒 Using committed goal from successful trade: ${committedGoal}`);
    } else {
      console.log(`   ⚠️ Committed goal (${committedGoal}) no longer viable - clearing commitment`);
    }
  }

  // Fall back to history goal or top viable goal
  if (!activeGoal || !viableGoals.find(g => g.targetBuilding === activeGoal!.targetBuilding)) {
    if (activeGoal) {
      console.log(`   ⚠️ Previous goal (${activeGoal.targetBuilding}) no longer viable - selecting new goal`);
    }
    activeGoal = viableGoals[0];
  }

  console.log(`   📊 Identified ${goals.length} possible trade goals (${achievableGoals.length} achievable, ${viableGoals.length} viable):`);
  goals.forEach((goal, idx) => {
    const neededList = Object.entries(goal.neededResources).map(([r, amt]) => `${amt} ${r}`).join(', ');
    const neededCount = Object.keys(goal.neededResources).length;
    const viableMarker = goal.hasViablePlacement === false ? ' ⚠️ NO VIABLE PLACEMENT' : '';
    const achievableMarker = goal.achievableThisTurn === false ? ' ⚠️ NOT ACHIEVABLE THIS TURN' : goal.achievableThisTurn === true ? ' ✓ ACHIEVABLE' : '';
    const stepsInfo = goal.tradeSequenceSteps !== undefined ? ` (${goal.tradeSequenceSteps} steps)` : '';

    if (neededCount === 0) {
      console.log(`   ${idx + 1}. ${goal.targetBuilding} (priority ${goal.priority}) - Can afford now${achievableMarker}${viableMarker}`);
    } else {
      console.log(`   ${idx + 1}. ${goal.targetBuilding} (priority ${goal.priority}) - Needs: ${neededList}${stepsInfo}${achievableMarker}${viableMarker}`);
    }
  });

  if (tradeHistory?.targetGoal) {
    console.log(`   🔒 Locked to goal from previous trade: ${activeGoal.targetBuilding} (priority ${activeGoal.priority})`);
  } else {
    console.log(`   🎯 Prioritizing: ${activeGoal.targetBuilding} (priority ${activeGoal.priority})`);
  }

  // Determine if we should prefer bank trades based on multiple factors
  const totalResources = player.resources.total;
  const hasAbundantResources = totalResources >= 7;
  const pointsAway = gameState.gameSettings.pointsToWin - (player.score + player.secretPoints);
  const isCloseToWinning = pointsAway <= 2;
  const difficulty = player.difficulty || 'normal';

  // Check if player has favorable trading ports
  const hasFavorablePort = checkForFavorablePorts(player, gameState);

  // Decision: should we prefer bank trades?
  const preferBankTrades = expertNegotiatorActive ||
                           (failedAttempts >= 2) ||
                           (hasAbundantResources && hasFavorablePort) ||
                           (isCloseToWinning && hasAbundantResources) ||
                           (difficulty === 'hard' && failedAttempts >= 1);

  if (preferBankTrades) {
    console.log(`   🏦 PREFERRING BANK TRADES due to:`);
    if (expertNegotiatorActive) console.log(`      - Expert Negotiator active`);
    if (failedAttempts >= 2) console.log(`      - Multiple failed P2P attempts (${failedAttempts})`);
    if (hasAbundantResources && hasFavorablePort) console.log(`      - Abundant resources + favorable port`);
    if (isCloseToWinning && hasAbundantResources) console.log(`      - Close to winning + abundant resources`);
    if (difficulty === 'hard' && failedAttempts >= 1) console.log(`      - Hard difficulty + P2P failure`);
  }

  // Evaluate both bank and P2P trades, then choose the best option
  const bestBankTrade = findBestBankTrade(player, gameState, activeGoal, tradeHistory, frustrationLevel);
  const bestPlayerTrade = findBestPlayerTrade(player, gameState, activeGoal, tradeHistory);

  const wouldCycle = (trade: TradeEvaluation | null): boolean => {
    if (!trade || !trade.offering || !tradeHistory) return false;
    return isRecentlyAcquired(trade.offering, tradeHistory);
  };

  if (preferBankTrades && bestBankTrade && !wouldCycle(bestBankTrade)) {
    console.log(`   ✓ Selected BANK trade: ${bestBankTrade.offeringAmount}x ${bestBankTrade.offering} → ${bestBankTrade.requesting}`);
    console.log(`   Reason: ${bestBankTrade.reasoning}`);
    return { ...bestBankTrade, targetBuilding: activeGoal.targetBuilding };
  }

  if (bestPlayerTrade && failedAttempts < 3 && !wouldCycle(bestPlayerTrade)) {
    console.log(`   ✓ Selected P2P trade: ${bestPlayerTrade.offeringAmount}x ${bestPlayerTrade.offering} → ${bestPlayerTrade.requesting}`);
    console.log(`   Reason: ${bestPlayerTrade.reasoning}`);
    return { ...bestPlayerTrade, targetBuilding: activeGoal.targetBuilding };
  } else if (bestPlayerTrade && failedAttempts >= 3) {
    console.log(`   ⚠️ P2P trade available but too many failures (${failedAttempts}), switching to bank`);
  }

  if (bestBankTrade && !wouldCycle(bestBankTrade)) {
    console.log(`   ✓ Selected BANK trade (fallback): ${bestBankTrade.offeringAmount}x ${bestBankTrade.offering} → ${bestBankTrade.requesting}`);
    console.log(`   Reason: ${bestBankTrade.reasoning}`);
    return { ...bestBankTrade, targetBuilding: activeGoal.targetBuilding };
  }

  console.log(`   ✗ No beneficial trades available`);
  return { shouldTrade: false, tradeType: 'bank', reasoning: 'No beneficial trades available' };
}

export function identifyTradeGoals(player: Player, gameState: GameState, boardSize: BoardSize): TradeGoal[] {
  const goals: TradeGoal[] = [];

  const pointsToWin = gameState.gameSettings.pointsToWin;
  const currentPoints = player.score + player.secretPoints;
  const isEarlyGame = currentPoints < 5;
  const villageCount = gameState.villages.filter(v => v.playerId === player.id && v.type === 'settlement').length;

  const totalResources = player.resources.clay + player.resources.lumber +
                         player.resources.grain + player.resources.fabric + player.resources.mineral;

  // Check viable placement locations for each building type
  const validVillagePlacements = getValidVillagePlacements(player.id, gameState, boardSize);
  const validRoadPlacements = getValidRoadPlacements(player.id, gameState, boardSize);
  const upgradableVillages = getPlayerVillages(player.id, gameState);
  const hasDevCardsAvailable = gameState.developmentCardDeck.length > 0;

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

    // Check if village placement is actually viable
    const hasViablePlacement = validVillagePlacements.length > 0;
    if (!hasViablePlacement) {
      // Drastically reduce priority if no viable placements exist
      villagePriority = 1;
    }

    goals.push({
      targetBuilding: 'village',
      neededResources: villageNeeds,
      priority: villagePriority,
      hasViablePlacement
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

    const hasUpgradeableVillage = upgradableVillages.length > 0;
    if (hasUpgradeableVillage && villageCount >= 2) {
      estatePriority += 2;
    }

    goals.push({
      targetBuilding: 'estate',
      neededResources: estateNeeds,
      priority: estatePriority,
      hasViablePlacement: hasUpgradeableVillage
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

    // Boost road priority if it could open village spots
    const hasViablePlacement = validRoadPlacements.length > 0;
    if (validVillagePlacements.length === 0 && hasViablePlacement) {
      // No village spots on current network but roads are available - boost priority
      roadPriority = 14; // Make roads higher priority than base estate (12)
    }

    goals.push({
      targetBuilding: 'road',
      neededResources: roadNeeds,
      priority: roadPriority,
      hasViablePlacement
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
      priority: devCardPriority,
      hasViablePlacement: hasDevCardsAvailable
    });
  }

  // Run trade sequence simulations for each goal to determine achievability
  goals.forEach(goal => {
    if (Object.keys(goal.neededResources).length === 0) {
      // Already can afford - definitely achievable
      goal.achievableThisTurn = true;
      goal.tradeSequenceSteps = 0;
    } else {
      const simulation = simulateTradeSequencesToGoal(player, gameState, goal, 4);
      goal.achievableThisTurn = simulation.canComplete;
      goal.tradeSequenceSteps = simulation.totalSteps;

      // Adjust priority based on achievability
      if (!goal.achievableThisTurn && goal.priority > 5) {
        console.log(`   ⚠️ ${goal.targetBuilding} not achievable this turn - reducing priority from ${goal.priority} to 3`);
        goal.priority = 3; // Drastically reduce priority for unachievable goals
      } else if (goal.achievableThisTurn && goal.tradeSequenceSteps! <= 2) {
        // Boost priority for easily achievable goals
        goal.priority += 2;
        console.log(`   ✓ ${goal.targetBuilding} achievable in ${goal.tradeSequenceSteps} steps - boosting priority to ${goal.priority}`);
      }
    }
  });

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

function isResourceCycling(history: TurnTradeHistory): boolean {
  if (history.tradesExecuted.length < 2) return false;

  // Check last 2 trades for cycling pattern
  const lastTrade = history.tradesExecuted[history.tradesExecuted.length - 1];

  // Look for trades in the history where we acquired what we're about to give away
  for (let i = history.tradesExecuted.length - 2; i >= 0; i--) {
    const prevTrade = history.tradesExecuted[i];

    // If we previously traded FOR the resource we're now trading AWAY, that's cycling
    if (prevTrade.requesting === lastTrade.offering) {
      return true;
    }
  }

  return false;
}

function isRecentlyAcquired(resource: ResourceType, history: TurnTradeHistory): boolean {
  if (!history || history.tradesExecuted.length === 0) return false;

  return history.tradesExecuted.some(trade => trade.requesting === resource);
}

function findBestPlayerTrade(
  player: Player,
  gameState: GameState,
  goal: TradeGoal,
  tradeHistory?: TurnTradeHistory
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
    // Don't trade away resources we just acquired (prevents cycling)
    if (tradeHistory && isRecentlyAcquired(surplusResource, tradeHistory)) {
      console.log(`   ⚠️ Skipping ${surplusResource} - recently acquired in previous trade`);
      continue;
    }

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
  boardSize: BoardSize,
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
  goal: TradeGoal,
  tradeHistory?: TurnTradeHistory,
  frustrationLevel: number = 0
): TradeEvaluation | null {
  const neededResources = Object.keys(goal.neededResources) as ResourceType[];
  const surplus = getSurplusResources(player.resources, goal);

  if (surplus.length === 0 || neededResources.length === 0) {
    return null;
  }

  // CRITICAL: Check if goal is achievable this turn
  if (goal.achievableThisTurn === false) {
    console.log(`   ⚠️ Goal ${goal.targetBuilding} is NOT achievable this turn - skipping bank trades for this goal`);
    return null;
  }

  let bestTrade: TradeEvaluation | null = null;
  let bestTradeScore = -Infinity;
  let completingTrade: TradeEvaluation | null = null;  // Track if a trade would complete the goal

  console.log(`   🏦 Evaluating bank trade options...`);
  if (frustrationLevel > 0) {
    console.log(`      (Frustration bonus active: +${frustrationLevel * 2} to all bank trades)`);
  }

  for (const surplusResource of surplus) {
    if (tradeHistory && isRecentlyAcquired(surplusResource, tradeHistory)) {
      console.log(`      ⚠️ Skipping ${surplusResource} - acquired in a previous trade this turn`);
      continue;
    }

    const tradeRate = getBestTradeRateForResource(player.id, surplusResource, gameState);

    console.log(`      ${surplusResource}: Have ${player.resources[surplusResource]}, Rate ${tradeRate.rate}:1 ${tradeRate.portType ? `(${tradeRate.portType} port)` : '(4:1 bank)'}`);

    if (player.resources[surplusResource] >= tradeRate.rate) {
      for (const neededResource of neededResources) {
        const neededAmount = goal.neededResources[neededResource] || 1;
        const resourceAmount = player.resources[surplusResource];

        // Determine max multiplier: how many times can we trade?
        const maxPossibleMultiplier = Math.floor(resourceAmount / tradeRate.rate);
        // Cap at how many we need, or 3x for efficiency
        const maxMultiplier = Math.min(maxPossibleMultiplier, neededAmount, 3);

        // Evaluate different trade sizes (1x, 2x, 3x the base rate)
        for (let multiplier = 1; multiplier <= maxMultiplier; multiplier++) {
          const offeringAmount = tradeRate.rate * multiplier;
          const requestingAmount = multiplier;

          // Calculate trade score (higher is better)
          let tradeScore = 0;

          // Base score: efficiency (lower rate is better)
          const efficiency = tradeRate.rate;
          tradeScore += (5 - efficiency) * 3; // 2:1 = 9 points, 3:1 = 6 points, 4:1 = 3 points

          // Port bonus
          if (tradeRate.portType === 'specific_2to1') {
            tradeScore += 8; // Significant bonus for 2:1 port
          } else if (tradeRate.portType === 'general_3to1') {
            tradeScore += 4; // Moderate bonus for 3:1 port
          }

          // Frustration bonus (makes bank trades more attractive after P2P failures)
          const frustrationBonus = frustrationLevel * 2;
          tradeScore += frustrationBonus;

          // Resource concentration bonus (if we have lots of this resource)
          if (resourceAmount >= 5) {
            tradeScore += 3;
          } else if (resourceAmount >= 4) {
            tradeScore += 2;
          }

          // Multi-resource bonus: prefer larger trades when we have surplus
          if (multiplier >= 2) {
            // Bonus for trading more when we have abundance
            if (resourceAmount >= tradeRate.rate * 3) {
              tradeScore += multiplier * 2; // +2 per extra resource when abundant
            } else if (resourceAmount >= tradeRate.rate * 2) {
              tradeScore += multiplier; // +1 per extra resource when moderate
            }
          }

          // Certainty bonus (guaranteed to get the resource)
          const totalResources = player.resources.total;
          if (totalResources >= 8) {
            tradeScore += 3; // High value when near discard threshold
          } else if (totalResources >= 7) {
            tradeScore += 2;
          } else {
            tradeScore += 1;
          }

          // Multiple needed resources bonus
          if (multiplier >= 2 && neededAmount >= 2) {
            tradeScore += 3; // Bonus for getting multiple needed resources at once
          }

          // Victory urgency bonus
          const pointsAway = gameState.gameSettings.pointsToWin - (player.score + player.secretPoints);
          if (pointsAway <= 2 && Object.keys(goal.neededResources).length === 1) {
            tradeScore += 5; // High bonus when close to winning and only 1 resource away
          } else if (pointsAway <= 2) {
            tradeScore += 2;
          }

          if (multiplier === 1) {
            console.log(`         Score: ${tradeScore.toFixed(1)} for ${offeringAmount}:${requestingAmount} (${efficiency}:1 rate)`);
          } else {
            console.log(`         Score: ${tradeScore.toFixed(1)} for ${offeringAmount}:${requestingAmount} (${multiplier}x ${efficiency}:1 rate)`);
          }

          // Check if this trade would COMPLETE the building goal
          const simulatedResources = { ...player.resources };
          simulatedResources[surplusResource] -= offeringAmount;
          simulatedResources[neededResource] += requestingAmount;

          const wouldCompleteGoal = checkIfCanAffordGoal(simulatedResources, goal.targetBuilding);

          if (wouldCompleteGoal && !completingTrade) {
            // This trade completes the goal - give it maximum priority!
            completingTrade = {
              shouldTrade: true,
              tradeType: 'bank',
              offering: surplusResource,
              offeringAmount: offeringAmount,
              requesting: neededResource,
              requestingAmount: requestingAmount,
              reasoning: `🎯 COMPLETING ${goal.targetBuilding}! Bank trade ${offeringAmount}:${requestingAmount} (${tradeRate.rate}:1 rate) ${surplusResource}→${neededResource}`
            };
            console.log(`         🎯 THIS TRADE COMPLETES THE GOAL! Maximum priority!`);
          }

          if (tradeScore > bestTradeScore) {
            bestTradeScore = tradeScore;
            bestTrade = {
              shouldTrade: true,
              tradeType: 'bank',
              offering: surplusResource,
              offeringAmount: offeringAmount,
              requesting: neededResource,
              requestingAmount: requestingAmount,
              reasoning: `Bank trade ${offeringAmount}:${requestingAmount} (${tradeRate.rate}:1 rate) ${surplusResource}→${neededResource} for ${goal.targetBuilding} (score: ${tradeScore.toFixed(1)}${tradeRate.portType ? `, ${tradeRate.portType} port` : ''})`
            };
          }
        }
      }
    } else {
      console.log(`         ✗ Not enough (need ${tradeRate.rate})`);
    }
  }

  // If we found a trade that completes the goal, always return that one!
  if (completingTrade) {
    console.log(`      ✓ COMPLETING TRADE: ${completingTrade.offeringAmount}x ${completingTrade.offering} → ${completingTrade.requestingAmount}x ${completingTrade.requesting}`);
    return completingTrade;
  }

  if (bestTrade) {
    console.log(`      ✓ Best bank trade: ${bestTrade.offeringAmount}x ${bestTrade.offering} → ${bestTrade.requestingAmount}x ${bestTrade.requesting} (score: ${bestTradeScore.toFixed(1)})`);

    // VALIDATION: Check if this trade is part of a viable path to the goal
    const simulatedResources: Resources = {
      clay: player.resources.clay,
      lumber: player.resources.lumber,
      grain: player.resources.grain,
      fabric: player.resources.fabric,
      mineral: player.resources.mineral,
      total: 0
    };
    simulatedResources[bestTrade.offering!] -= bestTrade.offeringAmount!;
    simulatedResources[bestTrade.requesting!] += bestTrade.requestingAmount!;
    simulatedResources.total = simulatedResources.clay + simulatedResources.lumber +
                               simulatedResources.grain + simulatedResources.fabric + simulatedResources.mineral;

    // Check if we can afford the goal after this trade
    const canAffordAfterTrade = checkIfCanAffordGoal(simulatedResources, goal.targetBuilding);

    if (!canAffordAfterTrade) {
      // Trade doesn't complete goal - verify we can continue trading
      const updatedGoal = {
        ...goal,
        neededResources: calculateResourceNeeds(simulatedResources, getRequiredResourcesForBuilding(goal.targetBuilding))
      };

      const remainingSurplus = getSurplusResourcesForSimulation(simulatedResources, updatedGoal);
      const stillNeedsResources = Object.keys(updatedGoal.neededResources).length > 0;

      if (stillNeedsResources && remainingSurplus.length === 0) {
        console.log(`      ⚠️ WARNING: Trade would leave no surplus resources to continue toward ${goal.targetBuilding}`);
        console.log(`         After trade: ${formatResources(simulatedResources)}`);
        console.log(`         Still need: ${Object.entries(updatedGoal.neededResources).map(([r, amt]) => `${amt} ${r}`).join(', ')}`);
        console.log(`         ✗ REJECTING trade - would create dead-end situation`);
        return null; // Don't execute trades that create dead-end situations
      }
    }
  }

  return bestTrade;
}

function checkIfCanAffordGoal(resources: Resources, buildingType: 'village' | 'estate' | 'road' | 'dev_card'): boolean {
  switch (buildingType) {
    case 'village':
      return resources.clay >= 1 && resources.lumber >= 1 && resources.grain >= 1 && resources.fabric >= 1;
    case 'estate':
      return resources.grain >= 2 && resources.mineral >= 3;
    case 'road':
      return resources.clay >= 1 && resources.lumber >= 1;
    case 'dev_card':
      return resources.grain >= 1 && resources.fabric >= 1 && resources.mineral >= 1;
    default:
      return false;
  }
}

function getRequiredResourcesForBuilding(buildingType: 'village' | 'estate' | 'road' | 'dev_card'): Resources {
  switch (buildingType) {
    case 'village':
      return { clay: 1, lumber: 1, grain: 1, fabric: 1, mineral: 0, total: 4 };
    case 'estate':
      return { clay: 0, lumber: 0, grain: 2, fabric: 0, mineral: 3, total: 5 };
    case 'road':
      return { clay: 1, lumber: 1, grain: 0, fabric: 0, mineral: 0, total: 2 };
    case 'dev_card':
      return { clay: 0, lumber: 0, grain: 1, fabric: 1, mineral: 1, total: 3 };
  }
}

interface TradeSequenceStep {
  offering: ResourceType;
  offeringAmount: number;
  requesting: ResourceType;
  requestingAmount: number;
  tradeRate: number;
  resultingResources: Resources;
}

interface TradeSequenceSimulation {
  canComplete: boolean;
  steps: TradeSequenceStep[];
  totalSteps: number;
  reasoning: string;
}

function simulateTradeSequencesToGoal(
  player: Player,
  gameState: GameState,
  goal: TradeGoal,
  maxSteps: number = 4
): TradeSequenceSimulation {
  const startingResources = { ...player.resources };
  const targetBuilding = goal.targetBuilding;

  console.log(`   🔮 Simulating trade sequences for ${targetBuilding}...`);
  console.log(`      Starting resources: ${formatResources(startingResources)}`);

  if (checkIfCanAffordGoal(startingResources, targetBuilding)) {
    console.log(`      ✓ Can already afford goal - no trades needed`);
    return {
      canComplete: true,
      steps: [],
      totalSteps: 0,
      reasoning: 'Already can afford goal'
    };
  }

  const neededResources = Object.keys(goal.neededResources) as ResourceType[];
  if (neededResources.length === 0) {
    return {
      canComplete: true,
      steps: [],
      totalSteps: 0,
      reasoning: 'No resources needed'
    };
  }

  const sequence = findViableTradeSequence(
    startingResources,
    goal,
    player,
    gameState,
    maxSteps
  );

  if (sequence.canComplete) {
    console.log(`      ✓ Found viable sequence with ${sequence.totalSteps} steps`);
    sequence.steps.forEach((step, idx) => {
      console.log(`         ${idx + 1}. Trade ${step.offeringAmount}x ${step.offering} → ${step.requestingAmount}x ${step.requesting} (${step.tradeRate}:1)`);
    });
  } else {
    console.log(`      ✗ No viable sequence found: ${sequence.reasoning}`);
  }

  return sequence;
}

function findViableTradeSequence(
  startingResources: Resources,
  goal: TradeGoal,
  player: Player,
  gameState: GameState,
  maxSteps: number
): TradeSequenceSimulation {
  const neededResources = Object.keys(goal.neededResources) as ResourceType[];
  const targetBuilding = goal.targetBuilding;

  let bestSequence: TradeSequenceSimulation = {
    canComplete: false,
    steps: [],
    totalSteps: 0,
    reasoning: 'No viable sequence found'
  };

  const queue: Array<{
    resources: Resources;
    steps: TradeSequenceStep[];
    depth: number;
  }> = [{
    resources: { ...startingResources },
    steps: [],
    depth: 0
  }];

  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.depth > maxSteps) continue;

    const resourceKey = formatResourcesForKey(current.resources);
    if (visited.has(resourceKey)) continue;
    visited.add(resourceKey);

    if (checkIfCanAffordGoal(current.resources, targetBuilding)) {
      return {
        canComplete: true,
        steps: current.steps,
        totalSteps: current.steps.length,
        reasoning: `Found sequence with ${current.steps.length} trades`
      };
    }

    if (current.depth >= maxSteps) continue;

    const surplus = getSurplusResourcesForSimulation(current.resources, goal);

    for (const surplusResource of surplus) {
      const tradeRate = getBestTradeRateForResource(player.id, surplusResource, gameState);

      if (current.resources[surplusResource] >= tradeRate.rate) {
        for (const neededResource of neededResources) {
          const maxMultiplier = Math.min(
            Math.floor(current.resources[surplusResource] / tradeRate.rate),
            goal.neededResources[neededResource] || 1,
            3
          );

          for (let multiplier = 1; multiplier <= maxMultiplier; multiplier++) {
            const offeringAmount = tradeRate.rate * multiplier;
            const requestingAmount = multiplier;

            const newResources: Resources = {
              clay: current.resources.clay,
              lumber: current.resources.lumber,
              grain: current.resources.grain,
              fabric: current.resources.fabric,
              mineral: current.resources.mineral,
              total: 0
            };

            newResources[surplusResource] -= offeringAmount;
            newResources[neededResource] += requestingAmount;
            newResources.total = newResources.clay + newResources.lumber +
                                 newResources.grain + newResources.fabric + newResources.mineral;

            if (newResources[surplusResource] < 0) continue;

            const newStep: TradeSequenceStep = {
              offering: surplusResource,
              offeringAmount,
              requesting: neededResource,
              requestingAmount,
              tradeRate: tradeRate.rate,
              resultingResources: newResources
            };

            queue.push({
              resources: newResources,
              steps: [...current.steps, newStep],
              depth: current.depth + 1
            });
          }
        }
      }
    }
  }

  if (queue.length === 0 && visited.size > 0) {
    const totalAvailable = startingResources.clay + startingResources.lumber +
                          startingResources.grain + startingResources.fabric + startingResources.mineral;
    return {
      canComplete: false,
      steps: [],
      totalSteps: 0,
      reasoning: `Insufficient tradeable resources (have ${totalAvailable}, need path to ${targetBuilding})`
    };
  }

  return bestSequence;
}

function getSurplusResourcesForSimulation(resources: Resources, goal: TradeGoal): ResourceType[] {
  const surplus: ResourceType[] = [];

  (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as ResourceType[]).forEach(resource => {
    const needed = goal.neededResources[resource] || 0;
    const current = resources[resource];

    if (current > needed && current >= 1) {
      surplus.push(resource);
    }
  });

  return surplus;
}

function formatResources(resources: Resources): string {
  return `C:${resources.clay} L:${resources.lumber} Gr:${resources.grain} F:${resources.fabric} M:${resources.mineral}`;
}

function formatResourcesForKey(resources: Resources): string {
  return `${resources.clay}-${resources.lumber}-${resources.grain}-${resources.fabric}-${resources.mineral}`;
}

function getSurplusResources(resources: Resources, goal?: TradeGoal): ResourceType[] {
  const surplus: ResourceType[] = [];

  const nearVillage = resources.clay >= 1 && resources.lumber >= 1 &&
                       resources.grain >= 1 && resources.fabric >= 1;
  const nearEstate = resources.grain >= 2 && resources.mineral >= 3;

  const totalResources = resources.clay + resources.lumber + resources.grain +
                        resources.fabric + resources.mineral;
  // Lowered from 8 to 7 to make bank trades more accessible
  const hasMany = totalResources >= 7;

  // Find if any resource has high concentration (3+ of one type)
  const hasConcentratedResource = (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as ResourceType[])
    .some(r => resources[r] >= 3);

  (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as ResourceType[]).forEach(resource => {
    let keepThreshold = 1;

    // CRITICAL: Never mark as surplus if needed for the top goal
    if (goal) {
      const isNeededForGoal = goal.neededResources[resource] && goal.neededResources[resource]! > 0;
      if (isNeededForGoal) {
        // Keep all of this resource - never trade it away
        return;
      }
    }

    // If player has concentrated resources (3+ of one type), be more willing to trade
    if (hasConcentratedResource && resources[resource] >= 3) {
      keepThreshold = 2; // Keep 2, trade the rest
    } else if (nearVillage) {
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

    if (hasMany && resources[resource] > 0) {
      surplus.push(resource);
    } else if (resources[resource] > keepThreshold) {
      surplus.push(resource);
    }
  });

  // Fallback: if still no surplus but we have resources, allow trading non-goal resources
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

function checkForFavorablePorts(player: Player, gameState: GameState): boolean {
  // Check if player has any 2:1 or 3:1 trading ports
  const playerPorts = gameState.tradingPorts?.filter(port =>
    gameState.villages.some(v =>
      v.playerId === player.id &&
      port.vertices.includes(v.vertexId)
    )
  ) || [];

  // Check if any ports are 2:1 or 3:1
  return playerPorts.some(port =>
    port.type === 'specific_2to1' || port.type === 'general_3to1'
  );
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
  boardSize: BoardSize,
  attemptsThisTurn: number
): boolean {
  if (attemptsThisTurn >= 3) {
    return false;
  }

  const goals = identifyTradeGoals(player, gameState, boardSize);
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

  if (difficulty === 'hard') {
    // Hard difficulty ALWAYS attempts trades when beneficial - zero randomness
    console.log(`   ✓ Hard difficulty: ALWAYS attempt beneficial trades (100% deterministic)`);
    return true;
  }

  let tradeChance = 0.8;

  if (difficulty === 'easy') {
    tradeChance = 0.6;
  } else if (difficulty === 'normal') {
    tradeChance = 0.85;  // Increased from 0.8
  }

  const willTrade = Math.random() < tradeChance;
  console.log(`   ${willTrade ? '✓' : '✗'} Trade chance for ${difficulty}: ${(tradeChance * 100).toFixed(0)}% (rolled ${willTrade ? 'yes' : 'no'})`);

  return willTrade;
}
