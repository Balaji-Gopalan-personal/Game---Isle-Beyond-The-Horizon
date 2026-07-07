import { GameState, Player, Road } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { loadBoardForSize } from '../graph/loadBoard';
import { getValidRoadPlacements, getValidVillagePlacements, getPlayerVillages, calculateLongestRoadPath, buildVerticesWithOwnership } from './gameplayActions';
import { evaluateVertex, evaluateRoadEdge, calculateProductionValue, calculateEstateProductionValue, calculatePlayerResourceProduction, calculateEstateScarcityBonus, VertexEvaluation, EdgeEvaluation } from './aiStrategicEval';
import { getAdjacentVertices } from './boardService';
import { getStrategicDynamicForCharacter, type StrategicDynamic } from './aiPersonality';
import { chooseByRubric } from './aiDifficultyTuning';

export type PersonalityTrait = 'aggressive' | 'expansionist' | 'trader' | 'defensive' | 'developer' | 'balanced';

export interface PersonalityWeights {
  productionWeight: number;
  diversityWeight: number;
  portWeight: number;
  expansionWeight: number;
  blockingWeight: number;
}

export interface PersonalityWithDynamic {
  trait: PersonalityTrait;
  dynamic: StrategicDynamic;
}

export interface VillageLocationDecision {
  vertexId: number;
  reasoning: string;
  personality: PersonalityTrait;
}

export interface RoadLocationDecision {
  fromVertex: number;
  toVertex: number;
  edgeId: string;
  reasoning: string;
  personality: PersonalityTrait;
}

export interface EstateLocationDecision {
  vertexId: number;
  reasoning: string;
  personality: PersonalityTrait;
}

const PERSONALITY_PROFILES: Record<PersonalityTrait, PersonalityWeights> = {
  aggressive: {
    productionWeight: 3.5,
    diversityWeight: 1.0,
    portWeight: 0.8,
    expansionWeight: 1.5,
    blockingWeight: 4.0,
  },
  expansionist: {
    productionWeight: 2.0,
    diversityWeight: 2.5,
    portWeight: 2.0,
    expansionWeight: 5.0,
    blockingWeight: 0.5,
  },
  trader: {
    productionWeight: 3.0,
    diversityWeight: 3.5,
    portWeight: 4.5,
    expansionWeight: 1.5,
    blockingWeight: 0.5,
  },
  defensive: {
    productionWeight: 3.5,
    diversityWeight: 2.0,
    portWeight: 2.0,
    expansionWeight: 1.0,
    blockingWeight: 3.5,
  },
  developer: {
    productionWeight: 2.5,
    diversityWeight: 1.5,
    portWeight: 1.8,
    expansionWeight: 1.0,
    blockingWeight: 1.5,
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
  const developerNames = ['Chip', 'Dale', 'Donatello', 'Brainy Smurf', 'Zummi Gummi', 'Doc'];

  if (aggressiveNames.some(n => characterName.includes(n))) return 'aggressive';
  if (expansionistNames.some(n => characterName.includes(n))) return 'expansionist';
  if (traderNames.some(n => characterName.includes(n))) return 'trader';
  if (defensiveNames.some(n => characterName.includes(n))) return 'defensive';
  if (developerNames.some(n => characterName.includes(n))) return 'developer';

  return 'balanced';
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

  if (gameState.gameSettings.longestRoadEnabled) {
    const boardData = loadBoardForSize(boardSize);
    const verticesWithOwnership = buildVerticesWithOwnership(boardData.graph, gameState.verticesOccupiedBy);

    // The road threat is whoever holds the Longest Road, else the opponent with
    // the longest current path — NOT necessarily the points leader. Settling on a
    // vertex that lies on their path severs it (the classic longest-road steal).
    const opponents = gameState.players.filter(p => p.id !== playerId);
    let roadThreat: Player | null = opponents.find(p => p.hasLongestRoad) ?? null;
    let currentLongestPath = roadThreat
      ? calculateLongestRoadPath(roadThreat.id, gameState.roads, verticesWithOwnership)
      : 0;
    if (!roadThreat) {
      for (const p of opponents) {
        const path = calculateLongestRoadPath(p.id, gameState.roads, verticesWithOwnership);
        if (path > currentLongestPath) {
          roadThreat = p;
          currentLongestPath = path;
        }
      }
    }

    if (roadThreat && currentLongestPath >= 4) {
      const simulatedVerticesOccupiedBy = { ...gameState.verticesOccupiedBy, [vertexId]: playerId };
      const simulatedVerticesWithOwnership = buildVerticesWithOwnership(boardData.graph, simulatedVerticesOccupiedBy);
      const newLongestPath = calculateLongestRoadPath(roadThreat.id, gameState.roads, simulatedVerticesWithOwnership);

      const roadDisruption = currentLongestPath - newLongestPath;
      if (roadDisruption > 0) {
        blockingScore += roadDisruption * 8;

        const longestRoadSize = gameState.gameSettings.longestRoadSize;
        // Stripping the actual bonus — either from the current holder, or by
        // pushing a leader below the threshold — is worth far more than shaving
        // a segment off a road that isn't winning anything yet.
        const stripsBonus = roadThreat.hasLongestRoad ||
          (currentLongestPath >= longestRoadSize && newLongestPath < longestRoadSize);
        if (stripsBonus) {
          blockingScore += 20;
        }
      }
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

function selectNextTargetVillageVertices(
  currentVillageVertex: number,
  gameState: GameState,
  boardSize: BoardSize,
  playerId: string,
  maxDistance: number
): number[] {
  const validVertices = getValidVillagePlacements(playerId, gameState, boardSize);
  if (validVertices.length === 0) return [];

  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return [];

  const candidates = validVertices
    .filter(v => {
      const adjVertices = getAdjacentVertices(v, boardSize);
      return !adjVertices.some(av => gameState.verticesOccupiedBy[av]);
    })
    .map(v => ({
      vertexId: v,
      evaluation: evaluateVertex(v, gameState, boardSize, player)
    }))
    .sort((a, b) => b.evaluation.totalScore - a.evaluation.totalScore)
    .slice(0, maxDistance)
    .map(c => c.vertexId);

  return candidates;
}

function calculateTargetProximityBonus(
  currentVertex: number,
  targetVertex: number,
  boardSize: BoardSize
): number {
  if (currentVertex === targetVertex) return 10.0;

  const adjVertices = getAdjacentVertices(currentVertex, boardSize);
  if (adjVertices.includes(targetVertex)) return 8.0;

  const adjAdjVertices = new Set<number>();
  for (const adj of adjVertices) {
    getAdjacentVertices(adj, boardSize).forEach(v => adjAdjVertices.add(v));
  }
  if (adjAdjVertices.has(targetVertex)) return 4.0;

  return 0;
}

function generateVillageReasoning(
  evaluation: VertexEvaluation & { totalScore: number },
  personality: PersonalityTrait,
  gameState: GameState,
  playerId: string
): string {
  const reasons: string[] = [];

  if (evaluation.productionValue > 20) {
    reasons.push('high-production location');
  } else if (evaluation.productionValue > 15) {
    reasons.push('good production location');
  }

  if (evaluation.resourceDiversity > 3) {
    reasons.push('diverse resources');
  }

  if (evaluation.portAccess > 5) {
    reasons.push('trading port access');
  }

  const blockingValue = calculateBlockingValue(evaluation.vertexId, gameState, playerId);
  if (blockingValue > 10) {
    reasons.push('blocks opponent');
  }

  if (evaluation.expansionPotential > 15) {
    reasons.push('expansion potential');
  }

  if (reasons.length === 0) {
    return 'Establish presence on the board';
  }

  const capitalizedReasons = reasons.map((r, i) => i === 0 ? r.charAt(0).toUpperCase() + r.slice(1) : r);
  return capitalizedReasons.join(', ');
}

function generateRoadReasoning(
  evaluation: EdgeEvaluation,
  personality: PersonalityTrait,
  prioritizeLongestRoad: boolean
): string {
  const reasons: string[] = [];

  if (prioritizeLongestRoad) {
    reasons.push('extend longest road');
  }

  if (evaluation.expansionValue > 8) {
    reasons.push('expansion toward valuable resources');
  } else if (evaluation.expansionValue > 5) {
    reasons.push('territory expansion');
  }

  if (evaluation.productionAccess > 15) {
    reasons.push('access high-production hex');
  }

  if (evaluation.portConnectionValue > 5) {
    reasons.push('connect to trading port');
  }

  if (reasons.length === 0) {
    return 'Expand road network';
  }

  const capitalizedReasons = reasons.map((r, i) => i === 0 ? r.charAt(0).toUpperCase() + r.slice(1) : r);
  return capitalizedReasons.join(', ');
}

function generateEstateReasoning(
  evaluation: { productionValue: number; scarcityBonus: number },
  personality: PersonalityTrait
): string {
  const reasons: string[] = [];

  if (evaluation.productionValue > 20) {
    reasons.push('maximize production');
  } else if (evaluation.productionValue > 15) {
    reasons.push('boost resource income');
  }

  if (evaluation.scarcityBonus > 4) {
    reasons.push('fill resource gaps');
  }

  if (reasons.length === 0) {
    return 'Upgrade for more resources';
  }

  const capitalizedReasons = reasons.map((r, i) => i === 0 ? r.charAt(0).toUpperCase() + r.slice(1) : r);
  return capitalizedReasons.join(', ');
}

export function selectStrategicVillageLocation(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize,
  difficulty: 'easy' | 'normal' | 'hard' = 'normal'
): VillageLocationDecision | null {
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

  const selected = chooseByRubric(evaluations, difficulty);
  console.log(`   ✓ Selected: Vertex ${selected.vertexId} (Score: ${selected.totalScore.toFixed(1)})`);

  const reasoning = generateVillageReasoning(selected, personality, gameState, playerId);

  if (!player.aiTargetVillageVertex) {
    const nextTargetVertices = selectNextTargetVillageVertices(selected.vertexId, gameState, boardSize, playerId, 2);
    if (nextTargetVertices.length > 0) {
      player.aiTargetVillageVertex = nextTargetVertices[0];
      console.log(`   🎯 Next target village vertex set: ${player.aiTargetVillageVertex}`);
    }
  }

  return {
    vertexId: selected.vertexId,
    reasoning,
    personality
  };
}

export function selectStrategicRoadLocation(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize,
  difficulty: 'easy' | 'normal' | 'hard' = 'normal',
  prioritizeLongestRoad: boolean = false
): RoadLocationDecision | null {
  const player = gameState.players.find(p => p.id === playerId);
  if (!player) return null;

  const validVertices = getValidRoadPlacements(playerId, gameState, boardSize);
  if (validVertices.length === 0) return null;

  const personality = getPersonalityForCharacter(player.character?.name);
  const strategicDynamic = getStrategicDynamicForCharacter(player.character?.name);
  const villageCount = gameState.villages.filter(v => v.playerId === playerId && v.type === 'settlement').length;
  const currentPoints = player.score + player.secretPoints;
  const isEarlyGame = currentPoints < 5;

  const playerRoads = gameState.roads.filter(r => r.playerId === playerId);
  const playerVillages = gameState.villages.filter(v => v.playerId === playerId);

  const allPlayerVertices = new Set<number>();
  playerRoads.forEach(r => {
    allPlayerVertices.add(r.from);
    allPlayerVertices.add(r.to);
  });
  playerVillages.forEach(v => allPlayerVertices.add(v.vertexId));

  // How aggressively this player should value longest-road extension this turn.
  // Computed from live game state so placement is goal-aware on every road, not
  // just when `prioritizeLongestRoad` is forced (e.g. Road Construction card).
  const longestRoadUrgency = calculateLongestRoadUrgency(player, gameState, boardSize, prioritizeLongestRoad);

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

          // Reward edges that actually extend our longest path, weighted by how
          // much we should care about the bonus right now (defend / pursue / steal).
          const longestRoadDelta = longestRoadUrgency > 0
            ? calculateLongestRoadPotential(fromVertex, toVertex, playerId, gameState, boardSize)
            : 0;
          adjustedScore += longestRoadDelta * longestRoadUrgency;

          const villageExpansionValue = calculateVillageExpansionValue(
            toVertex, gameState, boardSize, player
          );

          const weights = PERSONALITY_PROFILES[personality];

          let villageExpansionMultiplier = 12.0;
          if (isEarlyGame && villageCount < 3) {
            villageExpansionMultiplier = 16.0;
          } else if (villageCount < 4) {
            villageExpansionMultiplier = 14.0;
          } else {
            villageExpansionMultiplier = 10.0;
          }

          // FIXED: Accumulate scores instead of overwriting
          // Previous bug: adjustedScore was REASSIGNED (=) which lost the longestRoadPotential bonus
          adjustedScore += evaluation.expansionValue * weights.expansionWeight;
          adjustedScore += evaluation.productionAccess * weights.productionWeight * 0.5;
          adjustedScore += evaluation.portConnectionValue * weights.portWeight;
          adjustedScore += villageExpansionValue * villageExpansionMultiplier;

          if (player.aiTargetVillageVertex && strategicDynamic === 'village_rusher') {
            const targetProximityBonus = calculateTargetProximityBonus(toVertex, player.aiTargetVillageVertex, boardSize);
            adjustedScore += targetProximityBonus * 8.0;
          }

          if (villageExpansionValue === 0) {
            // Normally a road that opens no new village spot is heavily penalized,
            // but don't punish a genuine longest-road extension when the bonus is
            // live (held or actively being pursued) — that's the whole point of it.
            const extendsLongestRoad = longestRoadDelta > 0 && longestRoadUrgency >= 3.0;
            adjustedScore -= extendsLongestRoad ? 3 : 15;
          }

          const fromRoadCount = playerRoads.filter(
            r => r.from === fromVertex || r.to === fromVertex
          ).length;
          const isTip = fromRoadCount === 1;

          if (isTip) {
            if (personality === 'expansionist') {
              adjustedScore += 5;
            } else if (personality === 'developer') {
              adjustedScore += 1;
            } else {
              adjustedScore += 3;
            }
          } else {
            if (personality === 'expansionist') {
              adjustedScore -= 3;
            } else if (personality !== 'developer') {
              adjustedScore -= 2;
            }
          }

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

  const evaluations = validEdges.map(e => e.evaluation);
  const selected = chooseByRubric(evaluations, difficulty);
  const selectedIndex = evaluations.indexOf(selected);
  const selectedEdge = selectedIndex >= 0 ? validEdges[selectedIndex] : null;

  if (selectedEdge) {
    console.log(`   ✓ Selected: ${selectedEdge.fromVertex} → ${selectedEdge.toVertex} (Score: ${selectedEdge.evaluation.totalScore.toFixed(1)})`);

    const reasoning = generateRoadReasoning(selectedEdge.evaluation, personality, prioritizeLongestRoad);

    return {
      fromVertex: selectedEdge.fromVertex,
      toVertex: selectedEdge.toVertex,
      edgeId: selectedEdge.edgeId,
      reasoning,
      personality
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
  const boardData = loadBoardForSize(boardSize);
  const verticesWithOwnership = buildVerticesWithOwnership(boardData.graph, gameState.verticesOccupiedBy);

  const currentLongestPath = calculateLongestRoadPath(playerId, gameState.roads, verticesWithOwnership);

  const edgeId = fromVertex < toVertex ? `${fromVertex}__${toVertex}` : `${toVertex}__${fromVertex}`;
  const simulatedRoad: Road = {
    id: edgeId,
    playerId,
    from: fromVertex,
    to: toVertex
  };

  const updatedRoads = [...gameState.roads, simulatedRoad];
  const newLongestPath = calculateLongestRoadPath(playerId, updatedRoads, verticesWithOwnership);

  return newLongestPath - currentLongestPath;
}

/**
 * How much the player should value extending its own longest road *right now*,
 * used as the per-segment weight on longest-road potential when scoring an edge.
 *
 * This makes road *placement* coherent with the longest-road goal on every turn,
 * not just when a Road Construction dev card passes `forcePrioritize`. Returns a
 * standing baseline so roads break ties toward extension, scaling up sharply when
 * the bonus is held (defend) or within reach (pursue / steal).
 */
function calculateLongestRoadUrgency(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  forcePrioritize: boolean
): number {
  if (!gameState.gameSettings.longestRoadEnabled) {
    return forcePrioritize ? 3.0 : 0;
  }

  const boardData = loadBoardForSize(boardSize);
  const verticesWithOwnership = buildVerticesWithOwnership(boardData.graph, gameState.verticesOccupiedBy);

  const longestRoadSize = gameState.gameSettings.longestRoadSize;
  const myPath = calculateLongestRoadPath(player.id, gameState.roads, verticesWithOwnership);

  let bestOpponentPath = 0;
  for (const p of gameState.players) {
    if (p.id === player.id) continue;
    const path = calculateLongestRoadPath(p.id, gameState.roads, verticesWithOwnership);
    if (path > bestOpponentPath) bestOpponentPath = path;
  }

  const holder = gameState.players.find(p => p.hasLongestRoad);
  const iHoldIt = holder?.id === player.id;

  // Standing interest: every road should prefer to extend our longest path when
  // it is otherwise a wash against alternatives.
  let urgency = 1.0;

  if (iHoldIt) {
    // Defend: the smaller our lead, the more we care about staying ahead.
    const margin = myPath - bestOpponentPath;
    urgency = margin <= 1 ? 8.0 : margin <= 2 ? 5.0 : 3.0;
  } else if (myPath >= 2) {
    // Pursue / steal: how many segments until we take the bonus?
    const target = holder ? bestOpponentPath + 1 : longestRoadSize;
    const roadsNeeded = Math.max(target - myPath, 0);
    if (roadsNeeded <= 1) urgency = 10.0;
    else if (roadsNeeded <= 2) urgency = 7.0;
    else if (roadsNeeded <= 3) urgency = 4.0;
    else urgency = 2.0;
  }

  if (forcePrioritize) {
    urgency = Math.max(urgency, 4.0);
  }

  return urgency;
}

function calculateVillageExpansionValue(
  vertexId: number,
  gameState: GameState,
  boardSize: BoardSize,
  player: Player
): number {
  let expansionValue = 0;
  const occupiedVertices = gameState.verticesOccupiedBy || {};

  // Helper: an opponent settlement at `v` breaks road continuity through it.
  const blockedByOpponent = (v: number) => {
    const owner = occupiedVertices[v];
    return owner != null && owner !== player.id;
  };

  // Depth-0: the road tip itself could become a village
  if (!occupiedVertices[vertexId]) {
    const adjVertices = getAdjacentVertices(vertexId, boardSize);
    const hasAdjacentSettlement = adjVertices.some(v => occupiedVertices[v]);

    if (!hasAdjacentSettlement) {
      const villageScore = evaluateVertex(vertexId, gameState, boardSize, player).totalScore;
      if (villageScore > 20) expansionValue += 12;
      else if (villageScore > 15) expansionValue += 8;
      else if (villageScore > 10) expansionValue += 5;
      else expansionValue += 2;
    }
  }

  // Depth-1 neighbours only count if the road tip isn't blocked by an opponent
  // (an opponent's settlement at vertexId cuts road continuity past it).
  if (blockedByOpponent(vertexId)) {
    return expansionValue;
  }

  const adjacentVertices = getAdjacentVertices(vertexId, boardSize);

  for (const adjVertex of adjacentVertices) {
    if (occupiedVertices[adjVertex]) continue; // occupied — can't place a village there
    // The edge to adjVertex must not already be occupied by someone else
    const edgeId = vertexId < adjVertex ? `${vertexId}__${adjVertex}` : `${adjVertex}__${vertexId}`;
    const edgeOwner = gameState.edgesOccupiedBy[edgeId];
    if (edgeOwner && edgeOwner !== player.id) continue;

    const adjAdjVertices = getAdjacentVertices(adjVertex, boardSize);
    const hasAdjacentSettlement = adjAdjVertices.some(v => occupiedVertices[v]);

    if (!hasAdjacentSettlement) {
      const villageScore = evaluateVertex(adjVertex, gameState, boardSize, player).totalScore;
      if (villageScore > 20) expansionValue += 8;
      else if (villageScore > 15) expansionValue += 5;
      else if (villageScore > 10) expansionValue += 3;
      else expansionValue += 1;
    }
  }

  return expansionValue;
}

export function countViableVillageLocations(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize
): number {
  const validPlacements = getValidVillagePlacements(playerId, gameState, boardSize);
  return validPlacements.length;
}

/**
 * BFS from all player-owned vertices (roads + villages) outward over unoccupied
 * edges, up to `maxRoads` hops. Returns the count of vertices that would be
 * legal village placements at each hop depth, and the minimum hops to any legal
 * spot. An opponent-owned vertex blocks the BFS through it (the road-interrupt rule).
 *
 * depth 0 = already on network and placeable now (same as countViableVillageLocations)
 * depth 1 = one new road needed
 * depth 2 = two new roads needed
 */
export function countVillageSpotsByHops(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize,
  maxRoads: number = 2
): { total: number; byDepth: number[]; minHops: number } {
  const boardData = loadBoardForSize(boardSize);
  const occupiedVertices = gameState.verticesOccupiedBy || {};

  const playerRoads = gameState.roads.filter(r => r.playerId === playerId);
  const playerVillages = gameState.villages.filter(v => v.playerId === playerId);

  // Seed BFS with vertices already on this player's network
  const seedVertices = new Set<number>();
  playerRoads.forEach(r => { seedVertices.add(r.from); seedVertices.add(r.to); });
  playerVillages.forEach(v => seedVertices.add(v.vertexId));

  // BFS: visited tracks the minimum depth each vertex was reached at
  const visited = new Map<number, number>(); // vertexId → depth reached
  seedVertices.forEach(v => visited.set(v, 0));

  const frontier: number[] = Array.from(seedVertices);
  const byDepth: number[] = Array(maxRoads + 1).fill(0);

  // depth 0: count spots placeable right now on existing network
  for (const v of frontier) {
    if (!occupiedVertices[v]) {
      const adjVertices = boardData.adjacencyMap[v] || [];
      const distanceRuleOk = !adjVertices.some(n => occupiedVertices[n]);
      if (distanceRuleOk) {
        byDepth[0]++;
      }
    }
  }

  // BFS for deeper depths
  let currentFrontier = frontier.slice();
  for (let depth = 1; depth <= maxRoads; depth++) {
    const nextFrontier: number[] = [];
    for (const v of currentFrontier) {
      // Don't expand through an opponent-owned vertex (their settlement breaks road continuity)
      if (occupiedVertices[v] && occupiedVertices[v] !== playerId) continue;

      const neighbors = boardData.adjacencyMap[v] || [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        const edgeId = v < neighbor ? `${v}__${neighbor}` : `${neighbor}__${v}`;
        // Can only traverse an unoccupied edge
        if (gameState.edgesOccupiedBy[edgeId]) continue;

        visited.set(neighbor, depth);
        nextFrontier.push(neighbor);

        // Would a village at `neighbor` be legal?
        if (!occupiedVertices[neighbor]) {
          const adjVertices = boardData.adjacencyMap[neighbor] || [];
          const distanceRuleOk = !adjVertices.some(n => occupiedVertices[n]);
          if (distanceRuleOk) {
            byDepth[depth]++;
          }
        }
      }
    }
    currentFrontier = nextFrontier;
  }

  const total = byDepth.reduce((a, b) => a + b, 0);
  const minHops = byDepth.findIndex(c => c > 0);

  return { total, byDepth, minHops: minHops === -1 ? Infinity : minHops };
}

export function selectStrategicEstateLocation(
  playerId: string,
  gameState: GameState,
  difficulty: 'easy' | 'normal' | 'hard' = 'normal'
): EstateLocationDecision | null {
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

  // Pre-compute the player's per-resource production rate across all their buildings.
  // Used for the scarcity bonus: resources the player rarely generates are worth more to double.
  const playerProduction = calculatePlayerResourceProduction(playerId, gameState, boardCenters);

  const evaluations = upgradableVillages.map(village => {
    // Use estate-phase resource values: mineral/grain weighted higher than clay/lumber
    // because those are the resources spent to buy further estates and dev cards.
    const productionValue = calculateEstateProductionValue(village.vertexId, boardSize, boardCenters);

    const adjacentCenters = boardCenters.filter((c: any) => c.vertices.includes(village.vertexId));

    // Upgrading doubles output, so the gain equals one extra settlement's worth of production.
    const productionDelta = productionValue;

    // The robber is transient — softer penalty than during village placement.
    const blockedByRobber = adjacentCenters.some((c: any) => c.id === gameState.robberPosition);
    const robberPenalty = blockedByRobber ? -8 : 0;

    // Explicit nudge toward high-probability hexes where doubling pays off most.
    const highPipBonus = adjacentCenters.reduce((sum: number, c: any) => {
      if (c.value === 6 || c.value === 8) return sum + 6;
      if (c.value === 5 || c.value === 9) return sum + 3;
      return sum;
    }, 0);

    // Prefer doubling resources the player currently produces least — fills gaps in their economy.
    const scarcityBonus = calculateEstateScarcityBonus(village.vertexId, boardCenters, playerProduction);

    const weights = PERSONALITY_PROFILES[personality];
    const totalScore =
      productionDelta * weights.productionWeight +
      highPipBonus +
      robberPenalty +
      scarcityBonus;

    return {
      vertexId: village.vertexId,
      productionValue,
      scarcityBonus,
      totalScore
    };
  });

  evaluations.sort((a, b) => b.totalScore - a.totalScore);

  console.log(`   Top 3 candidates:`);
  evaluations.slice(0, 3).forEach((e, i) => {
    console.log(`     ${i + 1}. Vertex ${e.vertexId} - Score: ${e.totalScore.toFixed(1)} (Prod: ${e.productionValue.toFixed(1)}, Scarcity: ${e.scarcityBonus.toFixed(1)})`);
  });

  const selected = chooseByRubric(evaluations, difficulty);
  console.log(`   ✓ Selected: Vertex ${selected.vertexId} (Score: ${selected.totalScore.toFixed(1)})`);

  const reasoning = generateEstateReasoning(selected, personality);

  return {
    vertexId: selected.vertexId,
    reasoning,
    personality
  };
}

export function selectStrategicDiscardResources(
  player: Player,
  discardAmount: number,
  gameState: GameState
): { clay: number; lumber: number; grain: number; fabric: number; mineral: number } {
  const difficulty = player.difficulty || 'normal';

  console.log(`\n🗑️  [${player.name}] STRATEGIC DISCARD SELECTION (${difficulty} difficulty)`);
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

  // Discard one unit at a time, each unit choosing which resource to give up
  // through the shared rubric gate (lowest-value resource = "optimal" pick).
  // This keeps discard consistent with every other AI decision instead of a
  // one-off greedy allocation.
  const discard = { clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0 };
  let remaining = discardAmount;

  while (remaining > 0) {
    const available = resourceValues.filter(r => discard[r.type] < r.amount);
    if (available.length === 0) break;

    const chosen = chooseByRubric(available, difficulty);
    discard[chosen.type] += 1;
    remaining -= 1;
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
