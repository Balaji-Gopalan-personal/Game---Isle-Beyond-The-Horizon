import { GameState, Player, Resources, TradingPort, BoardSize } from '../types/game';
import { ResourceType, getBestTradeRateForResource } from '../utils/tradingUtils';
import { canAffordVillage, canAffordEstate, canAffordRoad, canAffordDevelopmentCard } from './aiBuilding';
import { getValidVillagePlacements, getValidRoadPlacements, getPlayerVillages } from './gameplayActions';
import { chooseByRubric } from './aiDifficultyTuning';
import { countVillageSpotsByHops } from './aiLocationStrategy';

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

  // Calculate trade budget for this turn
  const tradesExecutedCount = tradeHistory?.tradesExecuted.length || 0;
  const pointsAway = gameState.gameSettings.pointsToWin - (player.score + player.secretPoints);
  const maxTradesAllowed = expertNegotiatorActive ? 4 : (pointsAway <= 2 ? 5 : 3);
  const remainingTradeBudget = maxTradesAllowed - tradesExecutedCount;

  console.log(`   💰 Trade budget: ${tradesExecutedCount}/${maxTradesAllowed} trades used (${remainingTradeBudget} remaining)`);

  // If we have a trade history, validate we should continue trading
  if (tradeHistory && tradeHistory.tradesExecuted.length > 0) {
    console.log(`   📊 Analyzing ${tradeHistory.tradesExecuted.length} previous trades this turn`);

    // Check if we're cycling resources (trading away what we just got)
    if (isResourceCycling(tradeHistory)) {
      console.log(`   ✗ Detected resource cycling - stopping trades to prevent waste`);
      return { shouldTrade: false, tradeType: 'bank', reasoning: 'Preventing resource cycling' };
    }

    // Limit total trades per turn (unless close to winning)
    if (tradesExecutedCount >= maxTradesAllowed) {
      console.log(`   ✗ Max trades reached (${maxTradesAllowed}) for this turn`);
      return { shouldTrade: false, tradeType: 'bank', reasoning: 'Max trades per turn reached' };
    }
  }

  const goals = identifyTradeGoals(player, gameState, boardSize, remainingTradeBudget);

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
  // pointsAway already calculated above for trade budget
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
  const bestBankTrade = findBestBankTrade(player, gameState, activeGoal, tradeHistory, frustrationLevel, remainingTradeBudget, difficulty);
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

export function identifyTradeGoals(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  remainingTradeBudget: number = 4
): TradeGoal[] {
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

  // BFS reachability for village spots up to 2 roads out. Using only the
  // directly-placeable set (depth 0) here previously meant that right after
  // placing a village (when the next spot is 1-2 roads away, which is most
  // of the game) the village goal's priority collapsed to near-zero and the
  // road goal got boosted instead - even when those roads led nowhere useful.
  const villageReachability = countVillageSpotsByHops(player.id, gameState, boardSize, 2);
  const roadsCanOpenVillageSpot = villageReachability.byDepth[1] > 0;

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

    // A village goal is viable if a legal spot exists now OR is reachable
    // within 2 roads - not just directly placeable this instant. Only
    // collapse priority to near-zero when there's genuinely nowhere to go.
    const hasReachablePlacement = villageReachability.total > 0;
    const hasDirectPlacement = validVillagePlacements.length > 0;
    if (!hasReachablePlacement) {
      villagePriority = 1;
    } else if (!hasDirectPlacement) {
      // Spot needs 1-2 roads first - still worth trading toward, just
      // slightly less urgent than an immediately placeable spot.
      villagePriority *= 0.8;
    }

    goals.push({
      targetBuilding: 'village',
      neededResources: villageNeeds,
      priority: villagePriority,
      hasViablePlacement: hasReachablePlacement
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

    // Boost road priority only when building one would actually open a new
    // village spot (a legal spot exists exactly 1 road away). Previously this
    // boosted any time no spot was directly placeable and roads were legal
    // ANYWHERE on the network, regardless of whether those roads led toward
    // a village or off into empty board - producing long, directionless
    // roads that out-competed saving for a village.
    const hasViablePlacement = validRoadPlacements.length > 0;
    if (validVillagePlacements.length === 0 && hasViablePlacement && roadsCanOpenVillageSpot) {
      // No village spot directly placeable, but a road would open one - boost priority
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
  // CRITICAL: Use remaining trade budget to ensure goals are actually achievable this turn
  goals.forEach(goal => {
    if (Object.keys(goal.neededResources).length === 0) {
      // Already can afford - definitely achievable
      goal.achievableThisTurn = true;
      goal.tradeSequenceSteps = 0;
    } else {
      // Use remaining trade budget as max steps - can't exceed this!
      const simulation = simulateTradeSequencesToGoal(player, gameState, goal, remainingTradeBudget);
      goal.achievableThisTurn = simulation.canComplete;
      goal.tradeSequenceSteps = simulation.totalSteps;

      // CRITICAL: Even if simulation says "achievable", verify it's within budget
      if (goal.achievableThisTurn && goal.tradeSequenceSteps! > remainingTradeBudget) {
        console.log(`   ⚠️ ${goal.targetBuilding} needs ${goal.tradeSequenceSteps} trades but only ${remainingTradeBudget} remaining - marking UNACHIEVABLE`);
        goal.achievableThisTurn = false;
      }

      // Adjust priority based on achievability
      if (!goal.achievableThisTurn && goal.priority > 5) {
        const budgetInfo = goal.tradeSequenceSteps! > remainingTradeBudget
          ? ` (needs ${goal.tradeSequenceSteps} trades, only ${remainingTradeBudget} remaining)`
          : '';
        console.log(`   ⚠️ ${goal.targetBuilding} not achievable this turn${budgetInfo} - reducing priority from ${goal.priority} to 3`);
        goal.priority = 3; // Drastically reduce priority for unachievable goals
      } else if (goal.achievableThisTurn && goal.tradeSequenceSteps! <= 2) {
        // Boost priority for easily achievable goals
        goal.priority += 2;
        console.log(`   ✓ ${goal.targetBuilding} achievable in ${goal.tradeSequenceSteps} steps (${remainingTradeBudget} budget) - boosting priority to ${goal.priority}`);
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

interface PossiblePlayerTrade {
  offering: ResourceType;
  offeringAmount: number;
  requesting: ResourceType;
  requestingAmount: number;
  fairness: number;
}

interface ScoredPlayerTrade extends PossiblePlayerTrade {
  score: number;
}

// Every offering/requesting resource pair, at every affordable ratio. Shared by
// findBestPlayerTrade and getAllRankedPlayerTrades so the two don't drift.
function generatePossiblePlayerTrades(
  player: Player,
  goal: TradeGoal,
  surplus: ResourceType[],
  neededResources: ResourceType[],
  tradeHistory?: TurnTradeHistory
): PossiblePlayerTrade[] {
  const possibleTrades: PossiblePlayerTrade[] = [];

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
        possibleTrades.push({ offering: surplusResource, offeringAmount: 1, requesting: neededResource, requestingAmount: 1, fairness: 1.0 });
      }
      if (availableAmount >= 2) {
        possibleTrades.push({ offering: surplusResource, offeringAmount: 2, requesting: neededResource, requestingAmount: 1, fairness: 0.5 });
      }
      if (availableAmount >= 2 && neededAmount >= 2) {
        possibleTrades.push({ offering: surplusResource, offeringAmount: 2, requesting: neededResource, requestingAmount: 2, fairness: 1.0 });
      }
      if (availableAmount >= 3) {
        possibleTrades.push({ offering: surplusResource, offeringAmount: 3, requesting: neededResource, requestingAmount: 1, fairness: 0.33 });
      }
      if (availableAmount >= 3 && neededAmount >= 2) {
        possibleTrades.push({ offering: surplusResource, offeringAmount: 3, requesting: neededResource, requestingAmount: 2, fairness: 0.67 });
      }
      if (availableAmount >= 1 && neededAmount >= 2) {
        possibleTrades.push({ offering: surplusResource, offeringAmount: 1, requesting: neededResource, requestingAmount: 2, fairness: 2.0 });
      }
    }
  }

  return possibleTrades;
}

// Fairness/personality/priority scoring is a single, difficulty-independent
// standard - difficulty only affects which scored trade the AI ends up acting
// on (via chooseByRubric in the callers below).
function scorePlayerTrades(
  possibleTrades: PossiblePlayerTrade[],
  goal: TradeGoal,
  player: Player,
  personality: string
): ScoredPlayerTrade[] {
  const scored = possibleTrades.map(trade => {
    let score = 0;

    const totalPriority = goal.priority;
    const resourceScarcity = 1.0 / (player.resources[trade.offering] + 1);

    if (trade.fairness >= 0.7) {
      score += 8;
    } else if (trade.fairness >= 0.4) {
      score += 5;
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

  scored.sort((a, b) => b.score - a.score);
  return scored;
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

  const possibleTrades = generatePossiblePlayerTrades(player, goal, surplus, neededResources, tradeHistory);
  if (possibleTrades.length === 0) {
    return null;
  }

  const scoredTrades = scorePlayerTrades(possibleTrades, goal, player, personality);
  const bestTrade = chooseByRubric(scoredTrades, difficulty);

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

  const possibleTrades = generatePossiblePlayerTrades(player, goal, surplus, neededResources);
  const scoredTrades = scorePlayerTrades(possibleTrades, goal, player, personality)
    .map(trade => ({
      ...trade,
      reasoning: `P2P trade: ${trade.offeringAmount} ${trade.offering} for ${trade.requestingAmount} ${trade.requesting} to build ${goal.targetBuilding} (fairness: ${trade.fairness.toFixed(2)}, score: ${trade.score.toFixed(1)})`
    }));

  const minFairnessThreshold = 0.25;
  const viableTrades = scoredTrades.filter(trade => trade.score > 0 && trade.fairness >= minFairnessThreshold);

  if (viableTrades.length === 0) {
    return [];
  }

  // The rubric decides which viable trade the AI leads with; the caller
  // (getPlayerTradeProposal) falls back through the rest, in score order, if
  // that one has already failed as a proposal this turn.
  const preferred = chooseByRubric(viableTrades, difficulty);
  return [preferred, ...viableTrades.filter(trade => trade !== preferred)];
}

function findBestBankTrade(
  player: Player,
  gameState: GameState,
  goal: TradeGoal,
  tradeHistory?: TurnTradeHistory,
  frustrationLevel: number = 0,
  remainingTradeBudget: number = 4,
  difficulty: 'easy' | 'normal' | 'hard' = 'normal'
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

  // CRITICAL: Check if we have ANY trade budget remaining
  if (remainingTradeBudget <= 0) {
    console.log(`   ⚠️ No trade budget remaining (0/${remainingTradeBudget}) - cannot execute any more trades this turn`);
    return null;
  }

  const candidates: Array<TradeEvaluation & { score: number }> = [];
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

          candidates.push({
            shouldTrade: true,
            tradeType: 'bank',
            offering: surplusResource,
            offeringAmount: offeringAmount,
            requesting: neededResource,
            requestingAmount: requestingAmount,
            reasoning: `Bank trade ${offeringAmount}:${requestingAmount} (${tradeRate.rate}:1 rate) ${surplusResource}→${neededResource} for ${goal.targetBuilding} (score: ${tradeScore.toFixed(1)}${tradeRate.portType ? `, ${tradeRate.portType} port` : ''})`,
            score: tradeScore
          });
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

  candidates.sort((a, b) => b.score - a.score);
  const bestTrade = candidates.length > 0 ? chooseByRubric(candidates, difficulty) : null;

  if (bestTrade) {
    console.log(`      ✓ Best bank trade: ${bestTrade.offeringAmount}x ${bestTrade.offering} → ${bestTrade.requestingAmount}x ${bestTrade.requesting} (score: ${bestTrade.score.toFixed(1)})`);

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
      // Trade doesn't complete goal - verify we can continue trading WITHIN REMAINING BUDGET
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

      // CRITICAL: Check if we have enough trade budget remaining to complete the goal
      const tradesUsedAfterThis = 1; // This trade will use 1 slot
      const budgetAfterThis = remainingTradeBudget - tradesUsedAfterThis;

      if (budgetAfterThis > 0) {
        // Check if we can still complete the goal with remaining budget
        const simulatedPlayer = { ...player, resources: simulatedResources };
        const postTradeSimulation = simulateTradeSequencesToGoal(simulatedPlayer, gameState, updatedGoal, budgetAfterThis);

        if (!postTradeSimulation.canComplete) {
          console.log(`      ⚠️ WARNING: Trade would NOT lead to goal completion within remaining budget`);
          console.log(`         Budget after this trade: ${budgetAfterThis} trades`);
          console.log(`         Still need: ${Object.entries(updatedGoal.neededResources).map(([r, amt]) => `${amt} ${r}`).join(', ')}`);
          console.log(`         Simulation result: ${postTradeSimulation.reasoning}`);
          console.log(`         ✗ REJECTING trade - insufficient budget to complete goal (would waste resources)`);
          return null; // Don't execute trades that can't complete the goal within budget
        } else {
          console.log(`      ✓ Verified: Goal can be completed in ${postTradeSimulation.totalSteps} more trades (budget: ${budgetAfterThis})`);
        }
      } else {
        // No budget remaining after this trade - it MUST complete the goal
        console.log(`      ⚠️ This is the LAST trade allowed this turn - must complete goal or reject`);
        console.log(`         ✗ REJECTING trade - would use last trade but not complete goal`);
        return null;
      }
    } else {
      console.log(`      ✓ Trade COMPLETES the goal ${goal.targetBuilding}!`);
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

// A player is a "high threat" if they're poised to grab a swing bonus on their
// next turn: already hold (or are one step from) Longest Road or Largest Army,
// or are close enough on points that a single bonus would put them in command.
export function isHighThreat(target: Player, gameState: GameState): boolean {
  const settings = gameState.gameSettings;
  const pointsToWin = settings.pointsToWin;
  const pointsAway = pointsToWin - (target.score + target.secretPoints);

  // Already within striking distance overall.
  if (pointsAway <= 3) return true;

  // Largest Army: holds it, or is one guard away from the threshold/leader.
  if (settings.largestArmyEnabled) {
    if (target.hasLargestArmy) return true;
    const holder = gameState.players.find(p => p.hasLargestArmy);
    const needed = holder
      ? Math.max(holder.armyCount + 1 - target.armyCount, 0)
      : settings.largestArmySize - target.armyCount;
    if (needed <= 1) return true;
  }

  // Longest Road: holds it, or is one segment from taking it.
  if (settings.longestRoadEnabled) {
    if (target.hasLongestRoad) return true;
    const myLen = gameState.longestRoadLengths?.get(target.id) || 0;
    const holder = gameState.players.find(p => p.hasLongestRoad);
    const holderLen = holder ? (gameState.longestRoadLengths?.get(holder.id) || 0) : 0;
    const needed = holder
      ? Math.max(holderLen + 1 - myLen, 0)
      : settings.longestRoadSize - myLen;
    if (needed <= 1) return true;
  }

  return false;
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
  const difficulty = player.difficulty || 'normal';
  const netGain = calculateTradeValue(proposal.offeredResources, proposal.requestedResources, player, gameState);

  if (proposal.fromPlayerId) {
    const proposingPlayer = gameState.players.find(p => p.id === proposal.fromPlayerId);
    if (proposingPlayer) {
      const pointsToWin = gameState.gameSettings.pointsToWin;
      const proposerPointsAway = pointsToWin - (proposingPlayer.score + proposingPlayer.secretPoints);

      // Absolute safety rules: never hand an opponent the win outright,
      // regardless of difficulty - this isn't a skill/quality axis.
      if (proposerPointsAway <= 3) {
        console.log(`   ✗ Rejecting trade from ${proposingPlayer.name} - they're ${proposerPointsAway} points from winning`);
        return false;
      }

      if (proposerPointsAway <= 5 && isTradeEnablingWin(proposal.requestedResources, proposingPlayer)) {
        console.log(`   ✗ Rejecting trade from ${proposingPlayer.name} - resources may enable immediate win`);
        return false;
      }

      // A trade that's overwhelmingly good for us bypasses the strategic
      // gates below outright - a clearly favorable deal outweighs "don't feed
      // a threat/leader".
      const isVeryHelpful = netGain >= 3.0;

      // Don't feed a player who is about to seize a swing bonus (Longest Road
      // / Largest Army). Rejecting is the optimal move here; whether the AI
      // actually acts on it goes through the same shared rubric as every
      // other AI decision.
      if (!isVeryHelpful && isHighThreat(proposingPlayer, gameState)) {
        if (chooseByRubric(['reject', 'accept'] as const, difficulty) === 'reject') {
          console.log(`   ✗ Rejecting trade from ${proposingPlayer.name} - they're close to a swing bonus (Longest Road / Largest Army)`);
          return false;
        }
        console.log(`   ✓ Accepting trade from ${proposingPlayer.name} despite swing-bonus threat (${difficulty} difficulty rolled acceptance)`);
      }

      // Don't feed the game leader unless the trade is clearly worth it.
      const gameLeader = getGameLeader(gameState);
      if (gameLeader && gameLeader.id === proposingPlayer.id) {
        if (isVeryHelpful) {
          console.log(`   ✓ Accepting VERY helpful trade from game leader ${proposingPlayer.name} (value: ${netGain.toFixed(1)})`);
        } else if (chooseByRubric(['reject', 'accept'] as const, difficulty) === 'reject') {
          console.log(`   ✗ Rejecting trade from game leader ${proposingPlayer.name} (not VERY helpful, ${difficulty} difficulty)`);
          return false;
        } else {
          console.log(`   ✓ Accepting trade from game leader ${proposingPlayer.name} despite policy (${difficulty} difficulty rolled acceptance)`);
        }
      }
    }
  }

  if (netGain > 0) {
    return canAffordProposal(proposal.offeredResources, player.resources);
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

  // `player` is the RESPONDER evaluating the proposal: they RECEIVE the
  // proposer's `offered` resources and GIVE UP the `requested` resources.
  // Net gain = value(received) - value(given). (Previously inverted, which made
  // the AI accept trades that were good for the proposer and bad for itself.)
  (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as ResourceType[]).forEach(resource => {
    const offeredAmount = offered[resource] || 0;
    const requestedAmount = requested[resource] || 0;

    const resourceValue = getResourceValueForPlayer(resource, player, gameState);

    value += (offeredAmount * resourceValue) - (requestedAmount * resourceValue);
  });

  return value;
}

// How much of `resource` this player produces per turn (sum of pip probabilities
// across their settlements/cities adjacent to that resource). 0 means the player
// has no production for it and can only obtain it by trading.
function getPlayerProductionRate(
  resource: ResourceType,
  player: Player,
  gameState: GameState
): number {
  if (!gameState.boardCenters || gameState.boardCenters.length === 0) return 0;

  const PIP: Record<number, number> = {
    2: 1 / 36, 3: 2 / 36, 4: 3 / 36, 5: 4 / 36, 6: 5 / 36,
    8: 5 / 36, 9: 4 / 36, 10: 3 / 36, 11: 2 / 36, 12: 1 / 36,
  };

  let rate = 0;
  const playerVillages = gameState.villages.filter(v => v.playerId === player.id);
  for (const village of playerVillages) {
    const multiplier = village.type === 'city' ? 2 : 1;
    for (const center of gameState.boardCenters) {
      if (center.resourceType === resource && center.vertices.includes(village.vertexId)) {
        rate += (PIP[center.value] || 0) * multiplier;
      }
    }
  }
  return rate;
}

function getResourceValueForPlayer(
  resource: ResourceType,
  player: Player,
  gameState: GameState
): number {
  let value = 1.0;

  const currentAmount = player.resources[resource];

  if (currentAmount === 0) {
    value = 2.0;
  } else if (currentAmount === 1) {
    value = 1.5;
  } else if (currentAmount >= 5) {
    value = 0.5;
  }

  // Scarcity in PRODUCTION matters more than scarcity in hand: a resource the
  // player can never roll is far more valuable than one they already produce.
  const productionRate = getPlayerProductionRate(resource, player, gameState);
  if (productionRate === 0) {
    value *= 2.0;            // cannot produce at all - only obtainable via trade
  } else if (productionRate < 0.12) {
    value *= 1.4;            // produces it only rarely (~roughly one weak hex)
  } else if (productionRate > 0.28) {
    value *= 0.8;            // produces it abundantly - cheap to replace
  }

  return value;
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

  // Calculate remaining trade budget
  const pointsAway = gameState.gameSettings.pointsToWin - (player.score + player.secretPoints);
  const expertNegotiatorActive = gameState.turnState.expertNegotiatorActive;
  const maxTrades = expertNegotiatorActive ? 4 : (pointsAway <= 2 ? 5 : 3);
  const remainingBudget = maxTrades - attemptsThisTurn;

  const goals = identifyTradeGoals(player, gameState, boardSize, remainingBudget);
  if (goals.length === 0) {
    console.log(`   ✗ No trade goals, won't initiate trade`);
    return false;
  }

  const surplus = getSurplusResources(player.resources);
  if (surplus.length === 0) {
    console.log(`   ✗ No surplus resources, won't initiate trade`);
    return false;
  }

  // A viable goal plus surplus to trade means initiating is the optimal move;
  // whether the AI acts on it goes through the same shared rubric as every
  // other AI decision.
  const difficulty = player.difficulty || 'normal';
  const willTrade = chooseByRubric(['trade', 'skip'] as const, difficulty) === 'trade';
  console.log(`   ${willTrade ? '✓' : '✗'} Trade initiation for ${difficulty} difficulty (rolled ${willTrade ? 'yes' : 'no'})`);

  return willTrade;
}
