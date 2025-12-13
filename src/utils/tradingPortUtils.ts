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
  console.log(`=== TRADING PORT GENERATION DEBUG ===`);
  console.log(`Requested number of ports: ${numberOfPorts}`);
  
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
  
  console.log(`Found ${borderVertices.length} border vertices:`, borderVertices.map(v => v.id));

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
  
  console.log(`Found ${validPairs.length} border edge pairs`);

  // Shuffle valid pairs for random selection
  const shuffledPairs = [...validPairs].sort(() => Math.random() - 0.5);
  console.log(`Shuffled pairs:`, shuffledPairs);
  
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

  const ports: TradingPort[] = [];
  const usedVertices = new Set<number>();
  
  // Generate exactly the requested number of ports
  let pairIndex = 0;
  while (ports.length < numberOfPorts && pairIndex < shuffledPairs.length) {
    console.log(`Processing pair ${pairIndex + 1}/${shuffledPairs.length}: [${shuffledPairs[pairIndex][0]}, ${shuffledPairs[pairIndex][1]}]`);
    
    const [vertex1Id, vertex2Id] = shuffledPairs[pairIndex];
    
    // Skip if either vertex is already used
    if (usedVertices.has(vertex1Id) || usedVertices.has(vertex2Id)) {
      console.log(`  Skipping - vertices already used`);
      pairIndex++;
      continue;
    }

    // Determine port type
    let portType: TradingPort['type'] = 'generic';
    
    // Try to assign a specific resource type (70% chance)
    if (Math.random() < 0.7) {
      // Find resource types that don't conflict with adjacent centers
      const validResourceTypes = resourceTypes.filter(resourceType => 
        !pairConnectsToResource(vertex1Id, vertex2Id, resourceType)
      );
      
      if (validResourceTypes.length > 0) {
        // Randomly select from valid resource types
        portType = validResourceTypes[Math.floor(Math.random() * validResourceTypes.length)];
        console.log(`  Assigned 2:1 port type: ${portType}`);
      } else {
        console.log(`  No valid resource types, using generic`);
      }
    } else {
      console.log(`  Random chance selected generic port`);
    }

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
    
    console.log(`  Created port ${ports.length}: ${portType} at vertices [${vertex1Id}, ${vertex2Id}]`);

    // Mark vertices as used
    usedVertices.add(vertex1Id);
    usedVertices.add(vertex2Id);
    
    pairIndex++;
  }
  
  console.log(`=== FINAL RESULT ===`);
  console.log(`Generated ${ports.length} ports, requested ${numberOfPorts}`);
  console.log(`Used ${usedVertices.size} vertices out of ${borderVertices.length} border vertices`);
  console.log(`Processed ${pairIndex} pairs out of ${shuffledPairs.length} available pairs`);
  console.log(`Ports:`, ports.map(p => `${p.type} [${p.vertices[0]},${p.vertices[1]}]`));

  return ports;
};