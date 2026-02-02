import { GameState, Road, Village } from '../types/game';
import { loadBoardForSize } from '../graph/loadBoard';
import { canPlaceVillage } from './validators';
import { BoardSize } from '../data/boardStructure';
import { BoardGraph } from '../graph/boardData';

export function buildVerticesWithOwnership(
  boardGraph: BoardGraph,
  verticesOccupiedBy: Record<number, string | null>
): Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }> {
  const result: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }> = {};

  for (const [vertexId, vertex] of Object.entries(boardGraph.vertices)) {
    const id = parseInt(vertexId);
    result[id] = {
      id,
      occupiedBy: verticesOccupiedBy[id] || null,
      neighbors: boardGraph.neighbors?.[id] || []
    };
  }

  return result;
}

export function calculateLongestRoadPath(
  playerId: string,
  roads: Road[],
  vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }>,
  debug: boolean = false
): number {
  const startTime = performance.now();
  const playerRoads = roads.filter(r => r.playerId === playerId);

  if (debug) {
    console.group(`🛣️ Longest Road Calculation for Player: ${playerId}`);
    console.log(`⏱️  Timestamp: ${new Date().toISOString()}`);
    console.log(`📊 Total player roads: ${playerRoads.length}`);
    console.log(`📊 Total vertices in graph: ${Object.keys(vertices).length}`);
  }

  if (playerRoads.length === 0) {
    if (debug) {
      console.log(`❌ No roads found for player ${playerId}`);
      console.groupEnd();
    }
    return 0;
  }

  const adjacencyList = new Map<number, number[]>();
  playerRoads.forEach(road => {
    if (!adjacencyList.has(road.from)) {
      adjacencyList.set(road.from, []);
    }
    if (!adjacencyList.has(road.to)) {
      adjacencyList.set(road.to, []);
    }
    adjacencyList.get(road.from)!.push(road.to);
    adjacencyList.get(road.to)!.push(road.from);
  });

  const blockedVertices: { vertexId: number; blockingPlayer: string; buildingType: string }[] = [];
  const occupiedVerticesCount = Object.values(vertices).filter(v => v.occupiedBy !== null).length;

  if (debug) {
    console.log(`📊 Total occupied vertices: ${occupiedVerticesCount}`);

    for (const [vertexId, vertex] of Object.entries(vertices)) {
      if (vertex.occupiedBy && vertex.occupiedBy !== playerId) {
        if (adjacencyList.has(parseInt(vertexId))) {
          blockedVertices.push({
            vertexId: parseInt(vertexId),
            blockingPlayer: vertex.occupiedBy,
            buildingType: 'village/estate'
          });
        }
      }
    }

    if (blockedVertices.length > 0) {
      console.log(`🚫 Blocked vertices (opponent buildings on player's road network):`);
      blockedVertices.forEach(bv => {
        console.log(`   • Vertex ${bv.vertexId} - Blocked by Player ${bv.blockingPlayer} (${bv.buildingType})`);
      });
    } else {
      console.log(`✅ No opponent buildings blocking this player's road network`);
    }
  }

  function dfs(node: number, visited: Set<number>, depth: number = 0): number {
    let maxLength = 0;
    const neighbors = adjacencyList.get(node) || [];

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const neighborVertex = vertices[neighbor];

        if (neighborVertex && neighborVertex.occupiedBy && neighborVertex.occupiedBy !== playerId) {
          if (debug) {
            console.log(`   ${'  '.repeat(depth)}🚫 Blocked at vertex ${neighbor} (owned by ${neighborVertex.occupiedBy})`);
          }
          continue;
        }

        visited.add(neighbor);
        const length = 1 + dfs(neighbor, visited, depth + 1);
        maxLength = Math.max(maxLength, length);
        visited.delete(neighbor);
      }
    }

    return maxLength;
  }

  let longestPath = 0;
  const allVertices = Array.from(adjacencyList.keys());
  const pathLengths: { startVertex: number; length: number }[] = [];

  if (debug) {
    console.log(`\n🔍 Starting DFS from ${allVertices.length} vertices...`);
  }

  for (const startVertex of allVertices) {
    const startVertexData = vertices[startVertex];

    if (startVertexData && startVertexData.occupiedBy && startVertexData.occupiedBy !== playerId) {
      if (debug) {
        console.log(`⏭️  Skipping start vertex ${startVertex} (owned by opponent ${startVertexData.occupiedBy})`);
      }
      continue;
    }

    const visited = new Set<number>([startVertex]);
    const pathLength = dfs(startVertex, visited);
    pathLengths.push({ startVertex, length: pathLength });

    if (pathLength > longestPath) {
      longestPath = pathLength;
      if (debug) {
        console.log(`✨ New longest path: ${longestPath} (starting from vertex ${startVertex})`);
      }
    }
  }

  const endTime = performance.now();
  const computationTime = (endTime - startTime).toFixed(2);

  if (debug) {
    console.log(`\n📈 Path Length Statistics:`);
    console.log(`   • Total paths evaluated: ${pathLengths.length}`);
    console.log(`   • Longest path found: ${longestPath}`);
    if (pathLengths.length > 0) {
      const bestPath = pathLengths.find(p => p.length === longestPath);
      if (bestPath) {
        console.log(`   • Best path starts from vertex: ${bestPath.startVertex}`);
      }
      const avgLength = pathLengths.reduce((sum, p) => sum + p.length, 0) / pathLengths.length;
      console.log(`   • Average path length: ${avgLength.toFixed(1)}`);
    }
    console.log(`⏱️  Computation time: ${computationTime}ms`);

    if (parseFloat(computationTime) > 100) {
      console.warn(`⚠️  Long computation time detected! Consider optimization.`);
    }

    console.groupEnd();
  }

  return longestPath;
}

export function getValidRoadPlacements(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize
): number[] {
  const playerRoads = gameState.roads.filter(r => r.playerId === playerId);
  const playerVillages = gameState.villages.filter(v => v.playerId === playerId);

  const allPlayerVertices = new Set<number>();
  playerRoads.forEach(r => {
    allPlayerVertices.add(r.from);
    allPlayerVertices.add(r.to);
  });
  playerVillages.forEach(v => allPlayerVertices.add(v.vertexId));

  const boardData = loadBoardForSize(boardSize);
  const validVertices: number[] = [];

  for (const vertexId of Array.from(allPlayerVertices)) {
    const neighbors = boardData.adjacencyMap[vertexId] || [];
    for (const neighborId of neighbors) {
      const edgeId = vertexId < neighborId ? `${vertexId}__${neighborId}` : `${neighborId}__${vertexId}`;
      if (!gameState.edgesOccupiedBy[edgeId]) {
        if (!validVertices.includes(neighborId)) {
          validVertices.push(neighborId);
        }
      }
    }
  }

  return validVertices;
}

export function getValidVillagePlacements(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize
): number[] {
  const playerRoads = gameState.roads.filter(r => r.playerId === playerId);
  const playerVillages = gameState.villages.filter(v => v.playerId === playerId);

  const allPlayerVertices = new Set<number>();
  playerRoads.forEach(r => {
    allPlayerVertices.add(r.from);
    allPlayerVertices.add(r.to);
  });
  playerVillages.forEach(v => allPlayerVertices.add(v.vertexId));

  const validVertices: number[] = [];

  for (const vertexId of Array.from(allPlayerVertices)) {
    if (canPlaceVillage(vertexId, gameState.verticesOccupiedBy || {}, boardSize)) {
      validVertices.push(vertexId);
    }
  }

  return validVertices;
}

export function getPlayerVillages(playerId: string, gameState: GameState): Village[] {
  return gameState.villages.filter(v => v.playerId === playerId && v.type === 'settlement');
}

export function getRoadsAtVertex(
  vertexId: number,
  roads: Road[],
  playerId?: string
): Road[] {
  const roadsAtVertex = roads.filter(r => r.from === vertexId || r.to === vertexId);

  if (playerId) {
    return roadsAtVertex.filter(r => r.playerId === playerId);
  }

  return roadsAtVertex;
}

export interface RoadDisruption {
  playerId: string;
  oldLength: number;
  newLength: number;
}

export function recalculateAllPlayersRoadLengths(
  gameState: GameState,
  vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }>
): Map<string, number> {
  const roadLengths = new Map<string, number>();

  const playerIds = new Set(gameState.roads.map(r => r.playerId));

  for (const playerId of playerIds) {
    const length = calculateLongestRoadPath(playerId, gameState.roads, vertices, false);
    roadLengths.set(playerId, length);
  }

  return roadLengths;
}

export function checkForRoadDisruptions(
  vertexId: number,
  placingPlayerId: string,
  gameState: GameState,
  vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }>,
  currentLongestRoadLengths: Map<string, number>
): RoadDisruption[] {
  const disruptions: RoadDisruption[] = [];

  const playerIds = new Set(gameState.roads.map(r => r.playerId));

  for (const playerId of playerIds) {
    if (playerId === placingPlayerId) {
      continue;
    }

    const roadsAtVertex = getRoadsAtVertex(vertexId, gameState.roads, playerId);

    if (roadsAtVertex.length >= 2) {
      const oldLength = currentLongestRoadLengths.get(playerId) || 0;
      const newLength = calculateLongestRoadPath(playerId, gameState.roads, vertices, false);

      if (newLength < oldLength) {
        disruptions.push({
          playerId,
          oldLength,
          newLength
        });
      }
    }
  }

  return disruptions;
}
