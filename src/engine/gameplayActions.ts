import { GameState, Road, Village } from '../types/game';
import { loadBoardForSize } from '../graph/loadBoard';
import { canPlaceVillage } from './validators';
import { BoardSize } from '../data/boardStructure';

export function calculateLongestRoadPath(
  playerId: string,
  roads: Road[],
  vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }>
): number {
  const playerRoads = roads.filter(r => r.playerId === playerId);

  if (playerRoads.length === 0) return 0;

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

  function dfs(node: number, visited: Set<number>): number {
    let maxLength = 0;
    const neighbors = adjacencyList.get(node) || [];

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        const length = 1 + dfs(neighbor, visited);
        maxLength = Math.max(maxLength, length);
        visited.delete(neighbor);
      }
    }

    return maxLength;
  }

  let longestPath = 0;
  const allVertices = Array.from(adjacencyList.keys());

  for (const startVertex of allVertices) {
    const visited = new Set<number>([startVertex]);
    const pathLength = dfs(startVertex, visited);
    longestPath = Math.max(longestPath, pathLength);
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
