import { GameState, Player, Resources, BoardSize } from '../types/game';
import { ResourceType, getBestTradeRateForResource } from './tradingUtils';
import { evaluateTradeOpportunity, evaluatePlayerTradeProposal, shouldInitiatePlayerTrade, identifyTradeGoals, getAllRankedPlayerTrades } from '../engine/aiTradingStrategy';

export interface ResourcePriority {
  resource: ResourceType;
  priority: number;
  deficit: number;
}

const BASE_BANK_TRADE_PROBABILITY = 0.5;
const PROBABILITY_DECAY_PER_ATTEMPT = 0.15;
const MAX_TRADE_ATTEMPTS_PER_TURN = 3;

const BASE_PLAYER_TRADE_PROBABILITY = 0.35;
const MAX_PLAYER_TRADE_ATTEMPTS_PER_TURN = 5;

export function shouldAttemptBankTrade(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  attemptsThisTurn: number
): boolean {
  if (attemptsThisTurn >= MAX_TRADE_ATTEMPTS_PER_TURN) {
    return false;
  }

  const tradeEval = evaluateTradeOpportunity(player, gameState, boardSize);
  if (tradeEval.shouldTrade && tradeEval.tradeType === 'bank') {
    return true;
  }

  const totalResources = player.resources.total;
  const discardRiskThreshold = 7;
  if (totalResources >= discardRiskThreshold) {
    const hasExcessResources = Object.entries(player.resources)
      .filter(([key]) => key !== 'total')
      .some(([_, amount]) => (amount as number) > 3);

    if (hasExcessResources) {
      const adjustedProbability = 0.7 - (attemptsThisTurn * PROBABILITY_DECAY_PER_ATTEMPT);
      return Math.random() < adjustedProbability;
    }
  }

  return false;
}

export function shouldAttemptPlayerTrade(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  attemptsThisTurn: number
): boolean {
  if (attemptsThisTurn >= MAX_PLAYER_TRADE_ATTEMPTS_PER_TURN) {
    return false;
  }

  return shouldInitiatePlayerTrade(player, gameState, boardSize, attemptsThisTurn);
}

export function assessResourceNeeds(player: Player): ResourcePriority[] {
  const priorities: ResourcePriority[] = [];

  const roadCost = { lumber: 1, clay: 1 };
  const villageCost = { lumber: 1, clay: 1, grain: 1, fabric: 1 };
  const estateCost = { grain: 2, mineral: 3 };
  const devCardCost = { grain: 1, fabric: 1, mineral: 1 };

  const needsForVillage = {
    lumber: Math.max(0, villageCost.lumber - player.resources.lumber),
    clay: Math.max(0, villageCost.clay - player.resources.clay),
    grain: Math.max(0, villageCost.grain - player.resources.grain),
    fabric: Math.max(0, villageCost.fabric - player.resources.fabric),
    mineral: 0
  };

  const needsForEstate = {
    lumber: 0,
    clay: 0,
    grain: Math.max(0, estateCost.grain - player.resources.grain),
    fabric: 0,
    mineral: Math.max(0, estateCost.mineral - player.resources.mineral)
  };

  const needsForRoad = {
    lumber: Math.max(0, roadCost.lumber - player.resources.lumber),
    clay: Math.max(0, roadCost.clay - player.resources.clay),
    grain: 0,
    fabric: 0,
    mineral: 0
  };

  const combinedNeeds = {
    lumber: needsForVillage.lumber + needsForRoad.lumber,
    clay: needsForVillage.clay + needsForRoad.clay,
    grain: needsForVillage.grain + needsForEstate.grain,
    fabric: needsForVillage.fabric,
    mineral: needsForEstate.mineral
  };

  (['lumber', 'clay', 'grain', 'fabric', 'mineral'] as ResourceType[]).forEach(resource => {
    const deficit = combinedNeeds[resource];
    if (deficit > 0) {
      priorities.push({
        resource,
        priority: deficit * 2,
        deficit
      });
    } else if (player.resources[resource] === 0) {
      priorities.push({
        resource,
        priority: 1,
        deficit: 0
      });
    }
  });

  priorities.sort((a, b) => b.priority - a.priority);

  return priorities;
}

export function getResourcesAvailableForTrade(player: Player): ResourceType[] {
  const available: ResourceType[] = [];
  const minKeepAmount = 1;

  (['lumber', 'clay', 'grain', 'fabric', 'mineral'] as ResourceType[]).forEach(resource => {
    if (player.resources[resource] > minKeepAmount + 1) {
      available.push(resource);
    }
  });

  return available;
}

export function selectBankTradeResources(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize
): { offeringResource: ResourceType; offeringAmount: number; requestedResource: ResourceType } | null {
  const tradeEval = evaluateTradeOpportunity(player, gameState, boardSize);

  if (tradeEval.shouldTrade && tradeEval.tradeType === 'bank' && tradeEval.offering && tradeEval.requesting && tradeEval.offeringAmount) {
    return {
      offeringResource: tradeEval.offering,
      offeringAmount: tradeEval.offeringAmount,
      requestedResource: tradeEval.requesting
    };
  }

  const totalResources = player.resources.total;
  const discardRiskThreshold = 7;
  if (totalResources >= discardRiskThreshold) {
    const availableResources = getResourcesAvailableForTrade(player);
    if (availableResources.length === 0) return null;

    let excessResource: ResourceType | null = null;
    let maxAmount = 0;

    (['lumber', 'clay', 'grain', 'fabric', 'mineral'] as ResourceType[]).forEach(resource => {
      if (player.resources[resource] > maxAmount) {
        maxAmount = player.resources[resource];
        excessResource = resource;
      }
    });

    if (excessResource && maxAmount > 3) {
      const tradeRate = getBestTradeRateForResource(player.id, excessResource, gameState);

      const priorities = assessResourceNeeds(player);
      const targetResource = priorities.length > 0 ? priorities[0].resource :
        (['lumber', 'clay', 'grain', 'fabric', 'mineral'] as ResourceType[]).find(r => player.resources[r] === 0) ||
        'grain';

      if (player.resources[excessResource] >= tradeRate.rate) {
        return {
          offeringResource: excessResource,
          offeringAmount: tradeRate.rate,
          requestedResource: targetResource
        };
      }
    }
  }

  return null;
}

export function generatePlayerTradeProposal(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  failedProposalsThisTurn: Set<string>
): { offeredResources: any; requestedResources: any; targetBuilding: 'village' | 'estate' | 'road' | 'dev_card' } | null {
  // Calculate remaining trade budget for goal evaluation
  const pointsAway = gameState.gameSettings.pointsToWin - (player.score + player.secretPoints);
  const expertNegotiatorActive = gameState.turnState.expertNegotiatorActive;
  const maxTradesAllowed = expertNegotiatorActive ? 4 : (pointsAway <= 2 ? 5 : 3);
  const tradesExecutedCount = failedProposalsThisTurn.size; // Rough estimate
  const remainingTradeBudget = Math.max(1, maxTradesAllowed - tradesExecutedCount);

  const goals = identifyTradeGoals(player, gameState, boardSize, remainingTradeBudget);

  if (goals.length === 0) {
    console.log(`   ✗ No trade goals for player trade proposal`);
    return null;
  }

  const topGoal = goals[0];
  const rankedTrades = getAllRankedPlayerTrades(player, gameState, boardSize, topGoal);

  if (rankedTrades.length === 0) {
    console.log(`   ✗ No viable ranked trades available`);
    return null;
  }

  console.log(`   📊 Generated ${rankedTrades.length} ranked trade options (filtering out ${failedProposalsThisTurn.size} failed proposals)`);

  for (const trade of rankedTrades) {
    const proposalKey = `${trade.offeringAmount}${trade.offering}->${trade.requestingAmount}${trade.requesting}`;

    if (!failedProposalsThisTurn.has(proposalKey)) {
      const offeredResources = {
        clay: 0,
        lumber: 0,
        grain: 0,
        fabric: 0,
        mineral: 0,
        [trade.offering]: trade.offeringAmount
      };

      const requestedResources = {
        clay: 0,
        lumber: 0,
        grain: 0,
        fabric: 0,
        mineral: 0,
        [trade.requesting]: trade.requestingAmount
      };

      console.log(`   ✓ Selected P2P trade: ${trade.offeringAmount} ${trade.offering} for ${trade.requestingAmount} ${trade.requesting} (fairness: ${trade.fairness.toFixed(2)}, score: ${trade.score.toFixed(1)}) for ${topGoal.targetBuilding}`);
      return { offeredResources, requestedResources, targetBuilding: topGoal.targetBuilding };
    } else {
      console.log(`   ⊗ Skipping already-attempted trade: ${trade.offeringAmount} ${trade.offering} for ${trade.requestingAmount} ${trade.requesting}`);
    }
  }

  console.log(`   ✗ All viable trades have been attempted`);
  return null;
}

export function getTradeProposalKey(
  offeredResources: any,
  requestedResources: any
): string {
  const offeredParts = Object.entries(offeredResources)
    .filter(([_, amount]) => (amount as number) > 0)
    .map(([resource, amount]) => `${amount}${resource}`)
    .join(',');

  const requestedParts = Object.entries(requestedResources)
    .filter(([_, amount]) => (amount as number) > 0)
    .map(([resource, amount]) => `${amount}${resource}`)
    .join(',');

  return `${offeredParts}->${requestedParts}`;
}
