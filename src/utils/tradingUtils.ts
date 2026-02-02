import { GameState, TradingPort, Player, Resources } from '../types/game';

export type ResourceType = 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral';

export interface TradeRate {
  rate: number;
  type: 'standard' | 'generic_port' | 'specific_port' | 'expert_negotiator';
  resourceType?: ResourceType;
}

export function getPlayerTradingPorts(
  playerId: string,
  gameState: GameState
): TradingPort[] {
  if (!gameState.tradingPorts || !gameState.gameSettings.tradingPortsEnabled) {
    return [];
  }

  const playerVertices = new Set<number>();

  gameState.villages.forEach(village => {
    if (village.playerId === playerId) {
      playerVertices.add(village.vertexId);
    }
  });

  const accessiblePorts: TradingPort[] = [];

  gameState.tradingPorts.forEach(port => {
    const hasAccess = port.vertices.some(vertexId => playerVertices.has(vertexId));
    if (hasAccess) {
      accessiblePorts.push(port);
    }
  });

  return accessiblePorts;
}

export function getBestTradeRateForResource(
  playerId: string,
  resourceType: ResourceType,
  gameState: GameState
): TradeRate {
  const expertNegotiatorActive = gameState.turnState.expertNegotiatorActive === true;

  if (expertNegotiatorActive) {
    return {
      rate: 2,
      type: 'expert_negotiator'
    };
  }

  const accessiblePorts = getPlayerTradingPorts(playerId, gameState);

  const specificPort = accessiblePorts.find(port => port.type === resourceType);
  if (specificPort) {
    return {
      rate: 2,
      type: 'specific_port',
      resourceType
    };
  }

  const genericPort = accessiblePorts.find(port => port.type === 'generic');
  if (genericPort) {
    return {
      rate: 3,
      type: 'generic_port'
    };
  }

  return {
    rate: 4,
    type: 'standard'
  };
}

export function getAllAvailableTradeRates(
  playerId: string,
  gameState: GameState
): Record<ResourceType, TradeRate> {
  const resourceTypes: ResourceType[] = ['clay', 'lumber', 'grain', 'fabric', 'mineral'];
  const rates: Record<string, TradeRate> = {};

  resourceTypes.forEach(resourceType => {
    rates[resourceType] = getBestTradeRateForResource(playerId, resourceType, gameState);
  });

  return rates as Record<ResourceType, TradeRate>;
}

export function canExecuteBankTrade(
  playerId: string,
  offeringResource: ResourceType,
  offeringAmount: number,
  requestedResource: ResourceType,
  requestedAmount: number,
  gameState: GameState
): { valid: boolean; reason?: string } {
  if (offeringResource === requestedResource) {
    return { valid: false, reason: 'Cannot trade same resource type' };
  }

  if (requestedAmount < 1) {
    return { valid: false, reason: 'Must request at least 1 resource' };
  }

  const player = gameState.players.find(p => p.id === playerId);
  if (!player) {
    return { valid: false, reason: 'Player not found' };
  }

  if (player.resources[offeringResource] < offeringAmount) {
    return { valid: false, reason: `Insufficient ${offeringResource}` };
  }

  const bestRate = getBestTradeRateForResource(playerId, offeringResource, gameState);

  if (offeringAmount < bestRate.rate) {
    return {
      valid: false,
      reason: `Minimum ${bestRate.rate} ${offeringResource} required for this trade rate`
    };
  }

  if (offeringAmount % bestRate.rate !== 0) {
    return {
      valid: false,
      reason: `Offering amount must be a multiple of ${bestRate.rate}`
    };
  }

  // Validate that the requested amount matches the exchange rate
  const expectedRequestedAmount = offeringAmount / bestRate.rate;
  if (requestedAmount !== expectedRequestedAmount) {
    return {
      valid: false,
      reason: `At ${bestRate.rate}:1 rate, ${offeringAmount} ${offeringResource} trades for ${expectedRequestedAmount} ${requestedResource}`
    };
  }

  return { valid: true };
}

export function executeBankTrade(
  playerId: string,
  offeringResource: ResourceType,
  offeringAmount: number,
  requestedResource: ResourceType,
  requestedAmount: number,
  gameState: GameState
): GameState {
  const newPlayers = gameState.players.map(p => {
    if (p.id === playerId) {
      const newResources = {
        ...p.resources,
        [offeringResource]: p.resources[offeringResource] - offeringAmount,
        [requestedResource]: p.resources[requestedResource] + requestedAmount
      };
      newResources.total = newResources.clay + newResources.lumber + newResources.grain +
                          newResources.fabric + newResources.mineral;

      return {
        ...p,
        resources: newResources
      };
    }
    return p;
  });

  return {
    ...gameState,
    players: newPlayers
  };
}

export function executePlayerTrade(
  proposingPlayerId: string,
  acceptingPlayerId: string,
  offeredResources: { clay: number; lumber: number; grain: number; fabric: number; mineral: number },
  requestedResources: { clay: number; lumber: number; grain: number; fabric: number; mineral: number },
  gameState: GameState
): GameState {
  const newPlayers = gameState.players.map(p => {
    if (p.id === proposingPlayerId) {
      const newResources = {
        clay: p.resources.clay - offeredResources.clay + requestedResources.clay,
        lumber: p.resources.lumber - offeredResources.lumber + requestedResources.lumber,
        grain: p.resources.grain - offeredResources.grain + requestedResources.grain,
        fabric: p.resources.fabric - offeredResources.fabric + requestedResources.fabric,
        mineral: p.resources.mineral - offeredResources.mineral + requestedResources.mineral,
        total: 0
      };
      newResources.total = newResources.clay + newResources.lumber + newResources.grain +
                          newResources.fabric + newResources.mineral;

      return {
        ...p,
        resources: newResources
      };
    }

    if (p.id === acceptingPlayerId) {
      const newResources = {
        clay: p.resources.clay + offeredResources.clay - requestedResources.clay,
        lumber: p.resources.lumber + offeredResources.lumber - requestedResources.lumber,
        grain: p.resources.grain + offeredResources.grain - requestedResources.grain,
        fabric: p.resources.fabric + offeredResources.fabric - requestedResources.fabric,
        mineral: p.resources.mineral + offeredResources.mineral - requestedResources.mineral,
        total: 0
      };
      newResources.total = newResources.clay + newResources.lumber + newResources.grain +
                          newResources.fabric + newResources.mineral;

      return {
        ...p,
        resources: newResources
      };
    }

    return p;
  });

  return {
    ...gameState,
    players: newPlayers
  };
}

export function canProposePlayerTrade(
  playerId: string,
  offeredResources: { clay: number; lumber: number; grain: number; fabric: number; mineral: number },
  requestedResources: { clay: number; lumber: number; grain: number; fabric: number; mineral: number },
  gameState: GameState
): { valid: boolean; reason?: string } {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) {
    return { valid: false, reason: 'Player not found' };
  }

  const totalOffered = offeredResources.clay + offeredResources.lumber +
                       offeredResources.grain + offeredResources.fabric +
                       offeredResources.mineral;

  const totalRequested = requestedResources.clay + requestedResources.lumber +
                         requestedResources.grain + requestedResources.fabric +
                         requestedResources.mineral;

  if (totalOffered === 0) {
    return { valid: false, reason: 'Must offer at least one resource' };
  }

  if (totalRequested === 0) {
    return { valid: false, reason: 'Must request at least one resource' };
  }

  if (player.resources.clay < offeredResources.clay ||
      player.resources.lumber < offeredResources.lumber ||
      player.resources.grain < offeredResources.grain ||
      player.resources.fabric < offeredResources.fabric ||
      player.resources.mineral < offeredResources.mineral) {
    return { valid: false, reason: 'Insufficient resources' };
  }

  return { valid: true };
}

export function getTradeRateDisplay(rate: TradeRate): string {
  if (rate.type === 'expert_negotiator') {
    return '2:1 (Expert Negotiator)';
  }
  if (rate.type === 'specific_port') {
    return `2:1 (${rate.resourceType} port)`;
  }
  if (rate.type === 'generic_port') {
    return '3:1 (Generic port)';
  }
  return '4:1 (Standard)';
}
