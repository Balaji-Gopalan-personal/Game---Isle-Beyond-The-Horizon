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
  reasoning?: string;
}

export function evaluateTradeOpportunity(
  player: Player,
  gameState: GameState
): TradeEvaluation {
  const goals = identifyTradeGoals(player, gameState);

  if (goals.length === 0) {
    return { shouldTrade: false, tradeType: 'bank', reasoning: 'No immediate building goals' };
  }

  const topGoal = goals[0];

  const bestBankTrade = findBestBankTrade(player, gameState, topGoal);
  if (bestBankTrade) {
    return bestBankTrade;
  }

  return { shouldTrade: false, tradeType: 'bank', reasoning: 'No beneficial trades available' };
}

function identifyTradeGoals(player: Player, gameState: GameState): TradeGoal[] {
  const goals: TradeGoal[] = [];

  const villageNeeds = calculateResourceNeeds(player.resources, {
    clay: 1,
    lumber: 1,
    grain: 1,
    fabric: 1,
    mineral: 0,
    total: 4
  });

  if (Object.keys(villageNeeds).length > 0 && Object.keys(villageNeeds).length <= 2) {
    goals.push({
      targetBuilding: 'village',
      neededResources: villageNeeds,
      priority: 10
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

  if (Object.keys(estateNeeds).length > 0 && Object.keys(estateNeeds).length <= 2) {
    goals.push({
      targetBuilding: 'estate',
      neededResources: estateNeeds,
      priority: 12
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

  if (Object.keys(roadNeeds).length > 0 && Object.keys(roadNeeds).length <= 1) {
    goals.push({
      targetBuilding: 'road',
      neededResources: roadNeeds,
      priority: 6
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

  if (Object.keys(devCardNeeds).length > 0 && Object.keys(devCardNeeds).length <= 2) {
    goals.push({
      targetBuilding: 'dev_card',
      neededResources: devCardNeeds,
      priority: 8
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

function findBestBankTrade(
  player: Player,
  gameState: GameState,
  goal: TradeGoal
): TradeEvaluation | null {
  const neededResources = Object.keys(goal.neededResources) as ResourceType[];
  const surplus = getSurplusResources(player.resources);

  if (surplus.length === 0 || neededResources.length === 0) {
    return null;
  }

  let bestTrade: TradeEvaluation | null = null;
  let bestTradeEfficiency = Infinity;

  for (const surplusResource of surplus) {
    const tradeRate = getBestTradeRateForResource(player.id, surplusResource, gameState);

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
    }
  }

  return bestTrade;
}

function getSurplusResources(resources: Resources): ResourceType[] {
  const surplus: ResourceType[] = [];
  const keepThreshold = 2;

  (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as ResourceType[]).forEach(resource => {
    if (resources[resource] > keepThreshold) {
      surplus.push(resource);
    }
  });

  return surplus;
}

export function evaluatePlayerTradeProposal(
  proposal: {
    offeredResources: Resources;
    requestedResources: Resources;
  },
  player: Player,
  gameState: GameState
): boolean {
  const netGain = calculateTradeValue(proposal.offeredResources, proposal.requestedResources, player, gameState);

  if (netGain > 0) {
    const canAfford = canAffordProposal(proposal.offeredResources, player.resources);
    return canAfford;
  }

  return false;
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
  if (attemptsThisTurn >= 2) {
    return false;
  }

  const goals = identifyTradeGoals(player, gameState);
  if (goals.length === 0) {
    return false;
  }

  const bankTradeAvailable = findBestBankTrade(player, gameState, goals[0]);
  if (bankTradeAvailable) {
    return false;
  }

  const surplus = getSurplusResources(player.resources);
  return surplus.length > 0 && Math.random() < 0.35;
}
