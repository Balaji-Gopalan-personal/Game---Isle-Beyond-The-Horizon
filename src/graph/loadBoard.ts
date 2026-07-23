import rawSmall from './data/standard-small.json';
import { buildGraph, BoardGraph } from './boardData';
import { BoardSize } from '../data/boardConfigs';
import { loadBoardFromCSV } from './csvLoader';

interface Center {
  id: number;
  vertices: number[];
  x: number;
  y: number;
  resourceType: 'desert' | 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral';
  value: number;
}

interface BoardWithCenters {
  graph: BoardGraph;
  centers: Center[];
  adjacencyMap: Record<string, number[]>;
  validationStats?: {
    verticesLoaded: number;
    edgesLoaded: number;
    adjacencyEntries: number;
  };
}

let graphCache: BoardGraph | null = null;
const boardCacheBySize: Record<string, BoardWithCenters> = {};

export function loadBoardGraph(size: BoardSize = 'standard'): BoardGraph {
  // Use the CSV loader for all board sizes now
  const boardData = loadBoardFromCSV(size);
  return boardData.graph;
}

export function loadBoardForSize(boardSize: BoardSize): BoardWithCenters {
  if (boardCacheBySize[boardSize]) return boardCacheBySize[boardSize];
  
  console.log(`Loading board data for size: ${boardSize}`);
  
  // Load actual CSV data for each board size
  const boardData = loadBoardFromCSV(boardSize);
  
  // Validate adjacency map exists
  if (!boardData.adjacencyMap || Object.keys(boardData.adjacencyMap).length === 0) {
    console.error(`Adjacency map validation failed for board size: ${boardSize}`);
    console.error(`Board data keys:`, Object.keys(boardData));
    console.error(`Adjacency map:`, boardData.adjacencyMap);
    throw new Error(`Adjacency map is missing or empty for board size: ${boardSize}. Check CSV parsing.`);
  }
  
  console.log(`Loaded adjacency map with ${Object.keys(boardData.adjacencyMap).length} vertices for ${boardSize} board`);
  console.log(`Loaded ${Object.keys(boardData.graph.edges).length} edges for ${boardSize} board`);
  
  // Log validation stats
  if (boardData.validationStats) {
    console.log(`Board validation stats for ${boardSize}:`, boardData.validationStats);
  }
  
  // Validate all board sizes are supported
  const supportedSizes: BoardSize[] = ['tiny', 'small', 'standard', 'large', 'huge'];
  if (!supportedSizes.includes(boardSize)) {
    throw new Error(`Board size '${boardSize}' is not supported. Supported sizes: ${supportedSizes.join(', ')}`);
  }
  
  boardCacheBySize[boardSize] = {
    graph: boardData.graph,
    centers: boardData.centers,
    adjacencyMap: boardData.adjacencyMap,
    validationStats: boardData.validationStats
  };
  return boardCacheBySize[boardSize];
}

// Clears the cached board (including randomized hex/center layout) so the next
// loadBoardForSize call regenerates a fresh randomized board instead of reusing
// the previous game's layout for the same board size.
export function clearLoadedBoardCache(): void {
  Object.keys(boardCacheBySize).forEach(key => delete boardCacheBySize[key]);
}