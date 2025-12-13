// --- Minimal fake board graph ---
const vertices = {
  A: { occupiedBy: null, neighbors: ["B", "C"] },
  B: { occupiedBy: null, neighbors: ["A"] },
  C: { occupiedBy: null, neighbors: ["A"] },
};

const edges = {
  eAB: { v1: "A", v2: "B", occupiedBy: null },
  eAC: { v1: "A", v2: "C", occupiedBy: null },
  eBC: { v1: "B", v2: "C", occupiedBy: null },
};

const edgesByVertex = {
  A: ["eAB", "eAC"],
  B: ["eAB", "eBC"],
  C: ["eAC", "eBC"],
};

// --- Validators ---
function canPlaceVillage(v) {
  if (vertices[v].occupiedBy) return false;
  for (const n of vertices[v].neighbors) {
    if (vertices[n].occupiedBy) return false;
  }
  return true;
}

function legalRoadEdgesFrom(v) {
  return edgesByVertex[v].filter(
    (eid) => !edges[eid].occupiedBy
  );
}

// --- State machine ---
const state = {
  turn: {
    currentPlayerId: "P1",
    step: "init_place_village",
    placementContext: { lastVillageVertex: null },
  },
  players: ["P1", "P2", "P3"],
};

function nextPlayer(pid) {
  const idx = state.players.indexOf(pid);
  return state.players[(idx + 1) % state.players.length];
}

function placeVillage_P1(pid, v) {
  console.assert(state.turn.currentPlayerId === pid, "Not your turn");
  console.assert(state.turn.step === "init_place_village", "Wrong step");
  console.assert(canPlaceVillage(v), "Illegal village");

  vertices[v].occupiedBy = pid;
  state.turn.placementContext.lastVillageVertex = v;
  console.log("PLACEMENT", pid, "VILLAGE", v);

  state.turn.step = "init_place_road";
}

function placeRoad_P1(pid, e) {
  console.assert(state.turn.currentPlayerId === pid, "Not your turn");
  console.assert(state.turn.step === "init_place_road", "Wrong step");
  const v = state.turn.placementContext.lastVillageVertex;
  const legal = legalRoadEdgesFrom(v);
  console.assert(legal.includes(e), "Illegal road");

  edges[e].occupiedBy = pid;
  console.log("PLACEMENT", pid, "ROAD", e);

  // advance turn
  state.turn.currentPlayerId = nextPlayer(pid);
  state.turn.step = "init_place_village";
  state.turn.placementContext.lastVillageVertex = null;
  console.log("NEXT TURN", state.turn.currentPlayerId);
}

// --- Simulated run ---
function simulatePhase1() {
  for (let round = 0; round < 1; round++) {
    for (const pid of state.players) {
      // Only place if it's actually this player's turn
      if (state.turn.currentPlayerId === pid && state.turn.step === "init_place_village") {
        // Find a valid vertex for this player
        let validVertex = null;
        for (const vertex of ["A", "B", "C"]) {
          if (canPlaceVillage(vertex)) {
            validVertex = vertex;
            break;
          }
        }
        
        if (validVertex) {
          placeVillage_P1(pid, validVertex);
          
          // Now place road if it's still this player's turn
          if (state.turn.currentPlayerId === pid && state.turn.step === "init_place_road") {
            const v = state.turn.placementContext.lastVillageVertex;
            if (v) {
              const legalEdges = legalRoadEdgesFrom(v);
              if (legalEdges.length > 0) {
                placeRoad_P1(pid, legalEdges[0]);
              }
            }
          }
        }
      }
    }
  }
}

// Run the test
console.log("=== PHASE 1 TEST HARNESS ===");
simulatePhase1();
console.log("=== TEST COMPLETE ===");