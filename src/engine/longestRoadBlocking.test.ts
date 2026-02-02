import { calculateLongestRoadPath, getRoadsAtVertex, checkForRoadDisruptions } from './gameplayActions';
import { Road, GameState } from '../types/game';

function runTest(
  testName: string,
  playerId: string,
  roads: Road[],
  vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }>,
  expectedLength: number
) {
  console.log(`\n=== TEST: ${testName} ===`);
  const result = calculateLongestRoadPath(playerId, roads, vertices, true);
  console.log(`Expected: ${expectedLength}, Got: ${result}`);

  if (result === expectedLength) {
    console.log('✅ TEST PASSED');
  } else {
    console.error('❌ TEST FAILED');
    console.error(`Expected ${expectedLength} but got ${result}`);
  }

  return result === expectedLength;
}

export function runLongestRoadBlockingTests() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║  LONGEST ROAD BLOCKING TEST SUITE           ║');
  console.log('╔═══════════════════════════════════════════════╗\n');

  let passedTests = 0;
  let totalTests = 0;

  totalTests++;
  if (testLinearPathInterrupted()) passedTests++;

  totalTests++;
  if (testYShapedRoadNetwork()) passedTests++;

  totalTests++;
  if (testSeparateNetworksBlocked()) passedTests++;

  totalTests++;
  if (testPathThroughOwnVillage()) passedTests++;

  totalTests++;
  if (testEstateBlocking()) passedTests++;

  totalTests++;
  if (testCircularNetwork()) passedTests++;

  totalTests++;
  if (testMultipleBlockingPoints()) passedTests++;

  totalTests++;
  if (testGetRoadsAtVertex()) passedTests++;

  totalTests++;
  if (testVillageDisruptsNetwork()) passedTests++;

  totalTests++;
  if (testOwnVillageNoDisruption()) passedTests++;

  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passedTests}/${totalTests} tests passed`);
  console.log('╚═══════════════════════════════════════════════╝\n');

  return passedTests === totalTests;
}

function testLinearPathInterrupted(): boolean {
  const vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }> = {
    1: { id: 1, occupiedBy: 'player1', neighbors: [2] },
    2: { id: 2, occupiedBy: null, neighbors: [1, 3] },
    3: { id: 3, occupiedBy: 'player2', neighbors: [2, 4] },
    4: { id: 4, occupiedBy: null, neighbors: [3, 5] },
    5: { id: 5, occupiedBy: null, neighbors: [4] },
  };

  const roads: Road[] = [
    { id: '1__2', playerId: 'player1', from: 1, to: 2 },
    { id: '2__3', playerId: 'player1', from: 2, to: 3 },
    { id: '3__4', playerId: 'player1', from: 3, to: 4 },
    { id: '4__5', playerId: 'player1', from: 4, to: 5 },
  ];

  return runTest(
    'Linear Path Interrupted by Opponent Village',
    'player1',
    roads,
    vertices,
    2
  );
}

function testYShapedRoadNetwork(): boolean {
  const vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }> = {
    1: { id: 1, occupiedBy: 'player1', neighbors: [2] },
    2: { id: 2, occupiedBy: null, neighbors: [1, 3, 4] },
    3: { id: 3, occupiedBy: 'player2', neighbors: [2, 5] },
    4: { id: 4, occupiedBy: null, neighbors: [2, 6] },
    5: { id: 5, occupiedBy: null, neighbors: [3] },
    6: { id: 6, occupiedBy: null, neighbors: [4] },
  };

  const roads: Road[] = [
    { id: '1__2', playerId: 'player1', from: 1, to: 2 },
    { id: '2__3', playerId: 'player1', from: 2, to: 3 },
    { id: '3__5', playerId: 'player1', from: 3, to: 5 },
    { id: '2__4', playerId: 'player1', from: 2, to: 4 },
    { id: '4__6', playerId: 'player1', from: 4, to: 6 },
  ];

  return runTest(
    'Y-Shaped Road Network with One Branch Blocked',
    'player1',
    roads,
    vertices,
    3
  );
}

function testSeparateNetworksBlocked(): boolean {
  const vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }> = {
    1: { id: 1, occupiedBy: 'player1', neighbors: [2] },
    2: { id: 2, occupiedBy: null, neighbors: [1, 3] },
    3: { id: 3, occupiedBy: 'player2', neighbors: [2, 4] },
    4: { id: 4, occupiedBy: null, neighbors: [3, 5] },
    5: { id: 5, occupiedBy: 'player1', neighbors: [4] },
  };

  const roads: Road[] = [
    { id: '1__2', playerId: 'player1', from: 1, to: 2 },
    { id: '2__3', playerId: 'player1', from: 2, to: 3 },
    { id: '3__4', playerId: 'player1', from: 3, to: 4 },
    { id: '4__5', playerId: 'player1', from: 4, to: 5 },
  ];

  return runTest(
    'Two Separate Networks Blocked by Opponent',
    'player1',
    roads,
    vertices,
    2
  );
}

function testPathThroughOwnVillage(): boolean {
  const vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }> = {
    1: { id: 1, occupiedBy: 'player1', neighbors: [2] },
    2: { id: 2, occupiedBy: null, neighbors: [1, 3] },
    3: { id: 3, occupiedBy: 'player1', neighbors: [2, 4] },
    4: { id: 4, occupiedBy: null, neighbors: [3, 5] },
    5: { id: 5, occupiedBy: null, neighbors: [4] },
  };

  const roads: Road[] = [
    { id: '1__2', playerId: 'player1', from: 1, to: 2 },
    { id: '2__3', playerId: 'player1', from: 2, to: 3 },
    { id: '3__4', playerId: 'player1', from: 3, to: 4 },
    { id: '4__5', playerId: 'player1', from: 4, to: 5 },
  ];

  return runTest(
    'Path Through Own Village Should Be Allowed',
    'player1',
    roads,
    vertices,
    4
  );
}

function testEstateBlocking(): boolean {
  const vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }> = {
    1: { id: 1, occupiedBy: 'player1', neighbors: [2] },
    2: { id: 2, occupiedBy: null, neighbors: [1, 3] },
    3: { id: 3, occupiedBy: 'player2', neighbors: [2, 4] },
    4: { id: 4, occupiedBy: null, neighbors: [3, 5] },
    5: { id: 5, occupiedBy: null, neighbors: [4] },
  };

  const roads: Road[] = [
    { id: '1__2', playerId: 'player1', from: 1, to: 2 },
    { id: '2__3', playerId: 'player1', from: 2, to: 3 },
    { id: '3__4', playerId: 'player1', from: 3, to: 4 },
    { id: '4__5', playerId: 'player1', from: 4, to: 5 },
  ];

  return runTest(
    'Estate Blocking Works Same as Village',
    'player1',
    roads,
    vertices,
    2
  );
}

function testCircularNetwork(): boolean {
  const vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }> = {
    1: { id: 1, occupiedBy: 'player1', neighbors: [2, 4] },
    2: { id: 2, occupiedBy: null, neighbors: [1, 3] },
    3: { id: 3, occupiedBy: 'player2', neighbors: [2, 4] },
    4: { id: 4, occupiedBy: null, neighbors: [3, 1] },
  };

  const roads: Road[] = [
    { id: '1__2', playerId: 'player1', from: 1, to: 2 },
    { id: '2__3', playerId: 'player1', from: 2, to: 3 },
    { id: '3__4', playerId: 'player1', from: 3, to: 4 },
    { id: '1__4', playerId: 'player1', from: 1, to: 4 },
  ];

  return runTest(
    'Circular Network with Opponent Blocking',
    'player1',
    roads,
    vertices,
    2
  );
}

function testMultipleBlockingPoints(): boolean {
  const vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }> = {
    1: { id: 1, occupiedBy: 'player1', neighbors: [2] },
    2: { id: 2, occupiedBy: 'player2', neighbors: [1, 3] },
    3: { id: 3, occupiedBy: null, neighbors: [2, 4] },
    4: { id: 4, occupiedBy: 'player3', neighbors: [3, 5] },
    5: { id: 5, occupiedBy: null, neighbors: [4, 6] },
    6: { id: 6, occupiedBy: null, neighbors: [5] },
  };

  const roads: Road[] = [
    { id: '1__2', playerId: 'player1', from: 1, to: 2 },
    { id: '2__3', playerId: 'player1', from: 2, to: 3 },
    { id: '3__4', playerId: 'player1', from: 3, to: 4 },
    { id: '4__5', playerId: 'player1', from: 4, to: 5 },
    { id: '5__6', playerId: 'player1', from: 5, to: 6 },
  ];

  return runTest(
    'Multiple Blocking Points by Different Opponents',
    'player1',
    roads,
    vertices,
    1
  );
}

function testGetRoadsAtVertex(): boolean {
  console.log('\n=== TEST: Get Roads at Vertex ===');

  const roads: Road[] = [
    { id: '1__2', playerId: 'player1', from: 1, to: 2 },
    { id: '2__3', playerId: 'player1', from: 2, to: 3 },
    { id: '2__4', playerId: 'player2', from: 2, to: 4 },
    { id: '4__5', playerId: 'player1', from: 4, to: 5 },
  ];

  const roadsAtVertex2 = getRoadsAtVertex(2, roads);
  const roadsAtVertex2Player1 = getRoadsAtVertex(2, roads, 'player1');

  console.log(`Roads at vertex 2: ${roadsAtVertex2.length} (expected: 3)`);
  console.log(`Roads at vertex 2 for player1: ${roadsAtVertex2Player1.length} (expected: 2)`);

  const passed = roadsAtVertex2.length === 3 && roadsAtVertex2Player1.length === 2;

  if (passed) {
    console.log('✅ TEST PASSED');
  } else {
    console.error('❌ TEST FAILED');
  }

  return passed;
}

function testVillageDisruptsNetwork(): boolean {
  console.log('\n=== TEST: Village Disrupts Opponent Road Network ===');

  const vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }> = {
    1: { id: 1, occupiedBy: 'player1', neighbors: [2] },
    2: { id: 2, occupiedBy: null, neighbors: [1, 3, 4] },
    3: { id: 3, occupiedBy: null, neighbors: [2, 5] },
    4: { id: 4, occupiedBy: null, neighbors: [2, 6] },
    5: { id: 5, occupiedBy: null, neighbors: [3] },
    6: { id: 6, occupiedBy: null, neighbors: [4] },
  };

  const roads: Road[] = [
    { id: '1__2', playerId: 'player1', from: 1, to: 2 },
    { id: '2__3', playerId: 'player1', from: 2, to: 3 },
    { id: '3__5', playerId: 'player1', from: 3, to: 5 },
    { id: '2__4', playerId: 'player1', from: 2, to: 4 },
    { id: '4__6', playerId: 'player1', from: 4, to: 6 },
  ];

  const gameState: Partial<GameState> = {
    roads,
    villages: [],
  };

  const currentLengths = new Map([['player1', 4]]);

  const player1LengthBefore = calculateLongestRoadPath('player1', roads, vertices);
  console.log(`Player1 road length before disruption: ${player1LengthBefore} (expected: 4)`);

  const verticesAfterVillage = {
    ...vertices,
    2: { id: 2, occupiedBy: 'player2', neighbors: [1, 3, 4] },
  };

  const disruptions = checkForRoadDisruptions(
    2,
    'player2',
    gameState as GameState,
    verticesAfterVillage,
    currentLengths
  );

  console.log(`Number of disruptions detected: ${disruptions.length} (expected: 1)`);

  if (disruptions.length > 0) {
    console.log(`Disrupted player: ${disruptions[0].playerId} (expected: player1)`);
    console.log(`Old length: ${disruptions[0].oldLength} (expected: 4)`);
    console.log(`New length: ${disruptions[0].newLength} (expected: 2)`);
  }

  const passed = disruptions.length === 1 &&
                 disruptions[0].playerId === 'player1' &&
                 disruptions[0].oldLength === 4 &&
                 disruptions[0].newLength === 2;

  if (passed) {
    console.log('✅ TEST PASSED');
  } else {
    console.error('❌ TEST FAILED');
  }

  return passed;
}

function testOwnVillageNoDisruption(): boolean {
  console.log('\n=== TEST: Own Village Does Not Disrupt Own Network ===');

  const vertices: Record<number, { id: number; occupiedBy: string | null; neighbors: number[] }> = {
    1: { id: 1, occupiedBy: 'player1', neighbors: [2] },
    2: { id: 2, occupiedBy: null, neighbors: [1, 3] },
    3: { id: 3, occupiedBy: null, neighbors: [2, 4] },
    4: { id: 4, occupiedBy: null, neighbors: [3] },
  };

  const roads: Road[] = [
    { id: '1__2', playerId: 'player1', from: 1, to: 2 },
    { id: '2__3', playerId: 'player1', from: 2, to: 3 },
    { id: '3__4', playerId: 'player1', from: 3, to: 4 },
  ];

  const gameState: Partial<GameState> = {
    roads,
    villages: [],
  };

  const currentLengths = new Map([['player1', 3]]);

  const verticesAfterVillage = {
    ...vertices,
    2: { id: 2, occupiedBy: 'player1', neighbors: [1, 3] },
  };

  const disruptions = checkForRoadDisruptions(
    2,
    'player1',
    gameState as GameState,
    verticesAfterVillage,
    currentLengths
  );

  console.log(`Number of disruptions detected: ${disruptions.length} (expected: 0)`);

  const player1LengthAfter = calculateLongestRoadPath('player1', roads, verticesAfterVillage);
  console.log(`Player1 road length after own village: ${player1LengthAfter} (expected: 3)`);

  const passed = disruptions.length === 0 && player1LengthAfter === 3;

  if (passed) {
    console.log('✅ TEST PASSED');
  } else {
    console.error('❌ TEST FAILED');
  }

  return passed;
}
