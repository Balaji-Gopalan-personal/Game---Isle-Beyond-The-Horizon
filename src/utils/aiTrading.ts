import { GameState, Player, Resources } from '../types/game';
import { ResourceType, getBestTradeRateForResource } from './tradingUtils';

export interface ResourcePriority {
  resource: ResourceType;
  priority: number;
  deficit: number;
}

const BASE_BANK_TRADE_PROBABILITY = 0.4;
const PROBABILITY_DECAY_PER_ATTEMPT = 0.15;
const MAX_TRADE_ATTEMPTS_PER_TURN = 3;

const BASE_PLAYER_TRADE_PROBABILITY = 0.35;
const MAX_PLAYER_TRADE_ATTEMPTS_PER_TURN = 2;

export function shouldAttemptBankTrade(
  player: Player,
  gameState: GameState,
  attemptsThisTurn: number
): boolean {
  if (attemptsThisTurn >= MAX_TRADE_ATTEMPTS_PER_TURN) {
    return false;
  }

  const adjustedProbability = BASE_BANK_TRADE_PROBABILITY - (attemptsThisTurn * PROBABILITY_DECAY_PER_ATTEMPT);

  return Math.random() < adjustedProbability;
}

export function shouldAttemptPlayerTrade(
  player: Player,
  gameState: GameState,
  attemptsThisTurn: number
): boolean {
  if (attemptsThisTurn >= MAX_PLAYER_TRADE_ATTEMPTS_PER_TURN) {
    return false;
  }

  return Math.random() < BASE_PLAYER_TRADE_PROBABILITY;
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
  gameState: GameState
): { offeringResource: ResourceType; offeringAmount: number; requestedResource: ResourceType } | null {
  const priorities = assessResourceNeeds(player);
  if (priorities.length === 0) return null;

  const mostNeededResource = priorities[0].resource;

  const availableResources = getResourcesAvailableForTrade(player);
  if (availableResources.length === 0) return null;

  let bestTrade: { offeringResource: ResourceType; offeringAmount: number; requestedResource: ResourceType } | null = null;
  let bestRateValue = Infinity;

  for (const offeringResource of availableResources) {
    const tradeRate = getBestTradeRateForResource(player.id, offeringResource, gameState);

    if (player.resources[offeringResource] >= tradeRate.rate) {
      if (tradeRate.rate < bestRateValue) {
        bestRateValue = tradeRate.rate;
        bestTrade = {
          offeringResource,
          offeringAmount: tradeRate.rate,
          requestedResource: mostNeededResource
        };
      }
    }
  }

  return bestTrade;
}

export function generatePlayerTradeProposal(
  player: Player,
  gameState: GameState,
  failedProposalsThisTurn: Set<string>
): { offeredResources: any; requestedResources: any } | null {
  const priorities = assessResourceNeeds(player);
  if (priorities.length === 0) return null;

  const availableResources = getResourcesAvailableForTrade(player);
  if (availableResources.length === 0) return null;

  const mostNeededResource = priorities[0].resource;

  for (const offeringResource of availableResources) {
    const proposalKey = `${offeringResource}->${mostNeededResource}`;

    if (failedProposalsThisTurn.has(proposalKey)) {
      continue;
    }

    const offerAmount = Math.min(2, player.resources[offeringResource] - 1);
    if (offerAmount > 0) {
      const offeredResources = {
        clay: 0,
        lumber: 0,
        grain: 0,
        fabric: 0,
        mineral: 0,
        [offeringResource]: offerAmount
      };

      const requestedResources = {
        clay: 0,
        lumber: 0,
        grain: 0,
        fabric: 0,
        mineral: 0,
        [mostNeededResource]: 1
      };

      return { offeredResources, requestedResources };
    }
  }

  return null;
}

export function getTradeProposalKey(
  offeredResources: any,
  requestedResources: any
): string {
  const offered = Object.entries(offeredResources)
    .filter(([_, amount]) => (amount as number) > 0)
    .map(([resource]) => resource)
    .join(',');

  const requested = Object.entries(requestedResources)
    .filter(([_, amount]) => (amount as number) > 0)
    .map(([resource]) => resource)
    .join(',');

  return `${offered}->${requested}`;
}
