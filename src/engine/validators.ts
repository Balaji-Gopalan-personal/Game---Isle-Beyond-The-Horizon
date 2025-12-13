import { loadBoardGraph, loadBoardForSize } from '../graph/loadBoard';
import { BoardSize } from '../data/boardConfigs';

// We need to get the board size from somewhere - we'll pass it as parameter
let currentBoardSize: BoardSize = 'standard';
let currentAdjacencyMap: Record<number, number[]> = {};
let currentBoardGraph: any = null;

export function initializeValidators(boardSize: BoardSize) {
  console.log('DEBUG: Initializing validators for board size:', boardSize);
  console.log(`DEBUG: Loading adjacency data from ${boardSize}_board.csv`);
  
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
    
    console.log(`DEBUG: Successfully loaded adjacency data from ${boardSize}_board.csv`);
    console.log('DEBUG: Adjacency map loaded with', adjacencyKeys.length, 'vertices');
    console.log('DEBUG: Board graph loaded with', Object.keys(boardData.graph?.edges || {}).length, 'edges');
    console.log('DEBUG: Sample adjacency entries:', Object.entries(currentAdjacencyMap).slice(0, 3));
    
  } catch (error) {
    console.error('DEBUG: Failed to initialize validators:', error);
    throw new Error(`Failed to initialize validators: ${error.message}`);
  }
}

export function canPlaceVillage(vertexId: number, occupiedVertices: Record<number,string|null>, boardSize?: BoardSize): boolean {
  console.log(`DEBUG: canPlaceVillage called with vertexId: ${vertexId} using ${currentBoardSize}_board.csv`);
  
  if (!vertexId) {
    console.log('DEBUG: vertexId is invalid, returning false');
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
  
  // RULE 1: Vertex must be listed in column 1 of the "_board" CSV
  if (!currentAdjacencyMap[vertexId]) {
    console.log(`DEBUG: vertex ${vertexId} is not listed in column 1 of ${currentBoardSize}_board.csv, returning false`);
    return false;
  }
  
  // RULE 2: The chosen vertex must be empty (no village or estate on it)
  if (occupiedVertices[vertexId]) {
    console.log(`DEBUG: vertex ${vertexId} is occupied by ${occupiedVertices[vertexId]}, returning false`);
    return false;
  }
  
  // RULE 3: No villages/estates can exist on any of the vertices listed in column 2 of that row
  const neighbors = currentAdjacencyMap[vertexId] || [];
  console.log(`DEBUG: checking adjacent vertices from ${currentBoardSize}_board.csv for vertex ${vertexId}:`, neighbors);
  
  for (const n of neighbors) {
    if (occupiedVertices[n]) {
      console.log(`DEBUG: adjacent vertex ${n} (from column 2) is occupied by ${occupiedVertices[n]}, returning false`);
      return false;
    }
  }
  
  console.log(`DEBUG: vertex ${vertexId} passes all placement rules from ${currentBoardSize}_board.csv -> true`);
  return true;
}

export function legalRoadEdgesFrom(vertexId: number, occupiedEdges: Record<string,string|null>, boardSize?: BoardSize): string[] {
  console.log(`DEBUG: legalRoadEdgesFrom called for village at vertex ${vertexId} using ${currentBoardSize}_board.csv`);
  
  // Initialize if needed
  if (boardSize && Object.keys(currentAdjacencyMap).length === 0) {
    initializeValidators(boardSize);
  }
  
  // Defensive check for adjacency map
  if (!currentAdjacencyMap || typeof currentAdjacencyMap !== 'object') {
    throw new Error('Adjacency map is not initialized. Call initializeValidators first.');
  }
  
  // RULE: Roads can only connect the village vertex to ONE of the vertices listed in column 2 of that row
  const adjacentVertices = currentAdjacencyMap[vertexId] || [];
  console.log(`DEBUG: Village at vertex ${vertexId} can connect roads to these vertices from column 2: [${adjacentVertices.join(', ')}]`);
  
  if (adjacentVertices.length === 0) {
    console.warn(`DEBUG: Vertex ${vertexId} has no adjacent vertices listed in column 2 of ${currentBoardSize}_board.csv`);
    return [];
  }
  
  // Create edge IDs for each vertex listed in column 2, but only if no road already exists
  const edges: string[] = [];
  for (const adjVertex of adjacentVertices) {
    const edgeId = vertexId < adjVertex ? `${vertexId}__${adjVertex}` : `${adjVertex}__${vertexId}`;
    
    // Check if road already exists on this edge
    if (!occupiedEdges[edgeId]) {
      edges.push(edgeId);
      console.log(`DEBUG: Edge ${edgeId} (${vertexId} <-> ${adjVertex}) is available for road placement`);
    } else {
      console.log(`DEBUG: Edge ${edgeId} (${vertexId} <-> ${adjVertex}) already has a road, skipping`);
    }
  }
  
  console.log(`DEBUG: Legal road edges from village at vertex ${vertexId}:`, edges);
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