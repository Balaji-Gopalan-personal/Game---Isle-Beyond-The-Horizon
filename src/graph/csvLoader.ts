import { BoardGraph, BoardVertex, BoardEdge, buildGraph } from './boardData';
import { BoardSize } from '../data/boardConfigs';
import { BOARD_STRUCTURES } from '../data/boardStructure';

interface Center {
  id: number;
  vertices: number[];
  x: number;
  y: number;
  resourceType: 'desert' | 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral';
  value: number;
}

// CSV data imports
import TinyBoard from './data/Tiny_board.csv?raw';
import SmallBoard from './data/Small_board.csv?raw';
import StandardBoard from './data/Standard_board.csv?raw';
import LargeBoard from './data/Large_board.csv?raw';
import HugeBoard from './data/Huge_board.csv?raw';

// Center CSV data imports
import TinyCenters from './data/Tiny_centres.csv?raw';
import SmallCenters from './data/Small_centres.csv?raw';
import StandardCenters from './data/Standard_centres.csv?raw';
import LargeCenters from './data/Large_centres.csv?raw';
import HugeCenters from './data/Huge_centres.csv?raw';

const CSV_DATA: Record<BoardSize, string> = {
  tiny: TinyBoard,
  small: SmallBoard,
  standard: StandardBoard,
  large: LargeBoard,
  huge: HugeBoard
};

const CENTER_CSV_DATA: Record<BoardSize, string> = {
  tiny: TinyCenters,
  small: SmallCenters,
  standard: StandardCenters,
  large: LargeCenters,
  huge: HugeCenters
};

function calculateVertexPositions(vertices: BoardVertex[]): void {
  // This function will be updated to use proper board structure
  // For now, keep existing logic but we'll improve it
  const verticesByRow = new Map<string, BoardVertex[]>();
  
  vertices.forEach(vertex => {
    // Extract row letter from vertex ID (assuming format like V001, V002, etc.)
    // We need to determine which row each vertex belongs to based on the CSV structure
    const vertexNum = parseInt(vertex.id.substring(1));
    
    // For now, we'll calculate row based on vertex ranges
    // This is a simplified approach - ideally we'd parse the actual row structure
    let row = 'A';
    if (vertexNum <= 3) row = 'A';
    else if (vertexNum <= 7) row = 'B';
    else if (vertexNum <= 11) row = 'C';
    else if (vertexNum <= 16) row = 'D';
    else if (vertexNum <= 21) row = 'E';
    else if (vertexNum <= 27) row = 'F';
    else if (vertexNum <= 33) row = 'G';
    else if (vertexNum <= 38) row = 'H';
    else if (vertexNum <= 43) row = 'I';
    else if (vertexNum <= 47) row = 'J';
    else if (vertexNum <= 51) row = 'K';
    else row = 'L';
    
    if (!verticesByRow.has(row)) {
      verticesByRow.set(row, []);
    }
    verticesByRow.get(row)!.push(vertex);
  });
  
  // Sort vertices within each row by their ID
  verticesByRow.forEach(rowVertices => {
    rowVertices.sort((a, b) => parseInt(a.id.substring(1)) - parseInt(b.id.substring(1)));
  });
  
  // Define proper hexagonal spacing
  const horizontalSpacing = 80; // Base horizontal spacing between adjacent vertices
  const verticalSpacing = horizontalSpacing * 2; // Vertical spacing = 2x horizontal
  
  // Calculate positions for each row
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  let currentY = 60; // Starting Y position
  
  rows.forEach(rowLabel => {
    const rowVertices = verticesByRow.get(rowLabel);
    if (!rowVertices || rowVertices.length === 0) return;
    
    const vertexCount = rowVertices.length;
    
    // Calculate starting X position to center the row
    let startX: number;
    if (vertexCount % 2 === 1) {
      // Odd number: center on middle vertex
      const middleIndex = Math.floor(vertexCount / 2);
      startX = 400 - (middleIndex * horizontalSpacing); // 400 is board center X
    } else {
      // Even number: center between two middle vertices
      const leftMiddleIndex = (vertexCount / 2) - 1;
      startX = 400 - (leftMiddleIndex * horizontalSpacing + horizontalSpacing / 2);
    }
    
    // Position vertices in this row
    rowVertices.forEach((vertex, index) => {
      vertex.x = startX + (index * horizontalSpacing);
      vertex.y = currentY;
    });
    
    currentY += verticalSpacing;
  });
}

function calculateVertexPositionsFromStructure(vertices: BoardVertex[], boardSize: BoardSize): void {
  const vertexRowCounts = getVertexRowCounts(boardSize);
  
  // Define correct vertex ranges for each board size and row
  const vertexRanges: Record<BoardSize, number[][]> = {
    tiny: [
      [1, 1], [2, 3], [4, 5], [6, 8], [9, 11], [12, 15], 
      [16, 19], [20, 22], [23, 25], [26, 27], [28, 29], [30, 30]
    ],
    small: [
      [1, 2], [3, 5], [6, 8], [9, 12], [13, 16], [17, 21], 
      [22, 26], [27, 30], [31, 34], [35, 37], [38, 40], [41, 42]
    ],
    standard: [
      [1, 3], [4, 7], [8, 11], [12, 16], [17, 21], [22, 27], 
      [28, 33], [34, 38], [39, 43], [44, 47], [48, 51], [52, 54]
    ],
    large: [
      [1, 4], [5, 9], [10, 14], [15, 20], [21, 26], [27, 33], 
      [34, 40], [41, 46], [47, 52], [53, 57], [58, 62], [63, 66]
    ],
    huge: [
      [1, 5], [6, 11], [12, 17], [18, 24], [25, 31], [32, 39], 
      [40, 47], [48, 54], [55, 61], [62, 67], [68, 73], [74, 78]
    ]
  };

  // Calculate horizontal spacing to make board width equal to height
  const verticalSpacing = 320; // Keep vertical spacing constant
  const totalHeight = (vertexRowCounts.length - 1) * verticalSpacing;
  
  // Find the widest row to calculate horizontal spacing
  const maxVerticesInRow = Math.max(...Object.values(vertexRanges[boardSize]).map(([start, end]) => end - start + 1));
  const horizontalSpacing = totalHeight / (maxVerticesInRow - 1);
  
  const boardCenterX = 400; // Board center X coordinate
  const startY = 60; // Starting Y position
  
  const ranges = vertexRanges[boardSize];
  
  // Sort vertices by ID to process them in order
  vertices.sort((a, b) => a.id - b.id);
  
  // Process each of the 12 rows
  for (let rowIndex = 0; rowIndex < ranges.length; rowIndex++) {
    const [startVertex, endVertex] = ranges[rowIndex];
    const verticesInRow = endVertex - startVertex + 1;
    const rowY = startY + (rowIndex * verticalSpacing);
    
    // Calculate starting X position to center the row
    let startX: number;
    if (verticesInRow % 2 === 1) {
      // Odd number: center on middle vertex
      const middleIndex = Math.floor(verticesInRow / 2);
      startX = boardCenterX - (middleIndex * horizontalSpacing);
    } else {
      // Even number: center between two middle vertices
      const leftMiddleIndex = (verticesInRow / 2) - 1;
      startX = boardCenterX - (leftMiddleIndex * horizontalSpacing + horizontalSpacing / 2);
    }
    
    // Position vertices in this row
    for (let vertexNum = startVertex; vertexNum <= endVertex; vertexNum++) {
      const vertex = vertices.find(v => v.id === vertexNum);
      if (vertex) {
        const posInRow = vertexNum - startVertex;
        vertex.x = startX + (posInRow * horizontalSpacing);
        vertex.y = rowY;
      }
    }
  }
}

function parseCentersFromCSV(boardSize: BoardSize, vertices: BoardVertex[]): Center[] {
  const centerCsvText = CENTER_CSV_DATA[boardSize];
  if (!centerCsvText) {
    console.error(`No center CSV data found for board size: ${boardSize}`);
    console.error(`Available center CSV data:`, Object.keys(CENTER_CSV_DATA));
    throw new Error(`No center CSV data found for board size: ${boardSize}. Available: ${Object.keys(CENTER_CSV_DATA).join(', ')}`);
  }
  
  console.log(`=== PARSING CENTERS FROM CSV FOR ${boardSize.toUpperCase()} ===`);
  console.log(`CSV content length: ${centerCsvText.length}`);
  console.log(`Using center CSV file: ${boardSize}_centres.csv`);
  
  const lines = centerCsvText.trim().split('\n');
  const centers: Center[] = [];
  
  console.log(`CSV lines: ${lines.length}`);
  console.log(`First few lines:`, lines.slice(0, 5));
  
  // Skip header lines (first line is TotalCentres, second is column headers)
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(',');
    if (parts.length < 8) {
      console.warn(`Invalid center CSV line: ${line}`);
      continue;
    }
    
    const centerId = parseInt(parts[0]);
    const topVertex = parseInt(parts[1]);
    const centerVertices = [
      parseInt(parts[2]), parseInt(parts[3]), parseInt(parts[4]),
      parseInt(parts[5]), parseInt(parts[6]), parseInt(parts[7])
    ];
    
    console.log(`Processing center ${centerId}: topVertex=${topVertex}, vertices=[${centerVertices.join(',')}]`);
    
    // Calculate center position as average of all 6 vertices (columns 3-8)
    const centerPosition = calculateCenterPosition(centerVertices, vertices);
    if (!centerPosition) {
      console.warn(`Could not calculate position for center ${centerId} with vertices [${centerVertices.join(',')}]`);
      continue;
    }
    
    console.log(`Center ${centerId} positioned at (${centerPosition.x}, ${centerPosition.y}) as average of vertices [${centerVertices.join(',')}]`);
    
    centers.push({
      id: centerId,
      vertices: centerVertices,
      x: centerPosition.x,
      y: centerPosition.y,
      resourceType: 'clay', // Will be assigned below
      value: 0 // Will be assigned below
    });
  }
  
  console.log(`=== PARSED ${centers.length} CENTERS FROM CSV ===`);
  centers.forEach(c => console.log(`Center ${c.id}: (${c.x}, ${c.y}) vertices=[${c.vertices.join(',')}]`));
  
  // Assign resource types and values
  assignResourceTypesAndValues(centers);
  
  return centers;
}

function calculateCenterPosition(centerVertices: number[], vertices: BoardVertex[]): { x: number; y: number } {
  // Find the vertices that make up this center
  const centerVertexObjects = centerVertices
    .map(vNum => vertices.find(v => v.id === vNum))
    .filter(v => v !== undefined) as BoardVertex[];
  
  if (centerVertexObjects.length === 0) {
    console.warn(`No vertices found for center with vertices: ${centerVertices}`);
    return null;
  }
  
  // Calculate average position of all vertices
  const avgX = centerVertexObjects.reduce((sum, v) => sum + v.x, 0) / centerVertexObjects.length;
  const avgY = centerVertexObjects.reduce((sum, v) => sum + v.y, 0) / centerVertexObjects.length;
  
  console.log(`Calculated center position from ${centerVertexObjects.length} vertices: (${avgX}, ${avgY})`);
  
  return { x: avgX, y: avgY };
}

function assignResourceTypesAndValues(centers: Center[]): void {
  // IMPORTANT: Ensure at least one center per resource type
  const allResourceTypes: ('clay' | 'lumber' | 'grain' | 'fabric' | 'mineral')[] =
    ['clay', 'lumber', 'grain', 'fabric', 'mineral'];

  // Create resource type array - must have at least one of each type
  const resourceTypes: ('clay' | 'lumber' | 'grain' | 'fabric' | 'mineral')[] = [];

  // First, add one of each resource type to guarantee coverage
  resourceTypes.push(...allResourceTypes);

  // Calculate how many more resources we need (minus 1 for desert)
  const remainingSlots = (centers.length - 1) - allResourceTypes.length;

  // Fill remaining slots by distributing evenly
  if (remainingSlots > 0) {
    const resourcesPerType = Math.floor(remainingSlots / 5);
    const extraSlots = remainingSlots % 5;

    // Add equal amounts of each resource type
    allResourceTypes.forEach(type => {
      for (let i = 0; i < resourcesPerType; i++) {
        resourceTypes.push(type);
      }
    });

    // Distribute any extra slots randomly
    for (let i = 0; i < extraSlots; i++) {
      resourceTypes.push(allResourceTypes[i % 5]);
    }
  }

  // Shuffle resource types to randomize placement
  for (let i = resourceTypes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [resourceTypes[i], resourceTypes[j]] = [resourceTypes[j], resourceTypes[i]];
  }

  // Number tokens (excluding 7)
  const baseNumbers = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
  const allNumbers: number[] = [];
  while (allNumbers.length < centers.length - 1) {
    allNumbers.push(...baseNumbers);
  }
  allNumbers.splice(centers.length - 1); // Trim to exact size needed

  // Shuffle numbers
  for (let i = allNumbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allNumbers[i], allNumbers[j]] = [allNumbers[j], allNumbers[i]];
  }

  // Randomly assign one center as desert
  const desertIndex = Math.floor(Math.random() * centers.length);

  // Assign resource types and values
  let resourceIndex = 0;
  let numberIndex = 0;

  centers.forEach((center, index) => {
    if (index === desertIndex) {
      center.resourceType = 'desert';
      center.value = 0;
    } else {
      center.resourceType = resourceTypes[resourceIndex];
      center.value = allNumbers[numberIndex];
      resourceIndex++;
      numberIndex++;
    }
  });

  // Log resource distribution to verify
  const resourceCounts = {
    clay: 0,
    lumber: 0,
    grain: 0,
    fabric: 0,
    mineral: 0,
    desert: 0
  };
  centers.forEach(c => resourceCounts[c.resourceType]++);
  console.log('Resource distribution:', resourceCounts);
}

function generateCenters(vertices: BoardVertex[], boardSize: BoardSize): Center[] {
  const centerRowCounts = getCenterRowCounts(boardSize);
  const centers: Center[] = [];
  let centerId = 1;
  
  // Calculate center positions based on vertex positions
  const centerSpacing = 120; // Distance between center points
  const startY = 120; // Starting Y position for centers
  
  for (let rowIndex = 0; rowIndex < centerRowCounts.length; rowIndex++) {
    const centersInRow = centerRowCounts[rowIndex];
    const centerY = startY + (rowIndex * centerSpacing);
    
    for (let colIndex = 0; colIndex < centersInRow; colIndex++) {
      const centerX = (colIndex - (centersInRow - 1) / 2) * 120 + (vertices.length > 0 ? vertices[0].x : 0);
      
      centers.push({
        id: centerId++,
        vertices: [], // Will be calculated based on adjacent vertices
        x: centerX,
        y: centerY,
        resourceType: 'clay', // Will be randomized below
        value: 0 // Will be assigned below
      });
    }
  }
  
  // Assign resource types randomly
  const resourceTypes: ('clay' | 'lumber' | 'grain' | 'fabric' | 'mineral')[] = [];
  const resourceCount = Math.floor(centers.length / 5);
  
  // Fill with equal amounts of each resource type
  ['clay', 'lumber', 'grain', 'fabric', 'mineral'].forEach(type => {
    for (let i = 0; i < resourceCount; i++) {
      resourceTypes.push(type as any);
    }
  });
  
  // Fill remaining slots
  while (resourceTypes.length < centers.length) {
    resourceTypes.push('clay');
  }
  
  // Shuffle resource types
  for (let i = resourceTypes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [resourceTypes[i], resourceTypes[j]] = [resourceTypes[j], resourceTypes[i]];
  }
  
  // Assign one random center as desert
  const desertIndex = Math.floor(Math.random() * centers.length);
  
  // Assign resource types and values
  centers.forEach((center, index) => {
    if (index === desertIndex) {
      center.resourceType = 'desert';
      center.value = 0;
    } else {
      const resourceIndex = index > desertIndex ? index - 1 : index;
      center.resourceType = resourceTypes[resourceIndex % resourceTypes.length];
      // Assign random values 2-12 excluding 7
      const possibleValues = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];
      center.value = possibleValues[Math.floor(Math.random() * possibleValues.length)];
    }
  });
  
  return centers;
}

function getVertexRowCounts(boardSize: BoardSize): number[] {
  const vertexRowCounts: Record<BoardSize, number[]> = {
    tiny: [1, 2, 2, 3, 3, 4, 4, 3, 3, 2, 2, 1],
    small: [2, 3, 3, 4, 4, 5, 5, 4, 4, 3, 3, 2],
    standard: [3, 4, 4, 5, 5, 6, 6, 5, 5, 4, 4, 3],
    large: [4, 5, 5, 6, 6, 7, 7, 6, 6, 5, 5, 4],
    huge: [5, 6, 6, 7, 7, 8, 8, 7, 7, 6, 6, 5]
  };
  return vertexRowCounts[boardSize];
}

function getCenterRowCounts(boardSize: BoardSize): number[] {
  const centerRowCounts: Record<BoardSize, number[]> = {
    tiny: [1, 1, 2, 2, 3, 3, 2, 2, 1, 1],
    small: [1, 2, 2, 3, 3, 4, 4, 3, 3, 2, 2, 1],
    standard: [2, 2, 3, 3, 4, 4, 5, 5, 4, 4, 3, 3, 2, 2],
    large: [2, 3, 3, 4, 4, 5, 5, 6, 6, 5, 5, 4, 4, 3, 3, 2],
    huge: [3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3]
  };
  return centerRowCounts[boardSize];
}

export function loadBoardFromCSV(boardSize: BoardSize): { graph: BoardGraph; centers: Center[]; adjacencyMap: Record<string, number[]> } {
  const csvText = CSV_DATA[boardSize];
  if (!csvText) {
    console.error(`No CSV data found for board size: ${boardSize}`);
    console.error(`Available CSV data:`, Object.keys(CSV_DATA));
    throw new Error(`No CSV data found for board size: ${boardSize}. Available: ${Object.keys(CSV_DATA).join(', ')}`);
  }
  
  console.log(`=== LOADING BOARD DATA FOR ${boardSize.toUpperCase()} ===`);
  console.log(`Using board CSV file: ${boardSize}_board.csv`);
  console.log(`CSV text length: ${csvText.length} characters`);
  
  // Parse CSV and extract adjacency data
  const lines = csvText.trim().split('\n');
  const vertices: BoardVertex[] = [];
  const edges: Omit<BoardEdge, 'id'>[] = [];
  const adjacencyMap: Record<number, number[]> = {};
  const edgeSet = new Set<string>(); // To avoid duplicate edges
  
  console.log(`Processing ${lines.length - 1} CSV lines (excluding header)`);
  
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const [vertexStr, adjacentStr] = line.split(',');
    const vertexId = parseInt(vertexStr);
    const adjacentVertices = adjacentStr.trim().split(/\s+/).map(v => parseInt(v.trim())).filter(v => !isNaN(v));
    
    // Store adjacency data using vertex number as key
    adjacencyMap[vertexId] = adjacentVertices;
    
    console.log(`CSV parsing: Vertex ${vertexId} -> Adjacent vertices: [${adjacentVertices.join(', ')}]`);
    
    // Create vertex with placeholder coordinates
    const vertex: BoardVertex = {
      id: vertexId,
      x: 0,
      y: 0
    };
    vertices.push(vertex);
    
    // Create edges from this vertex to its adjacent vertices
    for (const adjVertex of adjacentVertices) {
      // Only add each edge once by ensuring smaller vertex ID comes first
      const edgeKey = vertexId < adjVertex ? `${vertexId}__${adjVertex}` : `${adjVertex}__${vertexId}`;
      
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        const edge: Omit<BoardEdge, 'id'> = {
          v1: Math.min(vertexId, adjVertex),
          v2: Math.max(vertexId, adjVertex),
          kind: 'land'
        };
        edges.push(edge);
      }
    }
    
    // Create edges (only add each edge once by checking if v1 < v2)
    for (const adjVertex of adjacentVertices) {
      if (vertexId < adjVertex) {
        const edge: Omit<BoardEdge, 'id'> = {
          v1: vertexId,
          v2: adjVertex,
          kind: 'land'
        };
        edges.push(edge);
      }
    }
  }
  
  console.log(`Created ${edges.length} edges from CSV adjacency data`);
  
  // Validate adjacency map was populated
  if (Object.keys(adjacencyMap).length === 0) {
    console.error(`Failed to parse adjacency data from CSV for board size: ${boardSize}`);
    console.error(`CSV content preview:`, csvText.substring(0, 200));
    throw new Error(`Adjacency data for '${boardSize}' board is missing. Check CSV sources.`);
  }
  
  console.log(`Successfully parsed ${Object.keys(adjacencyMap).length} vertices with adjacency data for ${boardSize} board`);
  console.log(`Sample adjacency entries:`, Object.entries(adjacencyMap).slice(0, 3));
  
  // Validate edges against adjacency map - should now be consistent
  const invalidEdges: string[] = [];
  edges.forEach((edge, index) => {
    if (!edge.v1 || !edge.v2) {
      invalidEdges.push(`Edge ${index}: missing v1 or v2`);
      return;
    }
    
    const v1Num = edge.v1;
    const v2Num = edge.v2;
    
    // Check if vertices exist in adjacency map
    if (!adjacencyMap[v1Num]) {
      invalidEdges.push(`Edge ${index}: vertex ${v1Num} not in adjacency map`);
    }
    if (!adjacencyMap[v2Num]) {
      invalidEdges.push(`Edge ${index}: vertex ${v2Num} not in adjacency map`);
    }
    
    // Check adjacency consistency
    if (adjacencyMap[v1Num] && !adjacencyMap[v1Num].includes(v2Num)) {
      invalidEdges.push(`Edge ${index}: ${v1Num} not adjacent to ${v2Num} in adjacency map`);
    }
    if (adjacencyMap[v2Num] && !adjacencyMap[v2Num].includes(v1Num)) {
      invalidEdges.push(`Edge ${index}: ${v2Num} not adjacent to ${v1Num} in adjacency map`);
    }
  });
  
  if (invalidEdges.length > 0) {
    console.error(`Board data validation failed for ${boardSize}:`, invalidEdges);
    console.warn(`Board data validation warnings for ${boardSize}: ${invalidEdges.length} issues found`);
    // Don't throw error, just log warnings since edges are now generated from adjacency data
  }
  
  // Use proper structure-based positioning
  calculateVertexPositionsFromStructure(vertices, boardSize);
  
  // Parse centers from CSV instead of generating them
  console.log(`=== PARSING CENTERS FROM ${boardSize.toUpperCase()}_CENTRES.CSV ===`);
  const centers = parseCentersFromCSV(boardSize, vertices);
  console.log(`Successfully loaded ${centers.length} centers from ${boardSize}_centres.csv`);
  
  return {
    graph: buildGraph({ vertices, edges }),
    centers,
    adjacencyMap,
    validationStats: {
      verticesLoaded: vertices.length,
      edgesLoaded: edges.length,
      adjacencyEntries: Object.keys(adjacencyMap).length
    }
  };
}