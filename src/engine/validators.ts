import { loadBoardGraph, loadBoardForSize } from '../graph/loadBoard';
import { BoardSize } from '../data/boardConfigs';

// We need to get the board size from somewhere - we'll pass it as parameter
let currentBoardSize: BoardSize = 'standard';
let currentAdjacencyMap: Record<number, number[]> = {};
let currentBoardGraph: any = null;

export function initializeValidators(boardSize: BoardSize) {
  if (!boardSize) {
    throw new Error('Board size is required for validator initialization');
  }

  currentBoardSize = boardSize;
  try {
    const boardData = loadBoardForSize(boardSize);
    currentBoardGraph = boardData;

    // Defensive check for adjacency map
    if (!boardData.adjacencyMap) {
      throw new Error('Adjacency object is missing. Check board initialization.');
    }

    if (typeof boardData.adjacencyMap !== 'object') {
      throw new Error('Adjacency object is not a valid object. Check board initialization.');
    }

    const adjacencyKeys = Object.keys(boardData.adjacencyMap);
    if (adjacencyKeys.length === 0) {
      throw new Error('Adjacency object is empty. Check board initialization.');
    }

    currentBoardSize = boardSize;
    currentAdjacencyMap = boardData.adjacencyMap;

  } catch (error) {
    console.error('DEBUG: Failed to initialize validators:', error);
    throw new Error(`Failed to initialize validators: ${error.message}`);
  }
}

export function canPlaceVillage(vertexId: number, occupiedVertices: Record<number,string|null>, boardSize?: BoardSize): boolean {
  if (!vertexId) {
    return false;
  }

  // Initialize if needed
  if (boardSize && Object.keys(currentAdjacencyMap).length === 0) {
    initializeValidators(boardSize);
  }

  // Defensive check for adjacency map
  if (!currentAdjacencyMap || typeof currentAdjacencyMap !== 'object') {
    throw new Error('Adjacency map is not initialized. Call initializeValidators first.');
  }

  // RULE 1: Vertex must be valid
  if (!currentAdjacencyMap[vertexId]) {
    return false;
  }

  // RULE 2: The chosen vertex must be empty (no village or estate on it)
  if (occupiedVertices[vertexId]) {
    return false;
  }

  // RULE 3: No villages/estates can exist on any adjacent vertices
  const neighbors = currentAdjacencyMap[vertexId] || [];

  for (const n of neighbors) {
    if (occupiedVertices[n]) {
      return false;
    }
  }

  return true;
}

export function legalRoadEdgesFrom(vertexId: number, occupiedEdges: Record<string,string|null>, boardSize?: BoardSize): string[] {
  // Initialize if needed
  if (boardSize && Object.keys(currentAdjacencyMap).length === 0) {
    initializeValidators(boardSize);
  }

  // Defensive check for adjacency map
  if (!currentAdjacencyMap || typeof currentAdjacencyMap !== 'object') {
    throw new Error('Adjacency map is not initialized. Call initializeValidators first.');
  }

  // RULE: Roads can only connect the village vertex to adjacent vertices
  const adjacentVertices = currentAdjacencyMap[vertexId] || [];

  if (adjacentVertices.length === 0) {
    return [];
  }

  // Create edge IDs for each adjacent vertex, but only if no road already exists
  const edges: string[] = [];
  for (const adjVertex of adjacentVertices) {
    const edgeId = vertexId < adjVertex ? `${vertexId}__${adjVertex}` : `${adjVertex}__${vertexId}`;

    // Check if road already exists on this edge
    if (!occupiedEdges[edgeId]) {
      edges.push(edgeId);
    }
  }

  return edges;
}

export function edgeTouchesVertex(edgeId: string, v: number): boolean {
  // Parse edge ID to get vertices
  const [v1, v2] = edgeId.split('__');
  return parseInt(v1) === v || parseInt(v2) === v;
}

export function whyNotVillage(v: number, occupiedVertices: Record<number,string|null>, boardSize?: BoardSize) {
  // Initialize if needed
  if (boardSize && Object.keys(currentAdjacencyMap).length === 0) {
    initializeValidators(boardSize);
  }
  
  // Defensive check for adjacency map
  if (!currentAdjacencyMap || typeof currentAdjacencyMap !== 'object') {
    return 'Adjacency map not initialized';
  }
  
  if (occupiedVertices[v]) return `occupied by ${occupiedVertices[v]}`;
  
  const neighbors = currentAdjacencyMap[v] || [];
  for (const n of neighbors) {
    if (occupiedVertices[n]) {
      return `adjacent vertex ${n} occupied by ${occupiedVertices[n]}`;
    }
  }
  return 'OK';
}