import { loadBoardGraph, loadBoardForSize } from '../graph/loadBoard';
import { legalRoadEdgesFrom, canPlaceVillage, edgeTouchesVertex, whyNotVillage, initializeValidators } from './validators';
import { BoardSize } from '../data/boardConfigs';

// We'll get board size from state
let currentBoardSize: BoardSize = 'standard';
let currentAdjacencyMap: Record<string, number[]> = {};

function ensureBoardDataLoaded(boardSize: BoardSize) {
  if (currentBoardSize !== boardSize || Object.keys(currentAdjacencyMap).length === 0) {
    currentBoardSize = boardSize;
    console.log(`DEBUG: Phase1 engine loading adjacency rules from ${boardSize}_board.csv`);
    const boardData = loadBoardForSize(boardSize);
    
    if (!boardData.adjacencyMap || Object.keys(boardData.adjacencyMap).length === 0) {
      throw new Error(`Failed to load adjacency map from ${boardSize}_board.csv`);
    }
    
    currentAdjacencyMap = boardData.adjacencyMap;
    initializeValidators(boardSize);
    console.log(`DEBUG: Phase1 engine successfully loaded ${Object.keys(currentAdjacencyMap).length} vertices from ${boardSize}_board.csv`);
    console.log(`DEBUG: Sample adjacency rules from ${boardSize}_board.csv:`, Object.entries(currentAdjacencyMap).slice(0, 3));
  }
}

export function placeVillage_P1(state: any, playerId: string, v: number) {
  // Get board size from game state or fall back to current
  const boardSize = state.gameSettings?.boardSize || state.boardSize || currentBoardSize || 'standard';
  ensureBoardDataLoaded(boardSize);
  
  console.log(`DEBUG: placeVillage_P1 engine called - Player ${playerId} attempting to place village at vertex ${v} using ${boardSize.toUpperCase()}_board.csv rules`);
  
  // Check if village already exists at this vertex (idempotency)
  if (state.verticesOccupiedBy[v]) {
    console.log(`DEBUG: Village already exists at vertex ${v}, owned by ${state.verticesOccupiedBy[v]}`);
    return;
  }

  // VALIDATE: Follow "_board" CSV rules exactly
  const canPlace = canPlaceVillage(v, state.verticesOccupiedBy || {}, boardSize);
  console.log(`DEBUG: Village placement validation for vertex ${v} using ${boardSize}_board.csv: ${canPlace}`);
  
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
  
  console.log(`DEBUG: placeRoad_P1_byEdgeId engine called - Player ${playerId} attempting to place road on edge ${edgeId} using ${boardSize.toUpperCase()}_board.csv rules`);
  
  // Get the last placed village vertex
  const lastV = state.turnState.placementContext.lastVillageVertex!;
  if (!lastV) {
    console.error('DEBUG: CRITICAL ERROR - No last village vertex found for road placement');
    throw new Error('No last village vertex found');
  }
  
  // Parse the attempted edge to get the two vertices
  const [v1Str, v2Str] = edgeId.split('__');
  const v1 = parseInt(v1Str);
  const v2 = parseInt(v2Str);
  console.log(`DEBUG: Attempting to place road on edge ${edgeId} connecting vertices ${v1} and ${v2}`);
  
  // RULE CHECK: Edge must connect the village vertex to one of the vertices in column 2
  const villageVertex = lastV;
  const otherVertex = (v1 === villageVertex) ? v2 : (v2 === villageVertex) ? v1 : null;
  
  if (otherVertex === null) {
    console.error(`DEBUG: ILLEGAL ROAD - Edge ${edgeId} does not connect to village at vertex ${villageVertex}`);
    throw new Error(`Road edge ${edgeId} must connect to the village at vertex ${villageVertex}`);
  }
  
  // Check if the other vertex is listed in column 2 for the village vertex
  const allowedVertices = currentAdjacencyMap[villageVertex] || [];
  console.log(`DEBUG: Village at vertex ${villageVertex} can connect to these vertices from ${boardSize}_board.csv column 2: [${allowedVertices.join(', ')}]`);
  
  if (!allowedVertices.includes(otherVertex)) {
    console.error(`DEBUG: ILLEGAL ROAD - Vertex ${otherVertex} is not listed in column 2 for village vertex ${villageVertex} in ${boardSize}_board.csv`);
    console.error(`DEBUG: Allowed vertices for village ${villageVertex}: [${allowedVertices.join(', ')}]`);
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
  
  console.log(`DEBUG: AI TURN START - Using ${boardSize.toUpperCase()}_board.csv for all AI decisions`);
  
  const me = state.players.find((p: any) => p.id === state.turnState.currentPlayerId && !p.isHuman);
  if (!me) {
    console.log('DEBUG: No AI player found for current turn or current player is human');
    return;
  }

  console.log(`DEBUG: AI ${me.id} (${me.name}) taking turn in step ${state.turnState.step} using ${boardSize.toUpperCase()}_board.csv rules`);

  if (state.turnState.step === 'init_place_village') {
    console.log(`DEBUG: AI ${me.id} placing village - checking vertices from column 1 of ${boardSize.toUpperCase()}_board.csv`);
    
    // RULE: Only vertices listed in column 1 of "_board" CSV are valid, and must follow placement rules
    const candidates: number[] = [];
    for (const vertexNum of Object.keys(currentAdjacencyMap)) {
      const vertexId = parseInt(vertexNum);
      if (canPlaceVillage(vertexId, state.verticesOccupiedBy || {}, boardSize)) {
        candidates.push(vertexId);
      }
    }
    
    console.log(`DEBUG: AI ${me.id} found ${candidates.length} valid village candidates from ${boardSize.toUpperCase()}_board.csv: [${candidates.join(', ')}]`);
    
    if (candidates.length === 0) {
      console.error(`DEBUG: CRITICAL - No valid village candidates for AI ${me.id} in ${boardSize.toUpperCase()}_board.csv`);
      return;
    }
    
    const v = chooseBestVillageVertex(state, candidates, me.id);
    console.log(`DEBUG: AI ${me.id} selected village vertex ${v}`);
    placeVillage_P1(state, me.id, v);
    return;
  }

  if (state.turnState.step === 'init_place_road') {
    console.log(`DEBUG: AI ${me.id} placing road from village using ${boardSize.toUpperCase()}_board.csv adjacency rules`);
    const v = state.turnState.placementContext.lastVillageVertex!;
    if (!v) {
      console.error(`DEBUG: CRITICAL - No last village vertex for AI ${me.id} road placement`);
      return;
    }
    
    // RULE: Roads can only connect to vertices listed in column 2 for the village vertex
    const allowedVertices = currentAdjacencyMap[v] || [];
    console.log(`DEBUG: AI ${me.id} village at vertex ${v} can connect to vertices from ${boardSize.toUpperCase()}_board.csv column 2: [${allowedVertices.join(', ')}]`);
    
    // Create edge options for each allowed vertex, but only if no road exists
    const options = legalRoadEdgesFrom(v, state.edgesOccupiedBy || {}, boardSize);
    console.log(`DEBUG: AI ${me.id} available road options from village vertex ${v}:`, options);
    
    if (options.length === 0) {
      console.error(`DEBUG: CRITICAL - No valid road options for AI ${me.id} from village vertex ${v}`);
      console.error(`DEBUG: Allowed vertices from ${boardSize.toUpperCase()}_board.csv: [${allowedVertices.join(', ')}]`);
      console.error(`DEBUG: All edges already occupied or no valid connections available`);
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