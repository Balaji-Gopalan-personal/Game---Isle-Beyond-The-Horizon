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
  console.log(`\n💱 [${player.name}] EVALUATING TRADE OPPORTUNITIES`);

  const goals = identifyTradeGoals(player, gameState);

  if (goals.length === 0) {
    console.log(`   ✗ No trade goals identified`);
    return { shouldTrade: false, tradeType: 'bank', reasoning: 'No immediate building goals' };
  }

  const topGoal = goals[0];
  console.log(`   Top goal: ${topGoal.targetBuilding} (priority ${topGoal.priority})`);
  const neededList = Object.entries(topGoal.neededResources).map(([r, amt]) => `${amt} ${r}`).join(', ');
  console.log(`   Needs: ${neededList}`);

  const bestPlayerTrade = findBestPlayerTrade(player, gameState, topGoal);
  if (bestPlayerTrade) {
    console.log(`   ✓ Found P2P trade opportunity: ${bestPlayerTrade.offeringAmount}x ${bestPlayerTrade.offering} → ${bestPlayerTrade.requesting}`);
    console.log(`   Reason: ${bestPlayerTrade.reasoning}`);
    return bestPlayerTrade;
  }

  const bestBankTrade = findBestBankTrade(player, gameState, topGoal);
  if (bestBankTrade) {
    console.log(`   ✓ Found bank trade: ${bestBankTrade.offeringAmount}x ${bestBankTrade.offering} → ${bestBankTrade.requesting}`);
    console.log(`   Reason: ${bestBankTrade.reasoning}`);
    return bestBankTrade;
  }

  console.log(`   ✗ No beneficial trades available`);
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

function findBestPlayerTrade(
  player: Player,
  gameState: GameState,
  goal: TradeGoal
): TradeEvaluation | null {
  const neededResources = Object.keys(goal.neededResources) as ResourceType[];
  const surplus = getSurplusResources(player.resources);

  if (surplus.length === 0 || neededResources.length === 0) {
    return null;
  }

  for (const surplusResource of surplus) {
    for (const neededResource of neededResources) {
      if (player.resources[surplusResource] >= 2) {
        return {
          shouldTrade: true,
          tradeType: 'player',
          offering: surplusResource,
          offeringAmount: 2,
          requesting: neededResource,
          reasoning: `P2P trade: 2 ${surplusResource} for 1 ${neededResource} to build ${goal.targetBuilding}`
        };
      }
    }
  }

  return null;
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

  const nearVillage = resources.clay >= 1 && resources.lumber >= 1 &&
                       resources.grain >= 1 && resources.fabric >= 1;
  const nearEstate = resources.grain >= 2 && resources.mineral >= 3;

  (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as ResourceType[]).forEach(resource => {
    let keepThreshold = 2;

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

    if (resources[resource] > keepThreshold + 1) {
      surplus.push(resource);
    }
  });

  return surplus;
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
    return false;
  }

  const surplus = getSurplusResources(player.resources);
  return surplus.length > 0 && Math.random() < 0.6;
}
