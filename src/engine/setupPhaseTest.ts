import { GameState, Player } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { loadBoardGraph } from '../graph/loadBoard';
import { createInitialGameState } from './gameStateManager';
import { SetupPhaseOrchestrator } from './setupPhaseOrchestrator';
import { createInitialDeck, shuffleDeck } from '../data/developmentCards';

const DEFAULT_GAME_SETTINGS = {
  pointsToWin: 10,
  longestRoadEnabled: true,
  longestRoadSize: 5,
  longestRoadBonus: 2,
  largestArmyEnabled: true,
  largestArmySize: 3,
  largestArmyBonus: 2,
  maxResourceHold: 7,
  robberCanReturnToDesert: false,
  tradingPortsEnabled: true,
  numberOfTradingPorts: 9,
  developmentCardDeck: 'standard' as const
};

function createTestPlayers(): Player[] {
  return [
    {
      id: 'player_1',
      name: 'Alice',
      isHuman: true,
      color: 'red',
      isActive: true,
      resources: { clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0, total: 0 },
      developmentCards: 0,
      developmentCardsInHand: [],
      armyCount: 0,
      secretPoints: 0,
      score: 0,
      hasLongestRoad: false,
      hasLargestArmy: false,
      order: 1,
      currentTurn: 1,
      villageCount: 0,
      cityCount: 0,
      roadCount: 0,
      hasPlacedVillage: false,
      hasPlacedRoad: false,
      guardsPlayedThisTurn: 0
    },
    {
      id: 'player_2',
      name: 'Bob (AI)',
      isHuman: false,
      color: 'blue',
      isActive: false,
      resources: { clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0, total: 0 },
      developmentCards: 0,
      developmentCardsInHand: [],
      armyCount: 0,
      secretPoints: 0,
      score: 0,
      hasLongestRoad: false,
      hasLargestArmy: false,
      order: 2,
      difficulty: 'normal',
      currentTurn: 1,
      villageCount: 0,
      cityCount: 0,
      roadCount: 0,
      hasPlacedVillage: false,
      hasPlacedRoad: false,
      guardsPlayedThisTurn: 0
    },
    {
      id: 'player_3',
      name: 'Charlie (AI)',
      isHuman: false,
      color: 'green',
      isActive: false,
      resources: { clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0, total: 0 },
      developmentCards: 0,
      developmentCardsInHand: [],
      armyCount: 0,
      secretPoints: 0,
      score: 0,
      hasLongestRoad: false,
      hasLargestArmy: false,
      order: 3,
      difficulty: 'normal',
      currentTurn: 1,
      villageCount: 0,
      cityCount: 0,
      roadCount: 0,
      hasPlacedVillage: false,
      hasPlacedRoad: false,
      guardsPlayedThisTurn: 0
    }
  ];
}

export function runSetupPhaseTest(boardSize: BoardSize = 'standard'): void {
  console.log('=== SETUP PHASE TEST START ===');
  console.log(`Board Size: ${boardSize}`);

  const boardGraph = loadBoardGraph(boardSize);
  const players = createTestPlayers();
  const initialState = createInitialGameState(players, boardSize, DEFAULT_GAME_SETTINGS, boardGraph);

  const orchestrator = new SetupPhaseOrchestrator(
    initialState,
    boardSize,
    'normal',
    (message) => console.log(`LOG: ${message}`)
  );

  console.log('Initial state created successfully');
  console.log(`Total vertices: ${Object.keys(boardGraph.vertices).length}`);
  console.log(`Total edges: ${Object.keys(boardGraph.edges).length}`);

  let iterations = 0;
  const maxIterations = 100;

  while (iterations < maxIterations) {
    const state = orchestrator.getState();

    if (state.phase === 'playing') {
      console.log('=== SETUP PHASES COMPLETE ===');
      console.log('Final player stats:');
      state.players.forEach(p => {
        console.log(`  ${p.name}: Villages=${p.villageCount}, Roads=${p.roadCount}, Score=${p.score}`);
      });
      break;
    }

    const currentPlayer = state.players.find(p => p.id === state.currentPlayer);
    if (!currentPlayer) {
      console.error('No current player found');
      break;
    }

    console.log(`\n--- Iteration ${iterations + 1} ---`);
    console.log(`Phase: ${state.phase}, Step: ${state.turnState.step}`);
    console.log(`Current Player: ${currentPlayer.name} (${currentPlayer.isHuman ? 'Human' : 'AI'})`);

    if (!currentPlayer.isHuman) {
      const success = orchestrator.executeAITurn(currentPlayer.id);
      if (!success) {
        console.error(`AI turn failed for ${currentPlayer.name}`);
        break;
      }
    } else {
      console.log('Human player turn - skipping in test');
      break;
    }

    iterations++;
  }

  if (iterations >= maxIterations) {
    console.error('Test exceeded maximum iterations - possible infinite loop');
  }

  console.log('\n=== SETUP PHASE TEST END ===');
}

if (typeof window === 'undefined') {
  runSetupPhaseTest('standard');
}
