// Board structure data for all board sizes
export type BoardSize = 'tiny' | 'small' | 'standard' | 'large' | 'huge';

export interface BoardStructure {
  name: string;
  description: string;
  centerRowCounts: number[]; // Number of centers per row (5 rows)
  totalCenters: number;
  maxPlayers: number;
}

export const BOARD_STRUCTURES: Record<BoardSize, BoardStructure> = {
  tiny: {
    name: 'Tiny',
    description: '30 vertices, 9 centers',
    centerRowCounts: [1, 2, 3, 2, 1],
    totalCenters: 9,
    maxPlayers: 3
  },
  small: {
    name: 'Small',
    description: '42 vertices, 14 centers', 
    centerRowCounts: [2, 3, 4, 3, 2],
    totalCenters: 14,
    maxPlayers: 4
  },
  standard: {
    name: 'Standard',
    description: '54 vertices, 19 centers',
    centerRowCounts: [3, 4, 5, 4, 3],
    totalCenters: 19,
    maxPlayers: 5
  },
  large: {
    name: 'Large',
    description: '66 vertices, 24 centers',
    centerRowCounts: [4, 5, 6, 5, 4],
    totalCenters: 24,
    maxPlayers: 6
  },
  huge: {
    name: 'Huge',
    description: '78 vertices, 29 centers',
    centerRowCounts: [5, 6, 7, 6, 5],
    totalCenters: 29,
    maxPlayers: 7
  }
};

// Calculate vertex row counts from center row counts
// Each center row requires 2 vertex rows above and below it
export function getVertexRowCounts(boardSize: BoardSize): number[] {
  const structure = BOARD_STRUCTURES[boardSize];
  const centerCounts = structure.centerRowCounts;
  
  // For hexagonal grid:
  // Row 1: centerCounts[0] + 1 vertices
  // Row 2: centerCounts[0] + 2 vertices  
  // Row 3: centerCounts[1] + 1 vertices
  // Row 4: centerCounts[1] + 2 vertices
  // Row 5: centerCounts[2] + 1 vertices
  // Row 6: centerCounts[2] + 2 vertices
  // Row 7: centerCounts[3] + 1 vertices
  // Row 8: centerCounts[3] + 2 vertices
  // Row 9: centerCounts[4] + 1 vertices
  // Row 10: centerCounts[4] + 2 vertices
  // Row 11: centerCounts[4] + 1 vertices
  // Row 12: centerCounts[4] vertices
  
  return [
    centerCounts[0] + 1,  // Row 1
    centerCounts[0] + 2,  // Row 2
    centerCounts[1] + 1,  // Row 3
    centerCounts[1] + 2,  // Row 4
    centerCounts[2] + 1,  // Row 5
    centerCounts[2] + 2,  // Row 6
    centerCounts[3] + 1,  // Row 7
    centerCounts[3] + 2,  // Row 8
    centerCounts[4] + 1,  // Row 9
    centerCounts[4] + 2,  // Row 10
    centerCounts[4] + 1,  // Row 11
    centerCounts[4]       // Row 12
  ];
}

// Row labels for the 12 vertex rows
export const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];