import { loadBoardGraph, loadBoardForSize } from '../graph/loadBoard';
import { legalRoadEdgesFrom, canPlaceVillage, edgeTouchesVertex, whyNotVillage, initializeValidators } from './validators';
import { BoardSize } from '../data/boardConfigs';

// We'll get board size from state
let currentBoardSize: BoardSize = 'standard';
let currentAdjacencyMap: Record<string, number[]> = {};

function ensureBoardDataLoaded(boardSize: BoardSize) {
  if (currentBoardSize !== boardSize || Object.keys(currentAdjacencyMap).length === 0) {
    currentBoardSize = boardSize;
    const boardData = loadBoardForSize(boardSize);

    if (!boardData.adjacencyMap || Object.keys(boardData.adjacencyMap).length === 0) {
      throw new Error(`Failed to load adjacency map for ${boardSize} board`);
    }

    currentAdjacencyMap = boardData.adjacencyMap;
    initializeValidators(boardSize);
  }
}

export function placeVillage_P1(state: any, playerId: string, v: number) {
  // Get board size from game state or fall back to current
  const boardSize = state.gameSettings?.boardSize || state.boardSize || currentBoardSize || 'standard';
  ensureBoardDataLoaded(boardSize);

  // Check if village already exists at this vertex (idempotency)
  if (state.verticesOccupiedBy[v]) {
    console.log(`DEBUG: Village already exists at vertex ${v}, owned by ${state.verticesOccupiedBy[v]}`);
    return;
  }

  // VALIDATE: Follow board rules exactly
  const canPlace = canPlaceVillage(v, state.verticesOccupiedBy || {}, boardSize);
  
  if (!canPlace) {
    const reason = whyNotVillage(v, state.verticesOccupiedBy || {}, boardSize);
    console.error(`DEBUG: ILLEGAL VILLAGE PLACEMENT at vertex ${v} - ${reason}`);
    throw new Error(`Illegal village placement at vertex ${v}: ${reason}`);
  }
  
  // Place the village
  state.verticesOccupiedBy[v] = playerId;
  state.turnState.step = 'init_place_road';
  state.turnState.placementContext.lastVillageVertex = v;
  console.log(`DEBUG: VILLAGE PLACED - Player ${playerId} placed village at vertex ${v}`);
}

export function placeRoad_P1_byEdgeId(state: any, playerId: string, edgeId: string) {
  // Get board size from game state or fall back to current
  const boardSize = state.gameSettings?.boardSize || state.boardSize || currentBoardSize || 'standard';
  ensureBoardDataLoaded(boardSize);

  // Get the last placed village vertex
  const lastV = state.turnState.placementContext.lastVillageVertex!;
  if (!lastV) {
    console.error('DEBUG: No last village vertex found for road placement');
    throw new Error('No last village vertex found');
  }

  // Parse the attempted edge to get the two vertices
  const [v1Str, v2Str] = edgeId.split('__');
  const v1 = parseInt(v1Str);
  const v2 = parseInt(v2Str);
  
  // RULE CHECK: Edge must connect the village vertex to one of the vertices in column 2
  const villageVertex = lastV;
  const otherVertex = (v1 === villageVertex) ? v2 : (v2 === villageVertex) ? v1 : null;
  
  if (otherVertex === null) {
    console.error(`DEBUG: ILLEGAL ROAD - Edge ${edgeId} does not connect to village at vertex ${villageVertex}`);
    throw new Error(`Road edge ${edgeId} must connect to the village at vertex ${villageVertex}`);
  }
  
  // Check if the other vertex is allowed by adjacency rules
  const allowedVertices = currentAdjacencyMap[villageVertex] || [];

  if (!allowedVertices.includes(otherVertex)) {
    console.error(`DEBUG: ILLEGAL ROAD - Vertex ${otherVertex} not adjacent to village vertex ${villageVertex}`);
    throw new Error(`Road cannot connect vertex ${villageVertex} to vertex ${otherVertex}. Allowed connections: [${allowedVertices.join(', ')}]`);
  }
  
  // Check if road already exists on this edge
  if (state.edgesOccupiedBy[edgeId]) {
    console.error(`DEBUG: ILLEGAL ROAD - Edge ${edgeId} already has a road placed by ${state.edgesOccupiedBy[edgeId]}`);
    throw new Error(`Road already exists on edge ${edgeId}`);
  }

  console.log(`DEBUG: ROAD PLACEMENT VALIDATED - Edge ${edgeId} connects village vertex ${villageVertex} to allowed vertex ${otherVertex}`);

  // Place the road
  state.edgesOccupiedBy[edgeId] = playerId;
  console.log(`DEBUG: ROAD PLACED - Player ${playerId} placed road on edge ${edgeId} (${villageVertex} <-> ${otherVertex})`);
  advanceTurnFromP1(state);
}

export function advanceTurnFromP1(state: any) {
  // rotate to next player; reset step/context
  const currentIndex = state.players.findIndex((p: any) => p.id === state.turnState.currentPlayerId);
  const nextIndex = (currentIndex + 1) % state.players.length;
  const nextPlayerId = state.players[nextIndex].id;
  
  state.turnState.currentPlayerId = nextPlayerId;
  state.turnState.step = 'init_place_village';
  state.turnState.placementContext.lastVillageVertex = null;
  console.log("DEBUG: NEXT TURN", nextPlayerId, state.turnState.step);
}

export function aiTakeTurn_P1(state: any) {
  // Get board size from game state - this is critical for AI decisions
  const boardSize = state.gameSettings?.boardSize || state.boardSize || currentBoardSize || 'standard';
  ensureBoardDataLoaded(boardSize);

  const me = state.players.find((p: any) => p.id === state.turnState.currentPlayerId && !p.isHuman);
  if (!me) {
    console.log('DEBUG: No AI player found for current turn or current player is human');
    return;
  }

  if (state.turnState.step === 'init_place_village') {
    // Find valid village placement candidates
    const candidates: number[] = [];
    for (const vertexNum of Object.keys(currentAdjacencyMap)) {
      const vertexId = parseInt(vertexNum);
      if (canPlaceVillage(vertexId, state.verticesOccupiedBy || {}, boardSize)) {
        candidates.push(vertexId);
      }
    }

    if (candidates.length === 0) {
      console.error(`DEBUG: No valid village candidates for AI ${me.id}`);
      return;
    }
    
    const v = chooseBestVillageVertex(state, candidates, me.id);
    console.log(`DEBUG: AI ${me.id} selected village vertex ${v}`);
    placeVillage_P1(state, me.id, v);
    return;
  }

  if (state.turnState.step === 'init_place_road') {
    const v = state.turnState.placementContext.lastVillageVertex!;
    if (!v) {
      console.error(`DEBUG: No last village vertex for AI ${me.id} road placement`);
      return;
    }

    // Find legal road edges from the village vertex
    const options = legalRoadEdgesFrom(v, state.edgesOccupiedBy || {}, boardSize);

    if (options.length === 0) {
      console.error(`DEBUG: No valid road options for AI ${me.id} from village vertex ${v}`);
      advanceTurnFromP1(state);
      return;
    }
    
    const e = chooseBestRoadEdge(state, options, me.id, v);
    console.log(`DEBUG: AI ${me.id} selected road edge ${e}`);
    
    if (e && e.length > 0) {
      placeRoad_P1_byEdgeId(state, me.id, e);
    } else {
      console.warn(`DEBUG: AI ${me.id} could not select valid road edge, advancing turn`);
      advanceTurnFromP1(state);
    }
    return;
  }
}

function chooseBestVillageVertex(state: any, candidates: number[], playerId: string): number {
  console.log(`DEBUG: AI ${playerId} choosing from ${candidates.length} village candidates: [${candidates.join(', ')}]`);
  const randomIndex = Math.floor(Math.random() * candidates.length);
  console.log(`DEBUG: AI ${playerId} chose vertex ${candidates[randomIndex]} (index ${randomIndex})`);
  return candidates[randomIndex];
}

function chooseBestRoadEdge(state: any, options: string[], playerId: string, v: number): string {
  console.log(`DEBUG: AI ${playerId} choosing from ${options.length} road options for village vertex ${v}: [${options.join(', ')}]`);
  
  if (options.length === 0) {
    console.error(`DEBUG: CRITICAL - No road options available for AI ${playerId} from village vertex ${v}`);
    return ''; // Return empty string to indicate no valid move
  }
  
  const randomIndex = Math.floor(Math.random() * options.length);
  console.log(`DEBUG: AI ${playerId} chose road edge ${options[randomIndex]} (index ${randomIndex})`);
  return options[randomIndex];
}