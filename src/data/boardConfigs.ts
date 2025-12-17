// Re-export from boardStructure for backward compatibility
export { BOARD_STRUCTURES as BOARD_CONFIGS, type BoardSize } from './boardStructure';

// Generate board data for any size configuration  
export const generateBoardData = (boardSize: BoardSize) => {
  const config = BOARD_CONFIGS[boardSize];
  const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  
  const vertices: Array<{
    id: number;
    row: string;
    position: number;
    x: number;
    y: number;
  }> = [];
  
  const centers: Array<{
    id: number;
    vertices: number[];
    x: number;
    y: number;
    resourceType: 'desert' | 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral';
    value: number;
  }> = [];
  
  const edges: Array<{
    from: number;
    to: number;
  }> = [];
  
  let vertexId = 1;
  
  // Generate vertices with proper centering
  for (let rowIndex = 0; rowIndex < 12; rowIndex++) {
    const rowCount = config.rowCounts[rowIndex];
    const rowLabel = rowLabels[rowIndex];
    const y = rowIndex;
    
    // Calculate x positions to center the row
    const startX = -(rowCount - 1) * 1.04; // 0.8 * 1.3 = 1.04
    
    for (let pos = 0; pos < rowCount; pos++) {
      vertices.push({
        id: vertexId++,
        row: rowLabel,
        position: pos,
        x: startX + pos * 2.08, // 1.6 * 1.3 = 2.08
        y: y
      });
    }
  }
  
  // Create vertex lookup map
  const vertexMap = new Map<string, number>();
  vertices.forEach(v => {
    vertexMap.set(`${v.row}-${v.position}`, v.id);
  });
  
  // Generate edges - diagonal connections between expanding/contracting rows, vertical between same-size rows
  for (let rowIndex = 0; rowIndex < 11; rowIndex++) {
    const currentRowCount = config.rowCounts[rowIndex];
    const nextRowCount = config.rowCounts[rowIndex + 1];
    const currentRowLabel = rowLabels[rowIndex];
    const nextRowLabel = rowLabels[rowIndex + 1];
    
    if (nextRowCount > currentRowCount) {
      // Expanding: diagonal connections
      for (let pos = 0; pos < currentRowCount; pos++) {
        const currentVertex = vertexMap.get(`${currentRowLabel}-${pos}`);
        
        // Connect to two vertices in next row (left and right diagonal)
        const leftTarget = pos;
        const rightTarget = pos + 1;
        
        if (leftTarget < nextRowCount) {
          const leftVertex = vertexMap.get(`${nextRowLabel}-${leftTarget}`);
          if (currentVertex && leftVertex) {
            edges.push({ from: currentVertex, to: leftVertex });
          }
        }
        
        if (rightTarget < nextRowCount) {
          const rightVertex = vertexMap.get(`${nextRowLabel}-${rightTarget}`);
          if (currentVertex && rightVertex) {
            edges.push({ from: currentVertex, to: rightVertex });
          }
        }
      }
    } else if (nextRowCount < currentRowCount) {
      // Contracting: diagonal connections
      for (let pos = 0; pos < nextRowCount; pos++) {
        const nextVertex = vertexMap.get(`${nextRowLabel}-${pos}`);
        
        // Connect to two vertices in current row (left and right diagonal)
        const leftSource = pos;
        const rightSource = pos + 1;
        
        if (leftSource < currentRowCount) {
          const leftVertex = vertexMap.get(`${currentRowLabel}-${leftSource}`);
          if (leftVertex && nextVertex) {
            edges.push({ from: leftVertex, to: nextVertex });
          }
        }
        
        if (rightSource < currentRowCount) {
          const rightVertex = vertexMap.get(`${currentRowLabel}-${rightSource}`);
          if (rightVertex && nextVertex) {
            edges.push({ from: rightVertex, to: nextVertex });
          }
        }
      }
    } else {
      // Same size: vertical connections
      for (let pos = 0; pos < currentRowCount; pos++) {
        const currentVertex = vertexMap.get(`${currentRowLabel}-${pos}`);
        const nextVertex = vertexMap.get(`${nextRowLabel}-${pos}`);
        
        if (currentVertex && nextVertex) {
          edges.push({ from: currentVertex, to: nextVertex });
        }
      }
    }
  }
  
  // Generate centers using the explicit rules
  const generatedCenters = generateCentersWithRules(vertices, config);
  
  // Calculate adjacency arrays for each vertex
  const adjacencyArrays = new Map<number, number[]>();
  
  vertices.forEach(vertex => {
    const adjacent: number[] = [];
    
    edges.forEach(edge => {
      if (edge.from === vertex.id) {
        adjacent.push(edge.to);
      } else if (edge.to === vertex.id) {
        adjacent.push(edge.from);
      }
    });
    
    adjacencyArrays.set(vertex.id, adjacent.sort((a, b) => a - b));
  });
  
  return { vertices, centers: generatedCenters, edges, adjacencyArrays };
};

// Helper function to generate centers following the explicit rules
const generateCentersWithRules = (vertices: any[], config: BoardConfig) => {
  const centers: Array<{
    id: number;
    vertices: number[];
    x: number;
    y: number;
    resourceType: 'desert' | 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral';
    value: number;
  }> = [];
  
  let centerId = 1;
  
  // For now, let's create centers based on the expected counts from BOARD_CONFIGS
  // We'll place them in valid positions between rows
  
  // Based on original CENTERS data, centers are placed at these Y positions:
  // Y=1.5 (between rows A-B), Y=3.5 (between rows C-D), Y=5.5 (between rows E-F), 
  // Y=7.5 (between rows G-H), Y=9.5 (between rows I-J)
  const centerRowPositions = [1, 3, 5, 7, 9]; // Between these row pairs
  
  for (const rowIndex of centerRowPositions) {
    const rowAbove = rowIndex;
    const rowBelow = rowIndex + 1;
    
    // Check if we have valid rows
    if (rowAbove >= 0 && rowBelow < config.rowCounts.length) {
      const verticesAbove = config.rowCounts[rowAbove];
      const verticesBelow = config.rowCounts[rowBelow];

      // For expanding/contracting sections, use the smaller row count
      // For parallel sections, use row count - 1
      let centersInThisRow;
      if (verticesAbove === verticesBelow) {
        // Parallel rows - use count - 1
        centersInThisRow = verticesAbove - 1;
      } else {
        // Expanding/contracting - use smaller count
        centersInThisRow = Math.min(verticesAbove, verticesBelow);
      }

      if (centersInThisRow > 0) {
        
        // Position centers horizontally (centered)
        const startX = -(centersInThisRow - 1) * 1.04; // 0.8 * 1.3 = 1.04
        const centerY = rowIndex + 0.5; // Between the two rows
        
        for (let i = 0; i < centersInThisRow; i++) {
          centers.push({
            id: centerId++,
            vertices: [],
            x: startX + i * 2.08, // 1.6 * 1.3 = 2.08
            y: centerY,
            resourceType: 'clay', // Will be assigned randomly below
            value: 0 // Will be assigned below
          });
        }
      }
    }
  }
  
  // Assign resource types and values
  const resourceTypes: ('clay' | 'lumber' | 'grain' | 'fabric' | 'mineral')[] = [];
  const resourceCounts = {
    clay: Math.ceil(centers.length * 0.2),
    lumber: Math.ceil(centers.length * 0.2),
    grain: Math.ceil(centers.length * 0.2),
    fabric: Math.ceil(centers.length * 0.2),
    mineral: Math.ceil(centers.length * 0.2)
  };
  
  // Fill resource types array
  Object.entries(resourceCounts).forEach(([type, count]) => {
    for (let i = 0; i < count; i++) {
      resourceTypes.push(type as 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral');
    }
  });
  
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
};