import { GameState, Player, TradingPort } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { loadBoardForSize } from '../graph/loadBoard';
import { getAdjacentVertices } from './boardService';
import { calculateLongestRoadPath, buildVerticesWithOwnership, getValidRoadPlacements } from './gameplayActions';
import { countViableVillageLocations, getPersonalityForCharacter, PersonalityTrait } from './aiLocationStrategy';
import { getStrategicDynamicForCharacter, type StrategicDynamic } from './aiPersonality';
import { canPlaceVillage } from './validators';

export interface VertexEvaluation {
  vertexId: number;
  productionValue: number;
  resourceDiversity: number;
  portAccess: number;
  expansionPotential: number;
  totalScore: number;
}

export interface EdgeEvaluation {
  edgeId: string;
  toVertex: number;
  expansionValue: number;
  productionAccess: number;
  portConnectionValue: number;
  totalScore: number;
}

const PIP_PROBABILITIES: Record<number, number> = {
  2: 1 / 36,
  3: 2 / 36,
  4: 3 / 36,
  5: 4 / 36,
  6: 5 / 36,
  7: 6 / 36,
  8: 5 / 36,
  9: 4 / 36,
  10: 3 / 36,
  11: 2 / 36,
  12: 1 / 36,
};

export function evaluateVertex(
  vertexId: number,
  gameState: GameState,
  boardSize: BoardSize,
  player: Player
): VertexEvaluation {
  const productionValue = calculateProductionValue(vertexId, boardSize, gameState.boardCenters);
  const resourceDiversity = calculateResourceDiversity(vertexId, boardSize, gameState.boardCenters);
  const portAccess = calculatePortAccess(vertexId, gameState, boardSize);
  const expansionPotential = calculateExpansionPotential(vertexId, gameState, boardSize, player.id);

  // Calculate bonus for filling resource gaps
  const gapFillingBonus = calculateResourceGapBonus(vertexId, boardSize, gameState, player);

  const totalScore =
    productionValue * 3.0 +
    resourceDiversity * 2.5 +  // Increased from 2.0
    portAccess * 1.5 +
    expansionPotential * 1.0 +
    gapFillingBonus * 3.0;  // New component for balanced resources

  return {
    vertexId,
    productionValue,
    resourceDiversity,
    portAccess,
    expansionPotential,
    totalScore,
  };
}

export function calculateProductionValue(vertexId: number, boardSize: BoardSize, boardCenters?: any[]): number {
  const centers = boardCenters || loadBoardForSize(boardSize).centers;
  const adjacentCenters = centers.filter(center =>
    center.vertices.includes(vertexId)
  );

  let totalValue = 0;

  for (const center of adjacentCenters) {
    if (center.resourceType === 'desert') continue;

    const pipProbability = PIP_PROBABILITIES[center.value] || 0;
    const resourceValue = getResourceBaseValue(center.resourceType);

    totalValue += pipProbability * resourceValue * 100;
  }

  return totalValue;
}

function getResourceBaseValue(
  resourceType: 'desert' | 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral'
): number {
  switch (resourceType) {
    case 'clay':
      return 1.5;
    case 'lumber':
      return 1.5;
    case 'grain':
      return 1.2;
    case 'fabric':
      return 1.1;
    case 'mineral':
      return 1.0;
    case 'desert':
      return 0;
    default:
      return 1.0;
  }
}

export function calculateResourceDiversity(vertexId: number, boardSize: BoardSize, boardCenters?: any[]): number {
  const centers = boardCenters || loadBoardForSize(boardSize).centers;
  const adjacentCenters = centers.filter(center =>
    center.vertices.includes(vertexId)
  );

  const uniqueResources = new Set(
    adjacentCenters
      .filter(c => c.resourceType !== 'desert')
      .map(c => c.resourceType)
  );

  const diversityScore = uniqueResources.size;

  if (uniqueResources.size === 5) {
    return 12.0;  // Increased from 10.0
  } else if (uniqueResources.size === 4) {
    return 8.0;   // Increased from 7.0
  } else if (uniqueResources.size === 3) {
    return 5.0;
  } else if (uniqueResources.size === 2) {
    return 2.5;   // Decreased from 3.0
  } else if (uniqueResources.size === 1) {
    return 0.5;   // Decreased from 1.0
  }

  return 0;
}

function calculateResourceGapBonus(
  vertexId: number,
  boardSize: BoardSize,
  gameState: GameState,
  player: Player
): number {
  const centers = gameState.boardCenters && gameState.boardCenters.length > 0
    ? gameState.boardCenters
    : loadBoardForSize(boardSize).centers;

  // Get resources the player already has production access to
  const playerVillages = gameState.villages.filter(v => v.playerId === player.id);
  const existingResources = new Set<string>();

  for (const village of playerVillages) {
    const adjacentCenters = centers.filter(c => c.vertices.includes(village.vertexId));
    for (const center of adjacentCenters) {
      if (center.resourceType !== 'desert') {
        existingResources.add(center.resourceType);
      }
    }
  }

  // Get resources this vertex would provide
  const vertexCenters = centers.filter(c => c.vertices.includes(vertexId));
  const vertexResources = new Set(
    vertexCenters
      .filter(c => c.resourceType !== 'desert')
      .map(c => c.resourceType)
  );

  // Count how many NEW resources this vertex provides
  let newResourceCount = 0;
  let totalNewProductionValue = 0;

  for (const resource of vertexResources) {
    if (!existingResources.has(resource)) {
      newResourceCount++;

      // Find the production value of this new resource
      const resourceCenter = vertexCenters.find(c => c.resourceType === resource);
      if (resourceCenter) {
        const pipProb = PIP_PROBABILITIES[resourceCenter.value] || 0;
        totalNewProductionValue += pipProb * 100;
      }
    }
  }

  // Bonus scales with number of new resources and their production value
  let bonus = newResourceCount * 6.0;  // Increased from 4.0 to 6.0 points per new resource type
  bonus += totalNewProductionValue * 0.8;  // Increased from 0.5 to 0.8

  // Extra bonus if this would give the player access to all 5 resources
  if (existingResources.size + newResourceCount >= 5) {
    bonus += 25.0;  // Increased from 12.0 - having all 5 resources is game-changing
  }

  // Additional bonus for filling gaps in early game (first 2 settlements)
  if (playerVillages.length <= 1 && newResourceCount >= 2) {
    bonus += 8.0;  // Strong incentive to diversify early
  }

  return bonus;
}

export function calculatePortAccess(
  vertexId: number,
  gameState: GameState,
  boardSize: BoardSize
): number {
  if (!gameState.tradingPorts || gameState.tradingPorts.length === 0) {
    return 0;
  }

  const port = gameState.tradingPorts.find(p => p.vertices.includes(vertexId));

  if (!port) return 0;

  if (port.type === 'generic') {
    return 5.0;
  } else {
    return 7.0;
  }
}

export function calculateExpansionPotential(
  vertexId: number,
  gameState: GameState,
  boardSize: BoardSize,
  playerId: string
): number {
  const adjacentVertices = getAdjacentVertices(vertexId, boardSize);

  let availableSpots = 0;
  let blockedSpots = 0;

  for (const adjVertex of adjacentVertices) {
    if (!gameState.verticesOccupiedBy[adjVertex]) {
      const adjAdjVertices = getAdjacentVertices(adjVertex, boardSize);
      const isBlocked = adjAdjVertices.some(v => gameState.verticesOccupiedBy[v]);

      if (!isBlocked) {
        availableSpots++;
      } else {
        blockedSpots++;
      }
    }
  }

  return availableSpots * 2.0 + blockedSpots * 0.5;
}

export function evaluateRoadEdge(
  edgeId: string,
  fromVertex: number,
  gameState: GameState,
  boardSize: BoardSize,
  player: Player
): EdgeEvaluation {
  const [v1, v2] = edgeId.split('__').map(Number);
  const toVertex = v1 === fromVertex ? v2 : v1;

  const expansionValue = calculateEdgeExpansionValue(toVertex, gameState, boardSize, player.id);
  const productionAccess = calculateProductionValue(toVertex, boardSize, gameState.boardCenters);
  const portConnectionValue = calculatePortAccess(toVertex, gameState, boardSize);

  const totalScore =
    expansionValue * 2.0 +
    productionAccess * 1.5 +
    portConnectionValue * 1.0;

  return {
    edgeId,
    toVertex,
    expansionValue,
    productionAccess,
    portConnectionValue,
    totalScore,
  };
}

function calculateEdgeExpansionValue(
  vertexId: number,
  gameState: GameState,
  boardSize: BoardSize,
  playerId: string
): number {
  const adjacentVertices = getAdjacentVertices(vertexId, boardSize);

  let validBuildSpots = 0;

  for (const adjVertex of adjacentVertices) {
    if (gameState.verticesOccupiedBy[adjVertex]) continue;

    const adjAdjVertices = getAdjacentVertices(adjVertex, boardSize);
    const hasAdjacentSettlement = adjAdjVertices.some(v => gameState.verticesOccupiedBy[v]);

    if (!hasAdjacentSettlement) {
      validBuildSpots++;
    }
  }

  return validBuildSpots * 3.0;
}

export function getResourceDistribution(player: Player): Record<string, number> {
  return {
    clay: player.resources.clay,
    lumber: player.resources.lumber,
    grain: player.resources.grain,
    fabric: player.resources.fabric,
    mineral: player.resources.mineral,
  };
}

export function identifyResourceDeficit(player: Player): string[] {
  const deficits: string[] = [];

  if (player.resources.clay === 0) deficits.push('clay');
  if (player.resources.lumber === 0) deficits.push('lumber');
  if (player.resources.grain === 0) deficits.push('grain');
  if (player.resources.fabric === 0) deficits.push('fabric');
  if (player.resources.mineral === 0) deficits.push('mineral');

  return deficits;
}

function canRoadsOpenVillageSpots(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize
): boolean {
  const validRoadEndpoints = getValidRoadPlacements(playerId, gameState, boardSize);
  const boardData = loadBoardForSize(boardSize);
  const occupiedVertices = gameState.verticesOccupiedBy || {};

  for (const endpoint of validRoadEndpoints) {
    const neighbors = boardData.adjacencyMap[endpoint] || [];
    for (const neighbor of neighbors) {
      if (canPlaceVillage(neighbor, occupiedVertices, boardSize)) {
        return true;
      }
    }
  }

  return false;
}

export function calculateBuildingPriority(
  player: Player,
  gameState: GameState
): { type: 'village' | 'estate' | 'road' | 'dev_card'; priority: number }[] {
  const priorities: { type: 'village' | 'estate' | 'road' | 'dev_card'; priority: number }[] = [];

  const villageCount = gameState.villages.filter(v => v.playerId === player.id && v.type === 'settlement').length;
  const cityCount = gameState.villages.filter(v => v.playerId === player.id && v.type === 'city').length;
  const roadCount = gameState.roads.filter(r => r.playerId === player.id).length;

  const pointsToWin = gameState.gameSettings.pointsToWin;
  const currentPoints = player.score + player.secretPoints;
  const pointsAway = pointsToWin - currentPoints;
  const isEarlyGame = currentPoints < 5;
  const isMidGame = currentPoints >= 5 && currentPoints < 8;

  // Late game detection: multiple indicators
  const avgPlayerScore = gameState.players.reduce((sum, p) => sum + p.score + p.secretPoints, 0) / gameState.players.length;
  const progressPercent = avgPlayerScore / pointsToWin;
  const isLateGame = progressPercent >= 0.65 || currentPoints >= pointsToWin * 0.7 || gameState.players.some(p => p.score + p.secretPoints >= pointsToWin * 0.8);

  if (isLateGame) {
    console.log(`   🏁 LATE GAME detected (progress: ${(progressPercent * 100).toFixed(0)}%, points: ${currentPoints}/${pointsToWin})`);
  }

  const villageResourcesNeeded =
    (player.resources.clay >= 1 ? 0 : 1) +
    (player.resources.lumber >= 1 ? 0 : 1) +
    (player.resources.grain >= 1 ? 0 : 1) +
    (player.resources.fabric >= 1 ? 0 : 1);

  const estateResourcesNeeded =
    (player.resources.grain >= 2 ? 0 : 2 - player.resources.grain) +
    (player.resources.mineral >= 3 ? 0 : 3 - player.resources.mineral);

  const avgVillages = gameState.players.reduce((sum, p) =>
    sum + gameState.villages.filter(v => v.playerId === p.id && v.type === 'settlement').length, 0
  ) / gameState.players.length;

  const isBehindOnVillages = villageCount < avgVillages - 0.5;

  let villagePriority = (10 - villageCount) * 4.5;
  const villagePriorityBase = villagePriority;

  if (isEarlyGame) {
    villagePriority *= 2.2;
    if (villageCount < 3) {
      villagePriority += 12;
    }
  } else if (isMidGame && villageCount < 4) {
    villagePriority *= 1.7;
  }

  if (isBehindOnVillages) {
    villagePriority += 10;
  }

  if (villageResourcesNeeded > 0) {
    const resourceBonus = isEarlyGame ? 6.0 : isMidGame ? 5.0 : 4.0;
    villagePriority += villageResourcesNeeded * resourceBonus;
  }

  console.log(`   🏘️ VILLAGE PRIORITY CALC: base=${villagePriorityBase.toFixed(1)} villages=${villageCount} cities=${cityCount} phase=${isEarlyGame ? 'early' : isMidGame ? 'mid' : isLateGame ? 'late' : 'unknown'} behindAvg=${isBehindOnVillages} resNeeded=${villageResourcesNeeded} → after-phase=${villagePriority.toFixed(1)}`);

  let estatePriority = villageCount > 0 ? (5 - cityCount) * 3.5 : 0;
  estatePriority -= estateResourcesNeeded * 2.5;

  // A city is guaranteed +1 point AND doubles production. When the player owns a
  // settlement on a strong-production tile, upgrading it is one of the most
  // efficient plays available - reflect that so cities aren't under-valued.
  const boardCentersForEstate = gameState.boardCenters && gameState.boardCenters.length > 0
    ? gameState.boardCenters
    : loadBoardForSize(gameState.gameSettings.boardSize as BoardSize).centers;
  const upgradeableSettlements = gameState.villages.filter(
    v => v.playerId === player.id && v.type === 'settlement'
  );
  if (upgradeableSettlements.length > 0) {
    const bestUpgradeProduction = Math.max(
      ...upgradeableSettlements.map(v =>
        calculateProductionValue(v.vertexId, gameState.gameSettings.boardSize as BoardSize, boardCentersForEstate)
      )
    );
    // bestUpgradeProduction is on the same ~0-30 scale as other production values.
    estatePriority += bestUpgradeProduction * 0.4;
  }

  if (isEarlyGame && villageCount < 2) {
    estatePriority *= 0.2;
  } else if (isEarlyGame && villageCount < 3) {
    estatePriority *= 0.4;
  }

  let devCardPriority = 9;

  const boardSize = gameState.gameSettings.boardSize as BoardSize;
  const viableVillageLocations = countViableVillageLocations(player.id, gameState, boardSize);

  console.log(`   📍 Viable village locations: ${viableVillageLocations}`);

  // Board saturation check
  const isBoardSaturated = viableVillageLocations === 0;
  const isBoardScarce = viableVillageLocations > 0 && viableVillageLocations <= 3;

  if (isBoardScarce) {
    // Locations are scarce but available - BOOST village priority to claim them before others do
    villagePriority *= 1.4;
    console.log(`   ⚠️ Village locations scarce (${viableVillageLocations}) - BOOSTING village priority x1.4`);
  }

  if (isBoardSaturated) {
    // Truly no village locations available - shift to estates and dev cards
    villagePriority *= 0.3;
    estatePriority *= 1.8;
    devCardPriority *= 1.8;
    console.log(`   🚧 Board saturated (0 locations) - prioritizing estates and dev cards`);
  }

  let roadPriority = Math.max(8 - roadCount, 3);

  if (isEarlyGame && villageCount < 3) {
    roadPriority *= 0.6;
  }

  // If the player already has open vertices on their network where a village can be placed,
  // roads should be strongly deprioritized in favor of building that village
  const hasOpenVillageOnNetwork = viableVillageLocations > 0;
  if (hasOpenVillageOnNetwork && villageCount < 5) {
    const suppressFactor = villageCount < 3 ? 0.4 : 0.6;
    roadPriority *= suppressFactor;
    console.log(`   🏘️ Open village vertex on network (${viableVillageLocations} spots, ${villageCount} villages) - road priority x${suppressFactor}`);
  }

  // Check if roads could open new village locations
  const roadsCanOpenVillageSpots = canRoadsOpenVillageSpots(player.id, gameState, boardSize);

  // Late game or saturated board: roads are mostly pointless unless pursuing Longest Road OR opening village spots
  if ((isLateGame || isBoardSaturated) && !roadsCanOpenVillageSpots) {
    roadPriority *= 0.3;  // Severe reduction only if roads won't help
    console.log(`   🛤️ Late game/saturated - road priority severely reduced`);
  } else if (isBoardSaturated && roadsCanOpenVillageSpots) {
    // Board saturated but roads can open new spots - BOOST priority
    roadPriority = Math.max(roadPriority, 14);  // Higher than base estate priority
    roadPriority *= 1.5;
    console.log(`   🛤️ Board saturated but roads can open village spots - BOOSTING road priority to ${roadPriority.toFixed(1)}`);
  }

  if (viableVillageLocations <= 3 && !isLateGame && !roadsCanOpenVillageSpots) {
    roadPriority *= 0.5;
  }

  if (gameState.gameSettings.longestRoadEnabled) {
    const longestRoadBonus = gameState.gameSettings.longestRoadBonus;
    const longestRoadSize = gameState.gameSettings.longestRoadSize;

    const boardData = loadBoardForSize(boardSize);
    const verticesWithOwnership = buildVerticesWithOwnership(boardData.graph, gameState.verticesOccupiedBy);

    const myLongestPath = calculateLongestRoadPath(player.id, gameState.roads, verticesWithOwnership);
    const currentLongestRoadHolder = gameState.players.find(p => p.hasLongestRoad);

    if (currentLongestRoadHolder && currentLongestRoadHolder.id === player.id) {
      // Have Longest Road - restore priority to defend it
      roadPriority = Math.max(roadPriority, 15);
      roadPriority += longestRoadBonus * 1.5;
      console.log(`   🏆 Have Longest Road - maintaining priority`);
    } else if (myLongestPath >= longestRoadSize - 3) {
      let currentHolderLongestPath = 0;
      if (currentLongestRoadHolder) {
        currentHolderLongestPath = calculateLongestRoadPath(
          currentLongestRoadHolder.id,
          gameState.roads,
          verticesWithOwnership
        );
      }

      const roadsNeeded = currentLongestRoadHolder
        ? Math.max(currentHolderLongestPath + 1 - myLongestPath, 0)
        : longestRoadSize - myLongestPath;

      if (roadsNeeded <= 2) {
        // Close to claiming - restore high priority
        roadPriority = Math.max(roadPriority, 20);
        roadPriority += longestRoadBonus * 2.0;
        console.log(`   🎯 Close to Longest Road (${roadsNeeded} roads) - high priority`);
      } else if (roadsNeeded <= 3) {
        roadPriority = Math.max(roadPriority, 12);
        roadPriority += longestRoadBonus * 1.5;
      }
    }
  }

  // Late game bonuses for estates and dev cards
  if (isLateGame) {
    estatePriority *= 1.5;
    devCardPriority *= 1.4;
    console.log(`   🏰 Late game bonuses: estates x1.5, dev cards x1.4`);
  }

  if (pointsAway <= 3) {
    devCardPriority += 3;
  } else if (pointsAway <= 5) {
    devCardPriority += 1.5;
  }

  if (gameState.gameSettings.largestArmyEnabled) {
    const largestArmySize = gameState.gameSettings.largestArmySize;
    const myGuardCount = player.guardsPlayed || 0;
    if (myGuardCount >= largestArmySize - 2) {
      devCardPriority += 2;
    }
  }

  if (isEarlyGame && villageCount < 3) {
    devCardPriority *= 0.5;
  }

  const personality = getPersonalityForCharacter(player.character?.name);
  const strategicDynamic = getStrategicDynamicForCharacter(player.character?.name);

  switch (personality) {
    case 'aggressive':
      villagePriority *= 1.5;
      if (villageCount < 4) {
        villagePriority *= 1.3;
      }
      devCardPriority *= 0.6;
      roadPriority *= 0.8;
      break;

    case 'expansionist':
      if (viableVillageLocations > 0) {
        villagePriority *= 1.4;
        roadPriority *= 1.2;
      } else {
        roadPriority *= 1.8;
        villagePriority *= 1.1;
      }
      devCardPriority *= 0.7;
      estatePriority *= 0.9;
      break;

    case 'developer':
      devCardPriority *= 2.0;
      if (villageCount >= 2) {
        devCardPriority *= 1.3;
      }
      estatePriority *= 1.3;
      villagePriority *= 1.0;
      roadPriority *= 0.6;
      break;

    case 'trader':
      villagePriority *= 1.2;
      devCardPriority *= 1.1;
      break;

    case 'defensive':
      estatePriority *= 1.2;
      devCardPriority *= 1.1;
      break;

    case 'balanced':
      break;
  }

  switch (strategicDynamic) {
    case 'village_rusher':
      villagePriority *= 1.6;
      roadPriority *= 1.4;
      if (villageCount < 4) {
        villagePriority *= 1.2;
        roadPriority *= 1.2;
      }
      estatePriority *= 0.6;
      devCardPriority *= 0.7;
      break;

    case 'estate_climber':
      if (villageCount >= 2 && cityCount < 2) {
        estatePriority *= 2.0;
      } else if (villageCount >= 3) {
        estatePriority *= 1.8;
      }
      if (villageCount < 2) {
        villagePriority *= 1.5;
        estatePriority *= 0.3;
      } else if (villageCount < 3) {
        villagePriority *= 1.3;
      }
      devCardPriority *= 0.8;
      roadPriority *= 0.9;
      break;

    case 'dev_card_gambler':
      devCardPriority *= 1.8;
      if (villageCount < 2) {
        villagePriority *= 1.1;
      } else {
        villagePriority *= 1.0;
      }
      estatePriority *= 1.0;
      roadPriority *= 0.7;
      break;
  }

  console.log(`   🏘️ VILLAGE PRIORITY FINAL: ${villagePriority.toFixed(1)} | road=${roadPriority.toFixed(1)} | estate=${estatePriority.toFixed(1)} | devCard=${devCardPriority.toFixed(1)} | personality=${personality} | dynamic=${strategicDynamic}`);

  priorities.push({ type: 'village', priority: Math.max(villagePriority, 1) });
  priorities.push({ type: 'estate', priority: Math.max(estatePriority, 1) });
  priorities.push({ type: 'road', priority: roadPriority });
  priorities.push({ type: 'dev_card', priority: devCardPriority });

  priorities.sort((a, b) => b.priority - a.priority);

  console.log(`   🏘️ BUILD PRIORITY ORDER: ${priorities.map(p => `${p.type}(${p.priority.toFixed(1)})`).join(' > ')}`);

  return priorities;
}
