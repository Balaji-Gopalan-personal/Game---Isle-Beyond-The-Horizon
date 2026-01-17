import { calculateLongestRoadPath } from './gameplayActions';
import { Road } from '../types/game';

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
