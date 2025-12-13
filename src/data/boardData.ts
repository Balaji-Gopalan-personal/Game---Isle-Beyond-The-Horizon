// Board configuration data
export interface Vertex {
  id: number;
  row: string;
  position: number; // Position within the row
  x: number; // Grid x coordinate
  y: number; // Grid y coordinate
}

export interface Center {
  id: number;
  vertices: number[]; // Adjacent vertices in clockwise order
  x: number; // Grid x coordinate
  y: number; // Grid y coordinate
}

export interface Edge {
  from: number;
  to: number;
}

// Vertex definitions by row with proper centering
export const VERTICES: Vertex[] = [
  // Row A (1-3, centered on 2)
  { id: 1, row: 'A', position: 0, x: -1.6, y: 0 },
  { id: 2, row: 'A', position: 1, x: 0, y: 0 },
  { id: 3, row: 'A', position: 2, x: 1.6, y: 0 },
  
  // Row B (4-7, centered between 5 and 6)
  { id: 4, row: 'B', position: 0, x: -2.4, y: 1 },
  { id: 5, row: 'B', position: 1, x: -0.8, y: 1 },
  { id: 6, row: 'B', position: 2, x: 0.8, y: 1 },
  { id: 7, row: 'B', position: 3, x: 2.4, y: 1 },
  
  // Row C (8-11, centered between 9 and 10)
  { id: 8, row: 'C', position: 0, x: -2.4, y: 2 },
  { id: 9, row: 'C', position: 1, x: -0.8, y: 2 },
  { id: 10, row: 'C', position: 2, x: 0.8, y: 2 },
  { id: 11, row: 'C', position: 3, x: 2.4, y: 2 },
  
  // Row D (12-16, centered on 14)
  { id: 12, row: 'D', position: 0, x: -3.2, y: 3 },
  { id: 13, row: 'D', position: 1, x: -1.6, y: 3 },
  { id: 14, row: 'D', position: 2, x: 0, y: 3 },
  { id: 15, row: 'D', position: 3, x: 1.6, y: 3 },
  { id: 16, row: 'D', position: 4, x: 3.2, y: 3 },
  
  // Row E (17-21, centered on 19)
  { id: 17, row: 'E', position: 0, x: -3.2, y: 4 },
  { id: 18, row: 'E', position: 1, x: -1.6, y: 4 },
  { id: 19, row: 'E', position: 2, x: 0, y: 4 },
  { id: 20, row: 'E', position: 3, x: 1.6, y: 4 },
  { id: 21, row: 'E', position: 4, x: 3.2, y: 4 },
  
  // Row F (22-27, centered between 24 and 25)
  { id: 22, row: 'F', position: 0, x: -4, y: 5 },
  { id: 23, row: 'F', position: 1, x: -2.4, y: 5 },
  { id: 24, row: 'F', position: 2, x: -0.8, y: 5 },
  { id: 25, row: 'F', position: 3, x: 0.8, y: 5 },
  { id: 26, row: 'F', position: 4, x: 2.4, y: 5 },
  { id: 27, row: 'F', position: 5, x: 4, y: 5 },
  
  // Row G (28-33, centered between 30 and 31)
  { id: 28, row: 'G', position: 0, x: -4, y: 6 },
  { id: 29, row: 'G', position: 1, x: -2.4, y: 6 },
  { id: 30, row: 'G', position: 2, x: -0.8, y: 6 },
  { id: 31, row: 'G', position: 3, x: 0.8, y: 6 },
  { id: 32, row: 'G', position: 4, x: 2.4, y: 6 },
  { id: 33, row: 'G', position: 5, x: 4, y: 6 },
  
  // Row H (34-38, centered on 36)
  { id: 34, row: 'H', position: 0, x: -3.2, y: 7 },
  { id: 35, row: 'H', position: 1, x: -1.6, y: 7 },
  { id: 36, row: 'H', position: 2, x: 0, y: 7 },
  { id: 37, row: 'H', position: 3, x: 1.6, y: 7 },
  { id: 38, row: 'H', position: 4, x: 3.2, y: 7 },
  
  // Row I (39-43, centered on 41)
  { id: 39, row: 'I', position: 0, x: -3.2, y: 8 },
  { id: 40, row: 'I', position: 1, x: -1.6, y: 8 },
  { id: 41, row: 'I', position: 2, x: 0, y: 8 },
  { id: 42, row: 'I', position: 3, x: 1.6, y: 8 },
  { id: 43, row: 'I', position: 4, x: 3.2, y: 8 },
  
  // Row J (44-47, centered between 45 and 46)
  { id: 44, row: 'J', position: 0, x: -2.4, y: 9 },
  { id: 45, row: 'J', position: 1, x: -0.8, y: 9 },
  { id: 46, row: 'J', position: 2, x: 0.8, y: 9 },
  { id: 47, row: 'J', position: 3, x: 2.4, y: 9 },
  
  // Row K (48-51, centered between 49 and 50)
  { id: 48, row: 'K', position: 0, x: -2.4, y: 10 },
  { id: 49, row: 'K', position: 1, x: -0.8, y: 10 },
  { id: 50, row: 'K', position: 2, x: 0.8, y: 10 },
  { id: 51, row: 'K', position: 3, x: 2.4, y: 10 },
  
  // Row L (52-54, centered on 53)
  { id: 52, row: 'L', position: 0, x: -1.6, y: 11 },
  { id: 53, row: 'L', position: 1, x: 0, y: 11 },
  { id: 54, row: 'L', position: 2, x: 1.6, y: 11 },
];

// Centers positioned below the row below their identifying vertex
export const CENTERS: Center[] = [
  // Centers below Row B (identified by Row A vertices)
  { id: 1, vertices: [1, 5, 4], x: -1.6, y: 1.5 },
  { id: 2, vertices: [2, 6, 5, 1], x: 0, y: 1.5 },
  { id: 3, vertices: [3, 7, 6], x: 1.6, y: 1.5 },
  
  // Centers below Row D (identified by Row C vertices)
  { id: 8, vertices: [8, 12, 13, 9], x: -2.4, y: 3.5 },
  { id: 9, vertices: [9, 13, 14, 10], x: -0.8, y: 3.5 },
  { id: 10, vertices: [10, 14, 15, 11], x: 0.8, y: 3.5 },
  { id: 11, vertices: [11, 15, 16], x: 2.4, y: 3.5 },
  
  // Centers below Row F (identified by Row E vertices)
  { id: 17, vertices: [17, 23, 22], x: -3.2, y: 5.5 },
  { id: 18, vertices: [18, 24, 23, 17], x: -1.6, y: 5.5 },
  { id: 19, vertices: [19, 25, 24, 18], x: 0, y: 5.5 },
  { id: 20, vertices: [20, 26, 25, 19], x: 1.6, y: 5.5 },
  { id: 21, vertices: [21, 27, 26, 20], x: 3.2, y: 5.5 },
  
  // Centers below Row H (identified by Row G vertices)
  { id: 29, vertices: [29, 34, 35, 30], x: -2.4, y: 7.5 },
  { id: 30, vertices: [30, 35, 36, 31], x: -0.8, y: 7.5 },
  { id: 31, vertices: [31, 36, 37, 32], x: 0.8, y: 7.5 },
  { id: 32, vertices: [32, 37, 38, 33], x: 2.4, y: 7.5 },
  
  // Centers below Row J (identified by Row I vertices)
  { id: 40, vertices: [40, 45, 44, 39], x: -1.6, y: 9.5 },
  { id: 41, vertices: [41, 46, 45, 40], x: 0, y: 9.5 },
  { id: 42, vertices: [42, 47, 46, 41], x: 1.6, y: 9.5 },
];

// Valid edges (only diagonal adjacencies, no horizontal connections)
export const EDGES: Edge[] = [
  // Row A to Row B diagonal connections
  { from: 1, to: 4 }, { from: 1, to: 5 },
  { from: 2, to: 5 }, { from: 2, to: 6 },
  { from: 3, to: 6 }, { from: 3, to: 7 },
  
  // Row B to Row C vertical connections
  { from: 4, to: 8 },
  { from: 5, to: 9 },
  { from: 6, to: 10 },
  { from: 7, to: 11 },
  
  // Row C to Row D diagonal connections
  { from: 8, to: 12 }, { from: 8, to: 13 },
  { from: 9, to: 13 }, { from: 9, to: 14 },
  { from: 10, to: 14 }, { from: 10, to: 15 },
  { from: 11, to: 15 }, { from: 11, to: 16 },
  
  // Row D to Row E vertical connections
  { from: 12, to: 17 },
  { from: 13, to: 18 },
  { from: 14, to: 19 },
  { from: 15, to: 20 },
  { from: 16, to: 21 },
  
  // Row E to Row F diagonal connections
  { from: 17, to: 22 }, { from: 17, to: 23 },
  { from: 18, to: 23 }, { from: 18, to: 24 },
  { from: 19, to: 24 }, { from: 19, to: 25 },
  { from: 20, to: 25 }, { from: 20, to: 26 },
  { from: 21, to: 26 }, { from: 21, to: 27 },
  
  // Row F to Row G vertical connections
  { from: 22, to: 28 },
  { from: 23, to: 29 },
  { from: 24, to: 30 },
  { from: 25, to: 31 },
  { from: 26, to: 32 },
  { from: 27, to: 33 },
  
  // Row G to Row H diagonal connections
  { from: 28, to: 34 },
  { from: 29, to: 34 }, { from: 29, to: 35 },
  { from: 30, to: 35 }, { from: 30, to: 36 },
  { from: 31, to: 36 }, { from: 31, to: 37 },
  { from: 32, to: 37 }, { from: 32, to: 38 },
  { from: 33, to: 38 },
  
  // Row H to Row I vertical connections
  { from: 34, to: 39 },
  { from: 35, to: 40 },
  { from: 36, to: 41 },
  { from: 37, to: 42 },
  { from: 38, to: 43 },
  
  // Row I to Row J diagonal connections
  { from: 39, to: 44 },
  { from: 40, to: 44 }, { from: 40, to: 45 },
  { from: 41, to: 45 }, { from: 41, to: 46 },
  { from: 42, to: 46 }, { from: 42, to: 47 },
  { from: 43, to: 47 },
  
  // Row J to Row K vertical connections
  { from: 44, to: 48 },
  { from: 45, to: 49 },
  { from: 46, to: 50 },
  { from: 47, to: 51 },
  
  // Row K to Row L diagonal connections
  { from: 48, to: 52 },
  { from: 49, to: 52 }, { from: 49, to: 53 },
  { from: 50, to: 53 }, { from: 50, to: 54 },
  { from: 51, to: 54 },
];

// Helper functions
export const getVertexById = (id: number): Vertex | undefined => {
  return VERTICES.find(v => v.id === id);
};

export const getCenterById = (id: number): Center | undefined => {
  return CENTERS.find(c => c.id === id);
};

export const getEdgesForVertex = (vertexId: number): Edge[] => {
  return EDGES.filter(edge => edge.from === vertexId || edge.to === vertexId);
};

export const areVerticesAdjacent = (v1: number, v2: number): boolean => {
  return EDGES.some(edge => 
    (edge.from === v1 && edge.to === v2) || 
    (edge.from === v2 && edge.to === v1)
  );
};