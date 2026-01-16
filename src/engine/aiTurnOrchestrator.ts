import { GameState, Player } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { shouldPlayDevCardBeforeRoll, shouldPlayDevCardAfterRoll } from './aiDevCardStrategy';
import { evaluateTradeOpportunity } from './aiTradingStrategy';
import { makeStrategicBuildDecision } from './aiBuilding';

export interface TurnAction {
  type: 'play_dev_card' | 'trade_bank' | 'trade_player' | 'build' | 'end_turn';
  priority: number;
  data?: any;
}

export interface TurnPlan {
  actions: TurnAction[];
  reasoning: string;
}

export function createTurnPlan(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  difficulty: 'easy' | 'normal' | 'hard'
): TurnPlan {
  const pointsAway = gameState.gameSettings.pointsToWin - (player.score + player.secretPoints);
  console.log(`\n🎯 [${player.name}] CREATING TURN PLAN`);
  console.log(`   Points to win: ${pointsAway} | Score: ${player.score} | Secret: ${player.secretPoints}`);
  console.log(`   Resources: Clay=${player.resources.clay} Lumber=${player.resources.lumber} Grain=${player.resources.grain} Fabric=${player.resources.fabric} Mineral=${player.resources.mineral}`);

  const actions: TurnAction[] = [];

  const devCardDecision = shouldPlayDevCardAfterRoll(player, gameState, boardSize, difficulty);
  if (devCardDecision.shouldPlay && devCardDecision.cardId) {
    console.log(`   ✓ Adding dev card play to plan (priority 10)`);
    actions.push({
      type: 'play_dev_card',
      priority: 10,
      data: { cardId: devCardDecision.cardId }
    });
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
      const postBuildTradeEval = evaluateTradeOpportunity(simulatedPlayer, gameState);
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
    const tradeEval = evaluateTradeOpportunity(player, gameState);
    if (tradeEval.shouldTrade) {
      const tradePriority = calculateTradePriority(player, gameState);
      console.log(`   ✓ Adding ${tradeEval.tradeType} trade to plan (priority ${tradePriority})`);
      console.log(`     Reason: ${tradeEval.reasoning}`);
      actions.push({
        type: tradeEval.tradeType === 'bank' ? 'trade_bank' : 'trade_player',
        priority: tradePriority,
        data: tradeEval
      });
    }
  }

  actions.sort((a, b) => b.priority - a.priority);

  const actionSummary = actions.map(a => a.type).join(' → ');
  console.log(`   📋 Final plan (${actions.length} actions): ${actionSummary || 'No actions'}`);

  return {
    actions,
    reasoning: `${player.name} turn plan with ${actions.length} actions: ${actionSummary}`
  };
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
  difficulty: 'easy' | 'normal' | 'hard'
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

  const tradeEval = evaluateTradeOpportunity(player, gameState);
  if (tradeEval.shouldTrade && actionsTaken < 3) {
    console.log(`   ✓ Can still trade: ${tradeEval.reasoning}`);
    return true;
  }

  console.log(`   ✗ No more beneficial actions available`);
  return false;
}

export function optimizeActionOrder(
  actions: TurnAction[],
  player: Player,
  gameState: GameState
): TurnAction[] {
  const orderedActions: TurnAction[] = [];

  const devCardActions = actions.filter(a => a.type === 'play_dev_card');
  orderedActions.push(...devCardActions);

  const tradeActions = actions.filter(a => a.type === 'trade_bank' || a.type === 'trade_player');

  const buildActions = actions.filter(a => a.type === 'build');

  const pointsToWin = gameState.gameSettings.pointsToWin;
  const pointsAway = pointsToWin - (player.score + player.secretPoints);

  if (pointsAway <= 2) {
    orderedActions.push(...buildActions);
    orderedActions.push(...tradeActions);
  } else {
    orderedActions.push(...tradeActions);
    orderedActions.push(...buildActions);
  }

  return orderedActions;
}

export function evaluateTurnEfficiency(
  actionsTaken: number,
  resourcesSpent: number,
  pointsGained: number
): number {
  if (actionsTaken === 0) return 0;

  const efficiency = (pointsGained * 10 + resourcesSpent) / actionsTaken;
  return efficiency;
}
