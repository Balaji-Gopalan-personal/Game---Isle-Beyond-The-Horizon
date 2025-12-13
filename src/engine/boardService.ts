import { BoardSize } from '../data/boardConfigs';
import { loadBoardForSize } from '../graph/loadBoard';
import { GameState } from '../types/game';

export interface BoardData {
  adjacencyMap: Record<number, number[]>;
  totalVertices: number;
  boardSize: BoardSize;
}

let cachedBoardData: Map<BoardSize, BoardData> = new Map();

export function getBoardData(boardSize: BoardSize): BoardData {
  if (cachedBoardData.has(boardSize)) {
    return cachedBoardData.get(boardSize)!;
  }

  const boardGraph = loadBoardForSize(boardSize);
  const boardData: BoardData = {
    adjacencyMap: boardGraph.adjacencyMap,
    totalVertices: Object.keys(boardGraph.adjacencyMap).length,
    boardSize
  };

  cachedBoardData.set(boardSize, boardData);
  return boardData;
}

export function getAdjacentVertices(vertexId: number, boardSize: BoardSize): number[] {
  const boardData = getBoardData(boardSize);
  return boardData.adjacencyMap[vertexId] || [];
}

export function isVertexOccupied(vertexId: number, gameState: GameState): boolean {
  return !!gameState.verticesOccupiedBy[vertexId];
}

export function isEdgeOccupied(v1: number, v2: number, gameState: GameState): boolean {
  const edgeId = v1 < v2 ? `${v1}__${v2}` : `${v2}__${v1}`;
  return !!gameState.edgesOccupiedBy[edgeId];
}

export function getEdgeId(v1: number, v2: number): string {
  return v1 < v2 ? `${v1}__${v2}` : `${v2}__${v1}`;
}

export function canPlaceVillageAtVertex(
  vertexId: number,
  verticesOccupiedBy: Record<number, string | null>,
  boardSize: BoardSize
): { canPlace: boolean; reason?: string } {
  if (verticesOccupiedBy[vertexId]) {
    return { canPlace: false, reason: `Vertex ${vertexId} is already occupied` };
  }

  const adjacentVertices = getAdjacentVertices(vertexId, boardSize);
  for (const neighborId of adjacentVertices) {
    if (verticesOccupiedBy[neighborId]) {
      return {
        canPlace: false,
        reason: `Adjacent vertex ${neighborId} is occupied (distance rule violated)`
      };
    }
  }

  return { canPlace: true };
}

export function canPlaceRoadOnEdge(
  v1: number,
  v2: number,
  edgesOccupiedBy: Record<string, string | null>,
  boardSize: BoardSize
): { canPlace: boolean; reason?: string } {
  const adjacentVertices = getAdjacentVertices(v1, boardSize);
  if (!adjacentVertices.includes(v2)) {
    return { canPlace: false, reason: `Vertices ${v1} and ${v2} are not adjacent` };
  }

  const edgeId = getEdgeId(v1, v2);
  if (edgesOccupiedBy[edgeId]) {
    return { canPlace: false, reason: `Edge ${edgeId} is already occupied` };
  }

  return { canPlace: true };
}

export function getValidVillageVertices(
  verticesOccupiedBy: Record<number, string | null>,
  boardSize: BoardSize
): number[] {
  const boardData = getBoardData(boardSize);
  const validVertices: number[] = [];

  for (const vertexId of Object.keys(boardData.adjacencyMap).map(Number)) {
    const result = canPlaceVillageAtVertex(vertexId, verticesOccupiedBy, boardSize);
    if (result.canPlace) {
      validVertices.push(vertexId);
    }
  }

  return validVertices;
}

export function getValidRoadEdgesFromVertex(
  vertexId: number,
  edgesOccupiedBy: Record<string, string | null>,
  boardSize: BoardSize
): string[] {
  const adjacentVertices = getAdjacentVertices(vertexId, boardSize);
  const validEdges: string[] = [];

  for (const neighborId of adjacentVertices) {
    const result = canPlaceRoadOnEdge(vertexId, neighborId, edgesOccupiedBy, boardSize);
    if (result.canPlace) {
      validEdges.push(getEdgeId(vertexId, neighborId));
    }
  }

  return validEdges;
}

export function getPlayerOwnedVertices(
  playerId: string,
  gameState: GameState
): number[] {
  const ownedVertices = new Set<number>();

  gameState.roads.filter(r => r.playerId === playerId).forEach(road => {
    ownedVertices.add(road.from);
    ownedVertices.add(road.to);
  });

  gameState.villages.filter(v => v.playerId === playerId).forEach(village => {
    ownedVertices.add(village.vertexId);
  });

  return Array.from(ownedVertices);
}

export function clearBoardCache(): void {
  cachedBoardData.clear();
}
