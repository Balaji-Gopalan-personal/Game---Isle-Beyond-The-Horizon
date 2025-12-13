export type VertexId = number;
export type EdgeId = string;

export type BoardVertex = {
  id: VertexId;
  x: number;        // screen-space or board-space coordinates (consistent units)
  y: number;
};

export type BoardEdge = {
  id: EdgeId;       // canonical id (sorted endpoints)
  v1: VertexId;
  v2: VertexId;
  kind: 'land' | 'sea';
};

export type BoardGraph = {
  vertices: Record<VertexId, BoardVertex>;
  edges: Record<EdgeId, BoardEdge>;
  // derived at runtime:
  edgesByVertex?: Record<VertexId, EdgeId[]>;
  neighbors?: Record<VertexId, VertexId[]>;
};

// Canonical edge id (sorted endpoints)
export function edgeId(a: VertexId, b: VertexId): EdgeId {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

export function buildGraph(raw: { vertices: BoardVertex[]; edges: Omit<BoardEdge, 'id'>[] }): BoardGraph {
  const vertices: Record<VertexId, BoardVertex> = {};
  for (const v of raw.vertices) vertices[v.id] = v;

  const edges: Record<EdgeId, BoardEdge> = {};
  for (const e of raw.edges) {
    const id = edgeId(e.v1, e.v2);
    edges[id] = { id, v1: e.v1, v2: e.v2, kind: (e as any).kind ?? 'land' };
  }

  const edgesByVertex: Record<VertexId, EdgeId[]> = {};
  const neighbors: Record<VertexId, VertexId[]> = {};
  for (const vId of Object.keys(vertices)) {
    edgesByVertex[vId] = [];
    neighbors[vId] = [];
  }
  for (const id of Object.keys(edges)) {
    const e = edges[id];
    if (!vertices[e.v1] || !vertices[e.v2]) {
      console.error('Edge references missing vertex', id, e);
      continue;
    }
    edgesByVertex[e.v1].push(id);
    edgesByVertex[e.v2].push(id);
    neighbors[e.v1].push(e.v2);
    neighbors[e.v2].push(e.v1);
  }

  // Sanity checks
  for (const v of Object.keys(vertices)) {
    const deg = edgesByVertex[v].length;
    console.assert(deg >= 2 && deg <= 3, 'Bad vertex degree (expected 2 or 3)', v, deg);
  }

  return { vertices, edges, edgesByVertex, neighbors };
}