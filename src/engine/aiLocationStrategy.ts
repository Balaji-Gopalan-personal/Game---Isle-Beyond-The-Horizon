import { GameState, Player } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { loadBoardForSize } from '../graph/loadBoard';
import { getValidRoadPlacements, getValidVillagePlacements, getPlayerVillages } from './gameplayActions';
import { evaluateVertex, evaluateRoadEdge, calculateProductionValue, VertexEvaluation, EdgeEvaluation } from './aiStrategicEval';
import { getAdjacentVertices } from './boardService';

export type PersonalityTrait = 'aggressive' | 'expansionist' | 'trader' | 'defensive' | 'balanced';

export interface PersonalityWeights {
  productionWeight: number;
  diversityWeight: number;
  portWeight: number;
  expansionWeight: number;
  blockingWeight: number;
}

const PERSONALITY_PROFILES: Record<PersonalityTrait, PersonalityWeights> = {
  aggressive: {
    productionWeight: 2.5,
    diversityWeight: 1.5,
    portWeight: 1.0,
    expansionWeight: 2.0,
    blockingWeight: 3.0,
  },
  expansionist: {
    productionWeight: 2.0,
    diversityWeight: 2.5,
    portWeight: 1.5,
    expansionWeight: 4.0,
    blockingWeight: 0.5,
  },
  trader: {
    productionWeight: 3.0,
    diversityWeight: 3.0,
    portWeight: 4.0,
    expansionWeight: 1.5,
    blockingWeight: 0.5,
  },
  defensive: {
    productionWeight: 3.5,
    diversityWeight: 2.0,
    portWeight: 2.0,
    expansionWeight: 1.0,
    blockingWeight: 2.5,
  },
  balanced: {
    productionWeight: 3.0,
    diversityWeight: 2.0,
    portWeight: 1.5,
    expansionWeight: 1.5,
    blockingWeight: 1.0,
  },
};

export function getPersonalityForCharacter(characterName?: string): PersonalityTrait {
  if (!characterName) return 'balanced';

  const aggressiveNames = ['Batman', 'He-Man', 'Lion-O', 'Optimus Prime', 'Thundarr', 'Voltron', 'Bravestarr'];
  const expansionistNames = ['Astro Boy', 'GI Joe', 'Rainbow Brite', 'Speed Racer', 'Gadget', 'Jetson'];
  const traderNames = ['Scrooge McDuck', 'Josie', 'Jem', 'Garfield', 'Yogi Bear'];
  const defensiveNames = ['Care Bear', 'Smurf', 'Casper', 'Snork', 'Gummi Bear'];

  if (aggressiveNames.some(n => characterName.includes(n))) return 'aggressive';
  if (expansionistNames.some(n => characterName.includes(n))) return 'expansionist';
  if (traderNames.some(n => characterName.includes(n))) return 'trader';
  if (defensiveNames.some(n => characterName.includes(n))) return 'defensive';

  return 'balanced';
}

export function applyDifficultyRandomness<T extends { totalScore: number }>(
  options: T[],
  difficulty: 'easy' | 'normal' | 'hard'
): T {
  if (difficulty === 'hard') {
    return options[0];
  }

  const randomnessChance = difficulty === 'easy' ? 0.4 : 0.2;

  if (Math.random() < randomnessChance) {
    const randomIndex = Math.floor(Math.random() * options.length);
    return options[randomIndex];
  }

  const topCandidates = difficulty === 'easy'
    ? options.slice(0, Math.max(3, Math.ceil(options.length * 0.5)))
    : options.slice(0, Math.max(2, Math.ceil(options.length * 0.3)));

  const randomIndex = Math.floor(Math.random() * topCandidates.length);
  return topCandidates[randomIndex];
}

function scoreVertexWithPersonality(
  evaluation: VertexEvaluation,
  personality: PersonalityTrait,
  gameState: GameState,
  playerId: string
): number {
  const weights = PERSONALITY_PROFILES[personality];

  const baseScore =
    evaluation.productionValue * weights.productionWeight +
    evaluation.resourceDiversity * weights.diversityWeight +
    evaluation.portAccess * weights.portWeight +
    evaluation.expansionPotential * weights.expansionWeight;

  const blockingBonus = calculateBlockingValue(evaluation.vertexId, gameState, playerId) * weights.blockingWeight;

  return baseScore + blockingBonus;
}

function calculateBlockingValue(vertexId: number, gameState: GameState, playerId: string): number {
  const boardSize = gameState.gameSettings.boardSize as BoardSize;
  const adjacentVertices = getAdjacentVertices(vertexId, boardSize);

  let blockingScore = 0;

  const leader = getGameLeader(gameState, playerId);
  if (!leader) return 0;

  for (const adjVertex of adjacentVertices) {
    const occupier = gameState.verticesOccupiedBy[adjVertex];
    if (occupier && occupier === leader.id) {
      blockingScore += 5;
    }
  }

  return blockingScore;
}

function getGameLeader(gameState: GameState, excludePlayerId: string): Player | null {
  let leader: Player | null = null;
  let maxScore = -1;

  for (const player of gameState.players) {
    if (player.id === excludePlayerId) continue;

    const totalScore = player.score + player.secretPoints;
    if (totalScore > maxScore) {
      maxScore = totalScore;
      leader = player;
    }
  }

  return leader;
}

export function selectStrategicVillageLocation(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize,
  difficulty: 'easy' | 'normal' | 'hard' = 'normal'
): number | null {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return null;

  const validVertices = getValidVillagePlacements(playerId, gameState, boardSize);
  if (validVertices.length === 0) return null;

  const personality = getPersonalityForCharacter(player.character?.name);

  console.log(`\n📍 [${player.name}] SELECTING VILLAGE LOCATION`);
  console.log(`   Personality: ${personality} | Difficulty: ${difficulty}`);
  console.log(`   Valid locations: ${validVertices.length}`);

  const evaluations = validVertices.map(vertexId => {
    const evaluation = evaluateVertex(vertexId, gameState, boardSize, player);
    const personalityScore = scoreVertexWithPersonality(evaluation, personality, gameState, playerId);
    return { ...evaluation, totalScore: personalityScore };
  });

  evaluations.sort((a, b) => b.totalScore - a.totalScore);

  console.log(`   Top 3 candidates:`);
  evaluations.slice(0, 3).forEach((e, i) => {
    console.log(`     ${i + 1}. Vertex ${e.vertexId} - Score: ${e.totalScore.toFixed(1)} (Prod: ${e.productionValue.toFixed(1)}, Div: ${e.resourceDiversity.toFixed(1)}, Port: ${e.portAccess.toFixed(1)}, Exp: ${e.expansionPotential.toFixed(1)})`);
  });

  const selected = applyDifficultyRandomness(evaluations, difficulty);
  console.log(`   ✓ Selected: Vertex ${selected.vertexId} (Score: ${selected.totalScore.toFixed(1)})`);

  return selected.vertexId;
}

export function selectStrategicRoadLocation(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize,
  difficulty: 'easy' | 'normal' | 'hard' = 'normal',
  prioritizeLongestRoad: boolean = false
): { fromVertex: number; toVertex: number; edgeId: string } | null {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return null;

  const validVertices = getValidRoadPlacements(playerId, gameState, boardSize);
  if (validVertices.length === 0) return null;

  const personality = getPersonalityForCharacter(player.character?.name);

  const playerRoads = gameState.roads.filter(r => r.playerId === playerId);
  const playerVillages = gameState.villages.filter(v => v.playerId === playerId);

  const allPlayerVertices = new Set<number>();
  playerRoads.forEach(r => {
    allPlayerVertices.add(r.from);
    allPlayerVertices.add(r.to);
  });
  playerVillages.forEach(v => allPlayerVertices.add(v.vertexId));

  const validEdges: { fromVertex: number; toVertex: number; edgeId: string; evaluation: EdgeEvaluation }[] = [];
  const boardData = loadBoardForSize(boardSize);

  for (const fromVertex of Array.from(allPlayerVertices)) {
    for (const toVertex of validVertices) {
      const edgeId = fromVertex < toVertex ? `${fromVertex}__${toVertex}` : `${toVertex}__${fromVertex}`;

      if (!gameState.edgesOccupiedBy[edgeId]) {
        const neighbors = boardData.adjacencyMap[fromVertex] || [];

        if (neighbors.includes(toVertex)) {
          const evaluation = evaluateRoadEdge(edgeId, fromVertex, gameState, boardSize, player);

          let adjustedScore = evaluation.totalScore;

          if (prioritizeLongestRoad) {
            adjustedScore += calculateLongestRoadPotential(fromVertex, toVertex, playerId, gameState, boardSize) * 3.0;
          }

          const weights = PERSONALITY_PROFILES[personality];
          adjustedScore =
            evaluation.expansionValue * weights.expansionWeight +
            evaluation.productionAccess * weights.productionWeight * 0.5 +
            evaluation.portConnectionValue * weights.portWeight;

          validEdges.push({
            fromVertex,
            toVertex,
            edgeId,
            evaluation: { ...evaluation, totalScore: adjustedScore }
          });
        }
      }
    }
  }

  if (validEdges.length === 0) return null;

  validEdges.sort((a, b) => b.evaluation.totalScore - a.evaluation.totalScore);

  console.log(`\n🛤️  [${player.name}] SELECTING ROAD LOCATION`);
  console.log(`   Personality: ${personality} | Difficulty: ${difficulty}`);
  console.log(`   Valid edges: ${validEdges.length}`);
  console.log(`   Top 3 candidates:`);
  validEdges.slice(0, 3).forEach((e, i) => {
    console.log(`     ${i + 1}. ${e.fromVertex} → ${e.toVertex} - Score: ${e.evaluation.totalScore.toFixed(1)}`);
  });

  const selected = applyDifficultyRandomness(validEdges.map(e => e.evaluation), difficulty);
  const selectedEdge = validEdges.find(e => e.evaluation.totalScore === selected.totalScore);

  if (selectedEdge) {
    console.log(`   ✓ Selected: ${selectedEdge.fromVertex} → ${selectedEdge.toVertex} (Score: ${selectedEdge.evaluation.totalScore.toFixed(1)})`);
    return {
      fromVertex: selectedEdge.fromVertex,
      toVertex: selectedEdge.toVertex,
      edgeId: selectedEdge.edgeId
    };
  }

  return null;
}

function calculateLongestRoadPotential(
  fromVertex: number,
  toVertex: number,
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize
): number {
  const playerRoads = gameState.roads.filter(r => r.playerId === playerId);

  const roadConnections = new Map<number, number[]>();
  for (const road of playerRoads) {
    if (!roadConnections.has(road.from)) roadConnections.set(road.from, []);
    if (!roadConnections.has(road.to)) roadConnections.set(road.to, []);
    roadConnections.get(road.from)!.push(road.to);
    roadConnections.get(road.to)!.push(road.from);
  }

  const fromConnections = roadConnections.get(fromVertex)?.length || 0;
  const toConnections = roadConnections.get(toVertex)?.length || 0;

  return fromConnections + toConnections;
}

export function selectStrategicEstateLocation(
  playerId: string,
  gameState: GameState,
  difficulty: 'easy' | 'normal' | 'hard' = 'normal'
): number | null {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return null;

  const upgradableVillages = getPlayerVillages(playerId, gameState);
  if (upgradableVillages.length === 0) return null;

  const personality = getPersonalityForCharacter(player.character?.name);
  const boardSize = gameState.gameSettings.boardSize as BoardSize;

  console.log(`\n🏰 [${player.name}] SELECTING ESTATE LOCATION`);
  console.log(`   Personality: ${personality} | Difficulty: ${difficulty}`);
  console.log(`   Upgradable villages: ${upgradableVillages.length}`);

  const boardCenters = gameState.boardCenters && gameState.boardCenters.length > 0
    ? gameState.boardCenters
    : loadBoardForSize(boardSize).centers;

  const evaluations = upgradableVillages.map(village => {
    const productionValue = calculateProductionValue(village.vertexId, boardSize, boardCenters);

    const adjacentVertices = getAdjacentVertices(village.vertexId, boardSize);
    const adjacentEnemies = adjacentVertices.filter(v => {
      const occupier = gameState.verticesOccupiedBy[v];
      return occupier && occupier !== playerId;
    }).length;

    const weights = PERSONALITY_PROFILES[personality];
    const totalScore = productionValue * weights.productionWeight + adjacentEnemies * weights.blockingWeight * 2;

    return {
      vertexId: village.vertexId,
      productionValue,
      adjacentEnemies,
      totalScore
    };
  });

  evaluations.sort((a, b) => b.totalScore - a.totalScore);

  console.log(`   Top 3 candidates:`);
  evaluations.slice(0, 3).forEach((e, i) => {
    console.log(`     ${i + 1}. Vertex ${e.vertexId} - Score: ${e.totalScore.toFixed(1)} (Prod: ${e.productionValue.toFixed(1)}, Enemies: ${e.adjacentEnemies})`);
  });

  const selected = applyDifficultyRandomness(evaluations, difficulty);
  console.log(`   ✓ Selected: Vertex ${selected.vertexId} (Score: ${selected.totalScore.toFixed(1)})`);

  return selected.vertexId;
}

export function selectStrategicDiscardResources(
  player: Player,
  discardAmount: number,
  gameState: GameState
): { clay: number; lumber: number; grain: number; fabric: number; mineral: number } {
  console.log(`\n🗑️  [${player.name}] STRATEGIC DISCARD SELECTION`);
  console.log(`   Must discard: ${discardAmount} resources`);
  console.log(`   Current: Clay=${player.resources.clay} Lumber=${player.resources.lumber} Grain=${player.resources.grain} Fabric=${player.resources.fabric} Mineral=${player.resources.mineral}`);

  const resourceValues = [
    { type: 'clay' as const, amount: player.resources.clay, value: calculateResourceStrategicValue('clay', player, gameState) },
    { type: 'lumber' as const, amount: player.resources.lumber, value: calculateResourceStrategicValue('lumber', player, gameState) },
    { type: 'grain' as const, amount: player.resources.grain, value: calculateResourceStrategicValue('grain', player, gameState) },
    { type: 'fabric' as const, amount: player.resources.fabric, value: calculateResourceStrategicValue('fabric', player, gameState) },
    { type: 'mineral' as const, amount: player.resources.mineral, value: calculateResourceStrategicValue('mineral', player, gameState) },
  ];

  resourceValues.sort((a, b) => a.value - b.value);

  console.log(`   Resource values (lower = discard first):`);
  resourceValues.forEach(r => {
    console.log(`     ${r.type}: ${r.value.toFixed(2)} (have ${r.amount})`);
  });

  const discard = { clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0 };
  let remaining = discardAmount;

  for (const resource of resourceValues) {
    if (remaining === 0) break;

    const toDiscard = Math.min(resource.amount, remaining);
    discard[resource.type] = toDiscard;
    remaining -= toDiscard;
  }

  console.log(`   ✓ Discarding: Clay=${discard.clay} Lumber=${discard.lumber} Grain=${discard.grain} Fabric=${discard.fabric} Mineral=${discard.mineral}`);

  return discard;
}

function calculateResourceStrategicValue(
  resourceType: 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral',
  player: Player,
  gameState: GameState
): number {
  let value = 1.0;

  const currentAmount = player.resources[resourceType];

  if (currentAmount === 0) return 100;
  if (currentAmount === 1) value += 2.0;
  if (currentAmount >= 5) value -= 1.5;

  const nearVillage = player.resources.clay >= 1 && player.resources.lumber >= 1 &&
                       player.resources.grain >= 1 && player.resources.fabric >= 1;
  const nearEstate = player.resources.grain >= 2 && player.resources.mineral >= 3;

  if (nearVillage && ['clay', 'lumber', 'grain', 'fabric'].includes(resourceType)) {
    value += 1.5;
  }

  if (nearEstate) {
    if (resourceType === 'grain' && player.resources.grain <= 2) value += 2.0;
    if (resourceType === 'mineral' && player.resources.mineral <= 3) value += 2.0;
  }

  const boardSize = gameState.gameSettings.boardSize as BoardSize;
  const playerVillages = gameState.villages.filter(v => v.playerId === player.id);
  let productionRate = 0;

  if (!gameState.boardCenters || gameState.boardCenters.length === 0) {
    return value;
  }

  for (const village of playerVillages) {
    const adjacentCenters = gameState.boardCenters.filter(c => c.vertices.includes(village.vertexId));
    for (const center of adjacentCenters) {
      if (center.resourceType === resourceType) {
        const pipProb = [2, 12].includes(center.value) ? 0.03 :
                        [3, 11].includes(center.value) ? 0.06 :
                        [4, 10].includes(center.value) ? 0.08 :
                        [5, 9].includes(center.value) ? 0.11 :
                        [6, 8].includes(center.value) ? 0.14 : 0.17;
        productionRate += pipProb * (village.type === 'city' ? 2 : 1);
      }
    }
  }

  if (productionRate > 0.2) value -= 0.5;
  if (productionRate > 0.4) value -= 1.0;

  return value;
}
