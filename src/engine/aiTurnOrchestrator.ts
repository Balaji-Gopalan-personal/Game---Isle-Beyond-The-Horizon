import { GameState, Player, Resources } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { shouldPlayDevCardBeforeRoll, shouldPlayDevCardAfterRoll } from './aiDevCardStrategy';
import { evaluateTradeOpportunity, TradeEvaluation, TurnTradeHistory, identifyTradeGoals } from './aiTradingStrategy';
import { makeStrategicBuildDecision, canAffordVillage, canAffordEstate, canAffordRoad, canAffordDevelopmentCard } from './aiBuilding';
import { getBestTradeRateForResource, ResourceType } from '../utils/tradingUtils';
import { getValidVillagePlacements, getValidRoadPlacements, getPlayerVillages } from './gameplayActions';

export interface TurnAction {
  type: 'play_dev_card' | 'trade_bank' | 'trade_player' | 'build' | 'end_turn';
  priority: number;
  data?: any;
}

export interface GoalUpdate {
  clearGoal: boolean;
  reason: string;
}

export interface TurnPlan {
  actions: TurnAction[];
  reasoning: string;
  goalUpdate?: GoalUpdate;
}

export function createTurnPlan(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  difficulty: 'easy' | 'normal' | 'hard',
  tradeHistory?: TurnTradeHistory
): TurnPlan {
  const pointsAway = gameState.gameSettings.pointsToWin - (player.score + player.secretPoints);
  console.log(`\n🎯 [${player.name}] CREATING TURN PLAN`);
  console.log(`   Points to win: ${pointsAway} | Score: ${player.score} | Secret: ${player.secretPoints}`);
  console.log(`   Resources: Clay=${player.resources.clay} Lumber=${player.resources.lumber} Grain=${player.resources.grain} Fabric=${player.resources.fabric} Mineral=${player.resources.mineral}`);

  const actions: TurnAction[] = [];
  let goalUpdate: GoalUpdate | undefined;

  const committedGoal = (gameState.turnState as any).committedBuildingGoal;
  const tradeIterations = (gameState.turnState as any).tradeIterationsForGoal || 0;
  if (committedGoal) {
    console.log(`   🔒 Committed goal from previous trade: ${committedGoal} (iteration ${tradeIterations})`);

    let hasViablePlacement = true;
    if (committedGoal === 'village') {
      hasViablePlacement = getValidVillagePlacements(player.id, gameState, boardSize).length > 0;
    } else if (committedGoal === 'road') {
      hasViablePlacement = getValidRoadPlacements(player.id, gameState, boardSize).length > 0;
    } else if (committedGoal === 'estate') {
      hasViablePlacement = getPlayerVillages(player.id, gameState).length > 0;
    } else if (committedGoal === 'dev_card') {
      hasViablePlacement = gameState.developmentCardDeck.length > 0;
    }

    if (!hasViablePlacement) {
      console.log(`   ❌ Committed ${committedGoal} goal has no viable placements - clearing goal`);
      goalUpdate = { clearGoal: true, reason: `No viable placements for ${committedGoal}` };
    } else {
      const canAfford = checkCanAffordBuilding(player, committedGoal);
      if (canAfford) {
        const buildPriority = 30;
        console.log(`   ✓ Can now afford committed ${committedGoal}! Adding with priority ${buildPriority} (suppressing trades)`);
        actions.push({
          type: 'build',
          priority: buildPriority,
          data: { buildingType: committedGoal }
        });
        actions.sort((a, b) => b.priority - a.priority);
        const actionSummary = actions.map(a => a.type).join(' → ');
        console.log(`   📋 Final plan (${actions.length} actions): ${actionSummary}`);
        return { actions, reasoning: `${player.name} committed build: ${actionSummary}`, goalUpdate };
      } else {
        const resourcesNeeded = getResourcesNeeded(player, committedGoal);
        console.log(`   ⚠️ Still cannot afford committed ${committedGoal}`);
        console.log(`      Still need: ${resourcesNeeded}`);
      }
    }
  }

  const devCardDecision = shouldPlayDevCardAfterRoll(player, gameState, boardSize, difficulty);
  if (devCardDecision.shouldPlay && devCardDecision.cardId) {
    console.log(`   ✓ Adding dev card play to plan (priority 10)`);
    actions.push({
      type: 'play_dev_card',
      priority: 10,
      data: { cardId: devCardDecision.cardId }
    });
  }

  // If Expert Negotiator is active, force a bank trade with very high priority
  if (gameState.turnState.expertNegotiatorActive) {
    const tradeEval = evaluateTradeOpportunity(player, gameState, boardSize, tradeHistory);
    if (tradeEval.shouldTrade && tradeEval.tradeType === 'bank') {
      console.log(`   ⭐ Expert Negotiator active - forcing bank trade (priority 15)`);
      actions.push({
        type: 'trade_bank',
        priority: 15,
        data: tradeEval
      });
    } else {
      // Expert Negotiator active but normal evaluation didn't find a trade
      // Try with a more aggressive/lenient approach
      console.log(`   ⚠️ Expert Negotiator active but no trade in normal eval - trying aggressive search`);
      const aggressiveTradeEval = evaluateExpertNegotiatorTrade(player, gameState, boardSize);
      if (aggressiveTradeEval.shouldTrade) {
        console.log(`   ✓ Found aggressive Expert Negotiator trade!`);
        actions.push({
          type: 'trade_bank',
          priority: 15,
          data: aggressiveTradeEval
        });
      } else {
        console.log(`   ✗ No viable trades even with Expert Negotiator - card wasted`);
      }
    }
  }

  const buildDecision = makeStrategicBuildDecision(player.id, gameState, boardSize, 0, difficulty);
  if (buildDecision.shouldBuild && buildDecision.buildingType) {
    const buildPriority = calculateBuildPriority(player, gameState, buildDecision.buildingType);
    console.log(`   ✓ Adding ${buildDecision.buildingType} build to plan (priority ${buildPriority})`);
    actions.push({
      type: 'build',
      priority: buildPriority,
      data: { buildingType: buildDecision.buildingType }
    });

    if (buildDecision.buildingType === 'village' || buildDecision.buildingType === 'estate') {
      console.log(`   📊 High-value build detected, checking post-build trade opportunities...`);
      const simulatedResources = simulateResourcesAfterBuild(player.resources, buildDecision.buildingType);
      console.log(`   Simulated resources after ${buildDecision.buildingType}: Clay=${simulatedResources.clay} Lumber=${simulatedResources.lumber} Grain=${simulatedResources.grain} Fabric=${simulatedResources.fabric} Mineral=${simulatedResources.mineral}`);

      const simulatedPlayer = { ...player, resources: simulatedResources };
      const postBuildTradeEval = evaluateTradeOpportunity(simulatedPlayer, gameState, boardSize, tradeHistory);
      if (postBuildTradeEval.shouldTrade) {
        const tradePriority = calculateTradePriority(player, gameState) - 1;
        console.log(`   ✓ Adding post-build ${postBuildTradeEval.tradeType} trade to plan (priority ${tradePriority})`);
        console.log(`     Reason: ${postBuildTradeEval.reasoning}`);
        actions.push({
          type: postBuildTradeEval.tradeType === 'bank' ? 'trade_bank' : 'trade_player',
          priority: tradePriority,
          data: postBuildTradeEval
        });
      }
    }
  }

  if (!buildDecision.shouldBuild || buildDecision.buildingType === 'road') {
    const tradeEval = evaluateTradeOpportunity(player, gameState, boardSize, tradeHistory);
    if (tradeEval.shouldTrade) {
      const tradePriority = calculateTradePriority(player, gameState);
      console.log(`   ✓ Adding ${tradeEval.tradeType} trade to plan (priority ${tradePriority})`);
      console.log(`     Reason: ${tradeEval.reasoning}`);

      // Store the target building goal in the trade data
      // This will be used to set a committed goal after the trade executes
      const tradeData = {
        ...tradeEval,
        targetBuilding: (tradeEval as any).targetBuilding
      };

      actions.push({
        type: tradeEval.tradeType === 'bank' ? 'trade_bank' : 'trade_player',
        priority: tradePriority,
        data: tradeData
      });
    }
  }

  actions.sort((a, b) => b.priority - a.priority);

  const actionSummary = actions.map(a => a.type).join(' → ');
  console.log(`   📋 Final plan (${actions.length} actions): ${actionSummary || 'No actions'}`);

  return {
    actions,
    reasoning: `${player.name} turn plan with ${actions.length} actions: ${actionSummary}`,
    goalUpdate
  };
}

function checkCanAffordBuilding(player: Player, buildingType: 'road' | 'village' | 'estate' | 'dev_card'): boolean {
  switch (buildingType) {
    case 'village':
      return canAffordVillage(player.resources);
    case 'estate':
      return canAffordEstate(player.resources);
    case 'road':
      return canAffordRoad(player.resources);
    case 'dev_card':
      return canAffordDevelopmentCard(player.resources);
    default:
      return false;
  }
}

function getResourcesNeeded(player: Player, buildingType: 'road' | 'village' | 'estate' | 'dev_card'): string {
  const needs: string[] = [];

  switch (buildingType) {
    case 'village':
      if (player.resources.clay < 1) needs.push(`${1 - player.resources.clay} clay`);
      if (player.resources.lumber < 1) needs.push(`${1 - player.resources.lumber} lumber`);
      if (player.resources.grain < 1) needs.push(`${1 - player.resources.grain} grain`);
      if (player.resources.fabric < 1) needs.push(`${1 - player.resources.fabric} fabric`);
      break;
    case 'estate':
      if (player.resources.grain < 2) needs.push(`${2 - player.resources.grain} grain`);
      if (player.resources.mineral < 3) needs.push(`${3 - player.resources.mineral} mineral`);
      break;
    case 'road':
      if (player.resources.clay < 1) needs.push(`${1 - player.resources.clay} clay`);
      if (player.resources.lumber < 1) needs.push(`${1 - player.resources.lumber} lumber`);
      break;
    case 'dev_card':
      if (player.resources.grain < 1) needs.push(`${1 - player.resources.grain} grain`);
      if (player.resources.fabric < 1) needs.push(`${1 - player.resources.fabric} fabric`);
      if (player.resources.mineral < 1) needs.push(`${1 - player.resources.mineral} mineral`);
      break;
  }

  return needs.length > 0 ? needs.join(', ') : 'none';
}

// Aggressive trade search when Expert Negotiator is active
// This uses a lower threshold since the 2:1 rate is guaranteed
function evaluateExpertNegotiatorTrade(player: Player, gameState: GameState, boardSize: BoardSize): TradeEvaluation {
  console.log(`   🔍 Searching for any 2:1 Expert Negotiator trade opportunity...`);

  // Expert Negotiator gives us 4 trades budget, calculate remaining
  const maxTrades = 4;
  const tradesExecuted = (gameState.turnState as any).tradeIterationsForGoal || 0;
  const remainingBudget = maxTrades - tradesExecuted;

  const goals = identifyTradeGoals(player, gameState, boardSize, remainingBudget);
  if (goals.length === 0) {
    return { shouldTrade: false, tradeType: 'bank' };
  }

  const topGoal = goals[0];
  const neededResources = Object.keys(topGoal.neededResources) as ResourceType[];

  // Find ANY resource we have 2+ of that's not critically needed
  const resourceTypes = ['clay', 'lumber', 'grain', 'fabric', 'mineral'] as ResourceType[];

  for (const surplus of resourceTypes) {
    if (player.resources[surplus] >= 2) {
      // Can we trade this for something we need?
      for (const needed of neededResources) {
        if (surplus !== needed) {
          console.log(`      ✓ Found trade: 2x ${surplus} → 1x ${needed} (2:1 Expert Negotiator)`);
          return {
            shouldTrade: true,
            tradeType: 'bank',
            offering: surplus,
            offeringAmount: 2,
            requesting: needed,
            requestingAmount: 1,
            reasoning: `Expert Negotiator 2:1 trade: ${surplus}→${needed} for ${topGoal.targetBuilding}`,
            targetBuilding: topGoal.targetBuilding
          };
        }
      }
    }
  }

  // Still nothing? Just trade ANY resource we have 2+ of for diversity
  for (const surplus of resourceTypes) {
    if (player.resources[surplus] >= 2) {
      // Pick the resource we have the least of
      const scarceResources = resourceTypes
        .filter(r => r !== surplus)
        .sort((a, b) => player.resources[a] - player.resources[b]);

      if (scarceResources.length > 0) {
        const needed = scarceResources[0];
        console.log(`      ✓ Fallback trade for diversity: 2x ${surplus} → 1x ${needed} (2:1 Expert Negotiator)`);
        return {
          shouldTrade: true,
          tradeType: 'bank',
          offering: surplus,
          offeringAmount: 2,
          requesting: needed,
          requestingAmount: 1,
          reasoning: `Expert Negotiator 2:1 diversity trade: ${surplus}→${needed}`,
          targetBuilding: topGoal.targetBuilding
        };
      }
    }
  }

  return { shouldTrade: false, tradeType: 'bank' };
}

function simulateResourcesAfterBuild(resources: Resources, buildingType: 'road' | 'village' | 'estate' | 'dev_card'): Resources {
  const simulated = { ...resources };

  switch (buildingType) {
    case 'village':
      simulated.clay = Math.max(0, simulated.clay - 1);
      simulated.lumber = Math.max(0, simulated.lumber - 1);
      simulated.grain = Math.max(0, simulated.grain - 1);
      simulated.fabric = Math.max(0, simulated.fabric - 1);
      break;
    case 'estate':
      simulated.grain = Math.max(0, simulated.grain - 2);
      simulated.mineral = Math.max(0, simulated.mineral - 3);
      break;
    case 'road':
      simulated.clay = Math.max(0, simulated.clay - 1);
      simulated.lumber = Math.max(0, simulated.lumber - 1);
      break;
    case 'dev_card':
      simulated.grain = Math.max(0, simulated.grain - 1);
      simulated.fabric = Math.max(0, simulated.fabric - 1);
      simulated.mineral = Math.max(0, simulated.mineral - 1);
      break;
  }

  simulated.total = simulated.clay + simulated.lumber + simulated.grain + simulated.fabric + simulated.mineral;
  return simulated;
}

function calculateTradePriority(player: Player, gameState: GameState): number {
  const pointsToWin = gameState.gameSettings.pointsToWin;
  const pointsAway = pointsToWin - (player.score + player.secretPoints);

  if (pointsAway <= 2) {
    return 9;
  } else if (pointsAway <= 4) {
    return 7;
  }

  return 5;
}

function calculateBuildPriority(
  player: Player,
  gameState: GameState,
  buildingType: 'road' | 'village' | 'estate' | 'dev_card'
): number {
  const pointsToWin = gameState.gameSettings.pointsToWin;
  const pointsAway = pointsToWin - (player.score + player.secretPoints);

  let basePriority = 8;

  switch (buildingType) {
    case 'village':
      basePriority = 11;  // Increased from 9
      break;
    case 'estate':
      basePriority = 12;  // Increased from 10
      break;
    case 'road':
      basePriority = 6;
      break;
    case 'dev_card':
      basePriority = 9;   // Increased from 7
      break;
  }

  if (pointsAway <= 2) {
    basePriority += 3;
  } else if (pointsAway <= 4) {
    basePriority += 1;
  }

  return basePriority;
}

export function shouldContinueTurn(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  actionsTaken: number,
  difficulty: 'easy' | 'normal' | 'hard',
  tradeHistory?: TurnTradeHistory
): boolean {
  console.log(`\n🔄 [${player.name}] Checking if should continue turn (${actionsTaken} actions taken)`);

  if (actionsTaken >= 5) {
    console.log(`   ✗ Max actions reached (5)`);
    return false;
  }

  const pointsToWin = gameState.gameSettings.pointsToWin;
  const pointsAway = pointsToWin - (player.score + player.secretPoints);

  if (pointsAway <= 1) {
    const shouldContinue = actionsTaken < 8;
    console.log(`   ${shouldContinue ? '✓' : '✗'} Close to winning (${pointsAway} away), max 8 actions`);
    return shouldContinue;
  } else if (pointsAway <= 3) {
    const shouldContinue = actionsTaken < 6;
    console.log(`   ${shouldContinue ? '✓' : '✗'} Approaching win (${pointsAway} away), max 6 actions`);
    return shouldContinue;
  }

  const buildDecision = makeStrategicBuildDecision(player.id, gameState, boardSize, actionsTaken, difficulty);
  if (buildDecision.shouldBuild) {
    console.log(`   ✓ Can still build: ${buildDecision.buildingType}`);
    return true;
  }

  // Vary trade action limits by difficulty: easy=2, normal=3, hard=4
  const maxTradeActions = difficulty === 'hard' ? 4 : difficulty === 'normal' ? 3 : 2;

  // Check if there's a committed building goal from successful trades
  const committedGoal = gameState.turnState.committedBuildingGoal;
  const tradeIterations = gameState.turnState.tradeIterationsForGoal || 0;

  if (committedGoal && tradeIterations > 0) {
    console.log(`   📍 Committed to building: ${committedGoal} (${tradeIterations} trades executed)`);

    // FIRST check if we can now afford the committed goal
    const canAfford = checkCanAffordBuilding(player, committedGoal);
    if (canAfford) {
      console.log(`   ✓ Can NOW AFFORD committed goal ${committedGoal} - continuing turn to build!`);
      return true;
    }

    // If we have a committed goal but still can't afford it, allow more trade attempts
    const maxCommittedTradeIterations = difficulty === 'hard' ? 5 : difficulty === 'normal' ? 4 : 3;

    if (tradeIterations >= maxCommittedTradeIterations) {
      console.log(`   ✗ Max committed goal trade iterations reached (${maxCommittedTradeIterations})`);
      // Clear the committed goal - it's not achievable
      console.log(`   🔄 CLEARING unachievable committed goal: ${committedGoal}`);
      gameState.turnState.committedBuildingGoal = undefined;
      gameState.turnState.tradeIterationsForGoal = 0;
    } else {
      const tradeEval = evaluateTradeOpportunity(player, gameState, boardSize, tradeHistory);
      if (tradeEval.shouldTrade) {
        console.log(`   ✓ Continuing trades toward committed goal: ${committedGoal}`);
        return true;
      } else {
        // No more trades available for this goal - check if goal is still achievable
        console.log(`   ⚠️ No more trades available for committed goal ${committedGoal}`);
        console.log(`   🔄 CLEARING unachievable committed goal and looking for alternatives`);
        gameState.turnState.committedBuildingGoal = undefined;
        gameState.turnState.tradeIterationsForGoal = 0;

        // Calculate remaining trade budget for alternative goals
        const tradesExecutedCount = tradeHistory?.tradesExecuted.length || 0;
        const pointsAway = gameState.gameSettings.pointsToWin - (player.score + player.secretPoints);
        const expertNegotiatorActive = gameState.turnState.expertNegotiatorActive;
        const maxTradesAllowed = expertNegotiatorActive ? 4 : (pointsAway <= 2 ? 5 : 3);
        const remainingTradeBudget = maxTradesAllowed - tradesExecutedCount;

        // Try to find a new achievable goal
        const goals = identifyTradeGoals(player, gameState, boardSize, remainingTradeBudget);
        const achievableGoals = goals.filter(g =>
          g.hasViablePlacement !== false &&
          g.achievableThisTurn === true
        );

        if (achievableGoals.length > 0) {
          console.log(`   ✓ Found ${achievableGoals.length} achievable alternative goals:`);
          achievableGoals.forEach((g, idx) => {
            console.log(`      ${idx + 1}. ${g.targetBuilding} (${g.tradeSequenceSteps} steps, priority ${g.priority})`);
          });

          // Check if we can build something immediately
          const canBuildNow = achievableGoals.find(g => Object.keys(g.neededResources).length === 0);
          if (canBuildNow) {
            console.log(`   ✓ Can build ${canBuildNow.targetBuilding} immediately!`);
            return true;
          }

          // Otherwise try to trade toward the new goal
          const newTradeEval = evaluateTradeOpportunity(player, gameState, boardSize, tradeHistory);
          if (newTradeEval.shouldTrade) {
            console.log(`   ✓ Switching to new achievable goal: ${newTradeEval.reasoning}`);
            return true;
          }
        }
      }
    }
  }

  const tradeEval = evaluateTradeOpportunity(player, gameState, boardSize, tradeHistory);
  if (tradeEval.shouldTrade && actionsTaken < maxTradeActions) {
    // Calculate remaining trade budget
    const tradesExecutedCount = tradeHistory?.tradesExecuted.length || 0;
    const pointsAway = gameState.gameSettings.pointsToWin - (player.score + player.secretPoints);
    const expertNegotiatorActive = gameState.turnState.expertNegotiatorActive;
    const maxTradesAllowed = expertNegotiatorActive ? 4 : (pointsAway <= 2 ? 5 : 3);
    const remainingTradeBudget = maxTradesAllowed - tradesExecutedCount;

    // Validate that the trade goal has viable placement
    const goals = identifyTradeGoals(player, gameState, boardSize, remainingTradeBudget);
    const viableGoals = goals.filter(g => g.hasViablePlacement !== false);

    if (viableGoals.length > 0) {
      console.log(`   ✓ Can still trade toward viable goal: ${tradeEval.reasoning}`);
      return true;
    } else {
      console.log(`   ✗ Trade available but NO VIABLE BUILDING PLACEMENTS`);
      return false;
    }
  }

  console.log(`   ✗ No more beneficial actions available`);
  return false;
}

