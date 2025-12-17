import { TradingPort } from '../types/game';

interface Vertex {
  id: number;
  row: string;
  position: number;
  x: number;
  y: number;
}

interface Edge {
  from: number;
  to: number;
}

interface Center {
  id: number;
  vertices: number[];
  x: number;
  y: number;
  resourceType: 'desert' | 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral';
  value: number;
}

export const generateTradingPorts = ( 
  vertices: Vertex[],
  edges: Edge[],
  numberOfPorts: number,
  centers: Center[] = []
): TradingPort[] => {
  if (numberOfPorts <= 0) return [];
  
  // Find all vertices and their connection counts
  const vertexConnections = new Map<number, number>();
  vertices.forEach(vertex => {
    const connections = edges.filter(edge => 
      edge.from === vertex.id || edge.to === vertex.id
    ).length;
    vertexConnections.set(vertex.id, connections);
  });
  
  // Find border vertices (vertices with fewer than 3 connections) 
  const borderVertices = vertices.filter(vertex => {
    const connections = vertexConnections.get(vertex.id) || 0;
    return connections < 3;
  });

  // Find all border edges (edges that have at least one border vertex)
  const validPairs: Array<[number, number]> = [];
  
  // Find all edges that connect to at least one border vertex (these are border edges)
  const borderVertexIds = new Set(borderVertices.map(v => v.id));
  
  for (const edge of edges) {
    // An edge is a border edge if at least one of its vertices is a border vertex
    if (borderVertexIds.has(edge.from) || borderVertexIds.has(edge.to)) {
      // Only add each pair once (smaller id first)
      const [v1, v2] = [Math.min(edge.from, edge.to), Math.max(edge.from, edge.to)];
      validPairs.push([v1, v2]);
    }
  }

  // Shuffle valid pairs for random selection
  const shuffledPairs = [...validPairs].sort(() => Math.random() - 0.5);
  
  // Helper function to check if a vertex pair connects to a center with specific resource 
  const pairConnectsToResource = (vertex1Id: number, vertex2Id: number, resourceType: string): boolean => {
    for (const center of centers) {
      if (center.resourceType === resourceType && 
          (center.vertices.includes(vertex1Id) || center.vertices.includes(vertex2Id))) {
        return true;
      }
    }
    return false;
  };
  
  // Available resource types for 2:1 ports
  const resourceTypes: Array<TradingPort['type']> = ['clay', 'lumber', 'grain', 'fabric', 'mineral'];

  // Generate port type distribution based on percentages:
  // Each resource-specific 2:1 port: 14% of total
  // Generic 3:1 port: 28% of total
  const portTypesList: Array<TradingPort['type']> = [];

  // Calculate target counts for each type
  const clayCount = Math.round(numberOfPorts * 0.14);
  const lumberCount = Math.round(numberOfPorts * 0.14);
  const grainCount = Math.round(numberOfPorts * 0.14);
  const fabricCount = Math.round(numberOfPorts * 0.14);
  const mineralCount = Math.round(numberOfPorts * 0.14);
  const genericCount = Math.round(numberOfPorts * 0.28);

  // Add port types to list based on calculated counts
  for (let i = 0; i < clayCount; i++) portTypesList.push('clay');
  for (let i = 0; i < lumberCount; i++) portTypesList.push('lumber');
  for (let i = 0; i < grainCount; i++) portTypesList.push('grain');
  for (let i = 0; i < fabricCount; i++) portTypesList.push('fabric');
  for (let i = 0; i < mineralCount; i++) portTypesList.push('mineral');
  for (let i = 0; i < genericCount; i++) portTypesList.push('generic');

  // Adjust list length to match exact numberOfPorts
  while (portTypesList.length > numberOfPorts) {
    // Remove a random port type
    const randomIndex = Math.floor(Math.random() * portTypesList.length);
    portTypesList.splice(randomIndex, 1);
  }
  while (portTypesList.length < numberOfPorts) {
    // Add a random port type
    const allTypes: Array<TradingPort['type']> = [...resourceTypes, 'generic'];
    portTypesList.push(allTypes[Math.floor(Math.random() * allTypes.length)]);
  }

  // Shuffle the port types list for random assignment
  const shuffledPortTypes = [...portTypesList].sort(() => Math.random() - 0.5);

  const ports: TradingPort[] = [];
  const usedVertices = new Set<number>();

  // Generate exactly the requested number of ports
  let pairIndex = 0;
  let portTypeIndex = 0;

  while (ports.length < numberOfPorts && pairIndex < shuffledPairs.length) {
    const [vertex1Id, vertex2Id] = shuffledPairs[pairIndex];

    // Skip if either vertex is already used
    if (usedVertices.has(vertex1Id) || usedVertices.has(vertex2Id)) {
      pairIndex++;
      continue;
    }

    // Get the next port type from shuffled list
    const portType = shuffledPortTypes[portTypeIndex];
    portTypeIndex++;

    // Calculate position for the port 
    const vertex1 = vertices.find(v => v.id === vertex1Id)!;
    const vertex2 = vertices.find(v => v.id === vertex2Id)!;
    const midX = (vertex1.x + vertex2.x) / 2;
    const midY = (vertex1.y + vertex2.y) / 2;

    ports.push({
      id: `port-${ports.length + 1}`,
      type: portType,
      vertices: [vertex1Id, vertex2Id],
      position: { x: midX, y: midY }
    });

    // Mark vertices as used
    usedVertices.add(vertex1Id);
    usedVertices.add(vertex2Id);
    
    pairIndex++;
  }

  return ports;
};