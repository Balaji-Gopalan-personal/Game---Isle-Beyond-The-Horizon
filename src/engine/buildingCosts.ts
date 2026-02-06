import { Player } from '../types/game';

export interface BuildingCost {
  clay?: number;
  lumber?: number;
  grain?: number;
  fabric?: number;
  mineral?: number;
}

export interface ResourceDeficit {
  clay: number;
  lumber: number;
  grain: number;
  fabric: number;
  mineral: number;
  total: number;
}

export const BUILDING_COSTS: Record<'village' | 'estate' | 'road' | 'dev_card', BuildingCost> = {
  village: {
    clay: 1,
    lumber: 1,
    grain: 1,
    fabric: 1,
  },
  estate: {
    grain: 2,
    mineral: 3,
  },
  road: {
    clay: 1,
    lumber: 1,
  },
  dev_card: {
    grain: 1,
    fabric: 1,
    mineral: 1,
  },
};

export function canAffordBuilding(player: Player, buildingType: 'village' | 'estate' | 'road' | 'dev_card'): boolean {
  const cost = BUILDING_COSTS[buildingType];

  for (const [resource, amount] of Object.entries(cost)) {
    const resourceKey = resource as keyof typeof player.resources;
    if (player.resources[resourceKey] < amount) {
      return false;
    }
  }

  return true;
}

export function getResourceDeficit(
  player: Player,
  buildingType: 'village' | 'estate' | 'road' | 'dev_card'
): ResourceDeficit {
  const cost = BUILDING_COSTS[buildingType];
  const deficit: ResourceDeficit = {
    clay: 0,
    lumber: 0,
    grain: 0,
    fabric: 0,
    mineral: 0,
    total: 0,
  };

  for (const [resource, required] of Object.entries(cost)) {
    const resourceKey = resource as keyof typeof player.resources;
    const have = player.resources[resourceKey];
    if (have < required) {
      const need = required - have;
      deficit[resourceKey as keyof ResourceDeficit] = need;
      deficit.total += need;
    }
  }

  return deficit;
}

export function getResourcesNeededForBuilding(
  buildingType: 'village' | 'estate' | 'road' | 'dev_card'
): string[] {
  const cost = BUILDING_COSTS[buildingType];
  return Object.keys(cost);
}

export function validateResourceForBuilding(
  resource: string,
  buildingType: 'village' | 'estate' | 'road' | 'dev_card'
): boolean {
  const cost = BUILDING_COSTS[buildingType];
  return resource in cost;
}

export function getMostNeededResources(
  player: Player,
  targetBuildings: Array<'village' | 'estate' | 'road' | 'dev_card'> = ['village', 'estate', 'dev_card', 'road']
): Array<{ resource: string; score: number; neededFor: string[] }> {
  const resourceScores = new Map<string, { score: number; neededFor: string[] }>();

  for (const building of targetBuildings) {
    const deficit = getResourceDeficit(player, building);
    const buildingPriority = getBuildingBasePriority(building);

    for (const [resource, need] of Object.entries(deficit)) {
      if (resource === 'total' || need === 0) continue;

      if (!resourceScores.has(resource)) {
        resourceScores.set(resource, { score: 0, neededFor: [] });
      }

      const entry = resourceScores.get(resource)!;
      entry.score += need * buildingPriority;
      entry.neededFor.push(building);
    }
  }

  const results = Array.from(resourceScores.entries()).map(([resource, data]) => ({
    resource,
    score: data.score,
    neededFor: data.neededFor,
  }));

  results.sort((a, b) => b.score - a.score);
  return results;
}

function getBuildingBasePriority(buildingType: 'village' | 'estate' | 'road' | 'dev_card'): number {
  switch (buildingType) {
    case 'village':
      return 10;
    case 'estate':
      return 9;
    case 'dev_card':
      return 7;
    case 'road':
      return 5;
  }
}
