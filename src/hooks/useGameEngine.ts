import React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, Player, GameStep, StepTrigger, TurnStep } from '../types/game';
import { BoardSize, BOARD_STRUCTURES } from '../data/boardStructure';
import { AICharacter } from '../data/aiCharacters';
import { loadBoardGraph, loadBoardForSize } from '../graph/loadBoard';
import { canPlaceVillage, legalRoadEdgesFrom, edgeTouchesVertex, whyNotVillage, initializeValidators } from '../engine/validators';
import { placeVillage_P1, placeRoad_P1_byEdgeId, aiTakeTurn_P1 } from '../engine/phase1';
import { calculateLongestRoadPath, getValidRoadPlacements, getValidVillagePlacements, getPlayerVillages, buildVerticesWithOwnership, checkForRoadDisruptions, recalculateAllPlayersRoadLengths, RoadDisruption } from '../engine/gameplayActions';
import { makeRandomBuildDecision, makeStrategicBuildDecision, getAvailableBuildingTypes } from '../engine/aiBuilding';
import { selectStrategicRoadLocation, selectStrategicVillageLocation, selectStrategicEstateLocation, selectStrategicDiscardResources, VillageLocationDecision, RoadLocationDecision, EstateLocationDecision, getPersonalityForCharacter } from '../engine/aiLocationStrategy';
import { findDesertCentre, isValidRobberDestination, getPlayersWithAdjacentBuildings, selectRandomRobberDestination, stealRandomResource, selectRandomStealTarget, CentreData } from '../engine/robberActions';
import { selectRobberPlacement } from '../engine/aiRobberStrategy';
import { shouldPlayDevCardAfterRoll, selectBoomingEconomyResources, selectClosedMarketResource, selectResourceSwapTarget } from '../engine/aiDevCardStrategy';
import { evaluateTradeOpportunity, TurnTradeHistory } from '../engine/aiTradingStrategy';
import { createTurnPlan, shouldContinueTurn } from '../engine/aiTurnOrchestrator';
import { createInitialDeck, shuffleDeck } from '../data/developmentCards';
import { checkVictoryCondition } from '../utils/victoryDetection';
import { generateTradingPorts } from '../utils/tradingPortUtils';
import { getPlayerTradingPorts, canExecuteBankTrade, canProposePlayerTrade, getTradeRateDisplay, getBestTradeRateForResource } from '../utils/tradingUtils';
import { getPlayerColorHex } from '../utils/playerColors';
import { shouldAttemptBankTrade, selectBankTradeResources, shouldAttemptPlayerTrade, generatePlayerTradeProposal, getTradeProposalKey } from '../utils/aiTrading';

const DEFAULT_GAME_SETTINGS: GameSettings = {
  boardSize: 'standard',
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
  developmentCardDeck: 'standard',
  testingMode: false
};

const DEFAULT_STEPS: GameStep[] = [
  { id: 'setup-phase-1', name: 'Setup Phase 1', description: 'Place initial villages and roads' },
  { id: 'place-village', name: 'Place Village', description: 'Place a village on an empty vertex' },
  { id: 'place-road', name: 'Place Road', description: 'Place a road adjacent to your village' },
  { id: 'setup-phase-2', name: 'Setup Phase 2', description: 'Place second villages and roads' },
  { id: 'main-phase', name: 'Main Phase', description: 'Main gameplay phase' },
  { id: 'end-turn', name: 'End Turn', description: 'End current turn' }
];

interface GameSettings {
  pointsToWin: number;
  longestRoadEnabled: boolean;
  longestRoadSize: number;
  longestRoadBonus: number;
  largestArmyEnabled: boolean;
  largestArmySize: number;
  largestArmyBonus: number;
  maxResourceHold: number;
  robberCanReturnToDesert: boolean;
  tradingPortsEnabled: boolean;
  numberOfTradingPorts: number;
  developmentCardDeck: 'standard' | 'expanded';
}

interface GameConfig {
  playerName: string;
  playerColor: string;
  aiCharacters: AICharacter[];
  playerOrder: number[];
  aiDifficulty: 'easy' | 'normal' | 'hard';
  aiColors: string[];
  gameSettings: GameSettings;
  boardSize: BoardSize;
}

interface Village {
  id: string;
  playerId: string;
  vertexId: number;
  type: 'settlement' | 'city';
}

interface Road {
  id: string;
  playerId: string;
  from: number;
  to: number;
}

const DEFAULT_GAME_STATE: GameState = {
  currentPlayer: '',
  currentStep: 'setup-phase-1',
  turn: 1,
  phase: 'setup-phase-1',
  players: [],
  gameLog: [],
  gameSettings: DEFAULT_GAME_SETTINGS,
  stepHistory: [],
  villages: [],
  roads: [],
  longestRoadLengths: new Map(),
  adjacentVertices: [],
  lastPlacedVillage: null,
  totalVertices: 54,
  turnState: {
    currentPlayerId: '',
    step: 'init_place_village',
    placementContext: {
      lastVillageVertex: null
    },
    lock: false
  },
  boardGraph: {
    edges: {},
    vertices: {},
    edgesByVertex: {}
  },
  verticesOccupiedBy: {},
  edgesOccupiedBy: {},
  developmentCardDeck: [],
  developmentCardDiscard: [],
  boardCenters: []
};

export const useGameEngine = (aiPlayerCount: number = 2, boardSize: BoardSize = 'standard', config?: GameConfig) => {
  const [gameState, setGameState] = useState<GameState>(DEFAULT_GAME_STATE);
  const [gameSteps] = useState<GameStep[]>(DEFAULT_STEPS);
  const [diceRoll, setDiceRoll] = useState<{ die1: number; die2: number; total: number } | null>(null);
  const [isRollingDice, setIsRollingDice] = useState(false);
  const [showDiceResult, setShowDiceResult] = useState(false);
  const [waitingForConfirmation, setWaitingForConfirmation] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [boardCenters, setBoardCenters] = useState<any[]>([]);
  const [aiActionLoopActive, setAiActionLoopActive] = useState(false);
  const [aiActionLoopIterations, setAiActionLoopIterations] = useState(0);
  const [diceRollPhaseComplete, setDiceRollPhaseComplete] = useState(false);
  const [turnTradeHistory, setTurnTradeHistory] = useState<TurnTradeHistory>({
    tradesExecuted: [],
    resourcesGained: {},
    resourcesLost: {}
  });
  const [discardState, setDiscardState] = useState<{ playersNeedingDiscard: string[]; currentDiscardIndex: number; isProcessing: boolean }>({ playersNeedingDiscard: [], currentDiscardIndex: 0, isProcessing: false });
  const [selectedCentre, setSelectedCentre] = useState<number | null>(null);
  const [selectedStealTarget, setSelectedStealTarget] = useState<string | null>(null);
  const [eligibleStealTargets, setEligibleStealTargets] = useState<Player[]>([]);
  const [robberMovementInitiated, setRobberMovementInitiated] = useState(false);
  const [drawnCardForModal, setDrawnCardForModal] = useState<DevelopmentCard | null>(null);
  const [playedCardForModal, setPlayedCardForModal] = useState<{
    card: DevelopmentCard;
    playerName: string;
    playerNumber: number;
    playerColor: string;
  } | null>(null);
  const [cardValidationError, setCardValidationError] = useState<string | null>(null);
  const [aiDevCardDecision, setAiDevCardDecision] = useState<{ reasoning: string; personality: string } | null>(null);

  // Ref to track if AI card effect is currently being processed
  // This prevents duplicate executions when useEffect re-runs due to state changes
  const aiCardEffectProcessingRef = useRef(false);

  // Ref to track if AI has played a dev card in play_dev_cards phase
  // Used to advance to main after card modal closes
  const aiPlayedDevCardThisPhaseRef = useRef(false);

  // Refs to track all nested timeouts for card effects
  // These are arrays because card effects can have multiple nested timeouts
  const boomingEconomyTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const closedMarketTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const resourceSwapTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const freeUpgradeTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Helper function to add log messages
  const addToLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setGameState(prev => ({
      ...prev,
      gameLog: [...prev.gameLog, { message, timestamp }]
    }));
  }, []);

  // Helper function to add AI decision context in testing mode
  const addAIDecisionContext = useCallback((
    playerId: string,
    personality: string,
    reasoning: string
  ) => {
    if (!gameState.gameSettings.testingMode) {
      return;
    }

    const player = gameState.players.find(p => p.id === playerId);
    if (!player || player.isHuman) {
      return;
    }

    const personalityLabel = personality.charAt(0).toUpperCase() + personality.slice(1);
    const contextMessage = `<span style="color: #6B7280; font-style: italic; padding-left: 16px; display: block;">${personalityLabel} - Objective: ${reasoning}</span>`;

    addToLog(contextMessage);
  }, [gameState.gameSettings.testingMode, gameState.players, addToLog]);

  // Helper function to get player color style
  const getPlayerColorStyle = useCallback((color: string) => {
    return getPlayerColorHex(color);
  }, []);

  // Helper function to generate AI reasoning for setup phase village placement
  const generateSetupVillageReasoning = useCallback((vertexId: number, state: any): string => {
    if (!state.boardCenters || state.boardCenters.length === 0) {
      return 'Establish initial presence';
    }

    const reasons: string[] = [];

    // Find adjacent hexes
    const adjacentHexes = state.boardCenters.filter((center: any) =>
      center.vertices.includes(vertexId)
    );

    // Check for high-production hexes
    const highProductionHexes = adjacentHexes.filter((hex: any) => hex.value === 6 || hex.value === 8);
    const goodProductionHexes = adjacentHexes.filter((hex: any) => hex.value === 5 || hex.value === 9);

    if (highProductionHexes.length > 0) {
      reasons.push('high-production location');
    } else if (goodProductionHexes.length > 0) {
      reasons.push('good production location');
    }

    // Check resource diversity
    const resourceTypes = new Set(adjacentHexes.map((hex: any) => hex.resourceType).filter((r: string) => r !== 'desert'));
    if (resourceTypes.size >= 3) {
      reasons.push('diverse resources');
    }

    // Check for trading port
    if (state.tradingPorts) {
      const hasPort = state.tradingPorts.some((port: any) => port.vertices.includes(vertexId));
      if (hasPort) {
        reasons.push('trading port access');
      }
    }

    if (reasons.length === 0) {
      return 'Establish initial presence';
    }

    const capitalizedReasons = reasons.map((r: string, i: number) => i === 0 ? r.charAt(0).toUpperCase() + r.slice(1) : r);
    return capitalizedReasons.join(', ');
  }, []);

  // Helper function to generate AI reasoning for setup phase road placement
  const generateSetupRoadReasoning = useCallback((fromVertex: number, toVertex: number, villageVertex: number | null, state: any): string => {
    if (!state.boardCenters || state.boardCenters.length === 0) {
      return 'Expand from village toward adjacent territory';
    }

    const reasons: string[] = [];
    const details: string[] = [];

    // Get all hexes adjacent to destination vertex
    const destHexes = state.boardCenters.filter((center: any) =>
      center.vertices.includes(toVertex)
    );

    // Get hexes adjacent to source vertex (if it's the village or existing road endpoint)
    const sourceHexes = state.boardCenters.filter((center: any) =>
      center.vertices.includes(fromVertex)
    );

    // Check production values
    const highProductionHexes = destHexes.filter((hex: any) => hex.value === 6 || hex.value === 8);
    const mediumProductionHexes = destHexes.filter((hex: any) => hex.value === 5 || hex.value === 9);

    if (highProductionHexes.length > 0) {
      const resources = highProductionHexes.map((h: any) => h.resourceType).filter(Boolean);
      reasons.push(`accessing high-probability hexes (${resources.join(', ')})`);
    } else if (mediumProductionHexes.length > 0) {
      const resources = mediumProductionHexes.map((h: any) => h.resourceType).filter(Boolean);
      reasons.push(`toward good production hexes (${resources.join(', ')})`);
    }

    // Check for new territory access (hexes not adjacent to source)
    const newHexes = destHexes.filter((hex: any) =>
      !sourceHexes.some((sh: any) => sh.id === hex.id)
    );

    if (newHexes.length > 0) {
      const newResources = newHexes.map((h: any) => h.resourceType).filter(Boolean);
      if (newResources.length > 0) {
        reasons.push(`opening access to ${newResources.join(' and ')} territory`);
      } else {
        reasons.push('expanding territorial reach');
      }
    }

    // Check for resource diversity
    const villageHexes = villageVertex ? state.boardCenters.filter((center: any) =>
      center.vertices.includes(villageVertex)
    ) : [];

    const villageResources = new Set(villageHexes.map((h: any) => h.resourceType).filter(Boolean));
    const newResources = destHexes.map((h: any) => h.resourceType).filter((r: any) => r && !villageResources.has(r));

    if (newResources.length > 0) {
      reasons.push(`diversifying access to ${newResources.join(', ')}`);
    }

    // Check for longest road potential (if moving away from village)
    const boardData = loadBoardForSize(state.boardSize || 'standard');
    const destNeighbors = boardData.adjacencyMap[toVertex] || [];
    const availableNeighbors = destNeighbors.filter((n: number) =>
      !state.verticesOccupiedBy[n] && n !== fromVertex
    );

    if (availableNeighbors.length >= 2) {
      reasons.push('strong future expansion options');
    }

    if (reasons.length === 0) {
      return 'Extend road network from village';
    }

    return reasons.join('; ');
  }, []);

  // Discard helper functions
  const checkIfDiscardRequired = useCallback((player: Player, maxResourceHold: number): boolean => {
    if (maxResourceHold === 0) return false;
    return player.resources.total > maxResourceHold;
  }, []);

  const calculateDiscardAmount = useCallback((totalResources: number): number => {
    return Math.floor(totalResources / 2);
  }, []);

  const selectRandomResourcesForDiscard = useCallback((player: Player, discardAmount: number): { clay: number; lumber: number; grain: number; fabric: number; mineral: number } => {
    const selection = { clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0 };
    const availableResources: Array<keyof typeof selection> = [];

    // Build array of available resources
    (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const).forEach(resource => {
      for (let i = 0; i < player.resources[resource]; i++) {
        availableResources.push(resource);
      }
    });

    // Randomly select resources to discard
    for (let i = 0; i < discardAmount && availableResources.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * availableResources.length);
      const selectedResource = availableResources[randomIndex];
      selection[selectedResource]++;
      availableResources.splice(randomIndex, 1);
    }

    return selection;
  }, []);

  const applyDiscardToPlayer = useCallback((playerId: string, selection: { clay: number; lumber: number; grain: number; fabric: number; mineral: number }) => {
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p => {
        if (p.id === playerId) {
          const newResources = {
            clay: p.resources.clay - selection.clay,
            lumber: p.resources.lumber - selection.lumber,
            grain: p.resources.grain - selection.grain,
            fabric: p.resources.fabric - selection.fabric,
            mineral: p.resources.mineral - selection.mineral,
            total: p.resources.total - (selection.clay + selection.lumber + selection.grain + selection.fabric + selection.mineral)
          };
          return { ...p, resources: newResources };
        }
        return p;
      })
    }));

    // Log the discard
    const player = gameState.players.find(p => p.id === playerId);
    if (player) {
      const playerColor = getPlayerColorStyle(player.color);

      if (player.isHuman) {
        // For human players, show detailed breakdown
        const discardedItems = [];
        if (selection.clay > 0) discardedItems.push(`${selection.clay} clay`);
        if (selection.lumber > 0) discardedItems.push(`${selection.lumber} lumber`);
        if (selection.grain > 0) discardedItems.push(`${selection.grain} grain`);
        if (selection.fabric > 0) discardedItems.push(`${selection.fabric} fabric`);
        if (selection.mineral > 0) discardedItems.push(`${selection.mineral} mineral`);
        const discardMessage = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> discarded: ${discardedItems.join(', ')}`;
        addToLog(discardMessage);
      } else {
        // For AI players, only show total amount
        const totalDiscarded = selection.clay + selection.lumber + selection.grain + selection.fabric + selection.mineral;
        const discardMessage = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> discarded ${totalDiscarded} resources`;
        addToLog(discardMessage);
      }
    }
  }, [gameState.players, getPlayerColorStyle, addToLog]);

  // Advance to next player (defined early for use in processDiceRoll)
  const advanceToNextPlayer = useCallback((state: GameState) => {
    console.log('DEBUG: advanceToNextPlayer called');

    // Check for victory condition BEFORE advancing to next player
    // This ensures both human and AI victories are detected
    if (state.phase === 'playing') {
      const { hasWinner, winner } = checkVictoryCondition(state);

      if (hasWinner && winner) {
        console.log('DEBUG: Victory condition met!', winner.name);
        const playerColor = getPlayerColorStyle(winner.color);
        const victoryMessage = `<span style="color: ${playerColor}; font-weight: bold;">${winner.name}</span> wins the game with ${winner.score} points!`;

        setGameState(prev => ({
          ...prev,
          phase: 'ended',
          gameLog: [...prev.gameLog, {
            message: victoryMessage,
            timestamp: new Date().toLocaleTimeString()
          }]
        }));

        return; // Don't advance to next player, game is over
      }
    }

    // Clear dice roll state for new turn
    setDiceRoll(null);
    setIsRollingDice(false);
    setWaitingForConfirmation(false);
    setShowDiceResult(false);
    setDiceRollPhaseComplete(false);

    // Clear trade history for new turn
    setTurnTradeHistory({
      tradesExecuted: [],
      resourcesGained: {},
      resourcesLost: {}
    });

    // Reset AI dev card play tracking
    aiPlayedDevCardThisPhaseRef.current = false;

    setGameState(prevState => {
      const currentIndex = prevState.players.findIndex(p => p.id === prevState.currentPlayer);
      const nextIndex = (currentIndex + 1) % prevState.players.length;
      const nextPlayer = prevState.players[nextIndex];

      console.log(`DEBUG: advanceToNextPlayer - current: ${prevState.players[currentIndex]?.name}, next: ${nextPlayer.name}, nextIndex: ${nextIndex}`);

      const newState = { ...prevState };

      // Increment the next player's turn number individually
      console.log('DEBUG: Incrementing turn for next player:', nextPlayer.name);
      console.log('DEBUG: Turn before increment:', nextPlayer.currentTurn);

      newState.players = newState.players.map(player =>
        player.id === nextPlayer.id
          ? { ...player, currentTurn: player.currentTurn + 1, guardsPlayedThisTurn: 0 }
          : player
      );

      const updatedNextPlayer = newState.players[nextIndex];
      console.log('DEBUG: Turn after increment:', updatedNextPlayer.currentTurn);

      newState.currentPlayer = nextPlayer.id;

      // Reset turn state for gameplay phase - start with 'awaiting_dice_roll'
      if (prevState.phase === 'playing') {
        newState.turnState = {
          currentPlayerId: nextPlayer.id,
          step: 'awaiting_dice_roll', // Start with dice roll step
          placementContext: {
            lastVillageVertex: null,
            buildingType: null
          },
          lock: false,
          aiTradeAttemptsThisTurn: 0,
          aiFailedTradeProposalsThisTurn: new Set<string>()
        };
        console.log('DEBUG: Reset turnState to awaiting_dice_roll for playing phase (cleared trade tracking)');
      }

      // Get the turn number to display (after increment)
      const displayTurn = updatedNextPlayer.currentTurn;

      // Log next player's turn immediately (no setTimeout to avoid duplicate logs)
      const playerColor = getPlayerColorStyle(nextPlayer.color);
      const turnMessage = `<span style="color: ${playerColor}; font-weight: bold;">${nextPlayer.name}</span> starts Turn ${displayTurn}`;
      newState.gameLog = [...newState.gameLog, {
        message: turnMessage,
        timestamp: new Date().toLocaleTimeString()
      }];

      console.log(`DEBUG: ${nextPlayer.name} now at Turn ${displayTurn}, turnState.step: ${newState.turnState?.step || prevState.turnState.step}`);

      return newState;
    });
  }, [getPlayerColorStyle]);

  // Process dice roll (defined early for use in rollDice)
  const processDiceRoll = useCallback((rollTotal: number) => {
    console.log(`DEBUG: processDiceRoll called with roll: ${rollTotal}`);

    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);

    if (!currentPlayer) {
      console.log('DEBUG: No current player found, exiting processDiceRoll');
      return;
    }

    // Log the roll
    const playerColor = getPlayerColorStyle(currentPlayer.color);
    const rollMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> rolled a ${rollTotal}`;
    addToLog(rollMessage);

    if (rollTotal === 7) {
      const maxResourceHold = gameState.gameSettings?.maxResourceHold ?? 7;

      // Check if there's no resource limit
      if (maxResourceHold === 0) {
        addToLog("No Max Resource Hold limit, no discard required");
        setGameState(prev => ({
          ...prev,
          turnState: {
            ...prev.turnState,
            step: 'move_robber'
          }
        }));
        return;
      }

      // Find all players who need to discard
      const playersNeedingDiscard = gameState.players.filter(player =>
        checkIfDiscardRequired(player, maxResourceHold)
      );

      if (playersNeedingDiscard.length === 0) {
        // No one needs to discard, proceed to robber movement phase
        addToLog("No one needs to discard");
        setGameState(prev => ({
          ...prev,
          turnState: {
            ...prev.turnState,
            step: 'move_robber'
          }
        }));
        return;
      }

      // Sort players: human first, then AI in turn order
      const sortedPlayersNeedingDiscard = playersNeedingDiscard.sort((a, b) => {
        if (a.isHuman && !b.isHuman) return -1;
        if (!a.isHuman && b.isHuman) return 1;
        return a.order - b.order;
      });

      console.log('DEBUG: ===== DISCARD PHASE START =====');
      console.log('DEBUG: Players needing discard:', sortedPlayersNeedingDiscard.map(p => ({
        name: p.name,
        isHuman: p.isHuman,
        resources: p.resources.total,
        mustDiscard: Math.floor(p.resources.total / 2)
      })));
      console.log('DEBUG: First player to discard:', sortedPlayersNeedingDiscard[0]?.name, 'isHuman:', sortedPlayersNeedingDiscard[0]?.isHuman);

      // Log discard requirement message
      const discardMessage = `${sortedPlayersNeedingDiscard.length} player${sortedPlayersNeedingDiscard.length > 1 ? 's' : ''} must discard resources`;
      addToLog(discardMessage);

      // Set discard state and transition to discard phase
      setDiscardState({
        playersNeedingDiscard: sortedPlayersNeedingDiscard.map(p => p.id),
        currentDiscardIndex: 0,
        isProcessing: true
      });

      console.log('DEBUG: Setting turnState.step to awaiting_discard');
      setGameState(prev => ({
        ...prev,
        turnState: {
          ...prev.turnState,
          step: 'awaiting_discard'
        }
      }));

      console.log('DEBUG: ===== DISCARD PHASE INITIALIZED =====');
      return;
    }

    // Non-7 roll: proceed with normal resource distribution

    // Find centers with matching number (use cached boardCenters, not fresh load)
    const matchingCenters = boardCenters.filter(center => center.value === rollTotal);

    console.log(`DEBUG: Dice roll ${rollTotal} - found ${matchingCenters.length} matching centers:`,
      matchingCenters.map(c => ({ id: c.id, resourceType: c.resourceType, vertices: c.vertices })));

    if (matchingCenters.length === 0) {
      addToLog(`No centers produce resources for roll ${rollTotal}`);
      // Transition to play_dev_cards phase
      setGameState(prev => ({
        ...prev,
        turnState: {
          ...prev.turnState,
          step: 'play_dev_cards'
        }
      }));
      return;
    }

    // Update player resources and collect gains data in one pass
    setGameState(prevState => {
      // Create a proper deep copy of the state to avoid mutations
      const newState = {
        ...prevState,
        players: prevState.players.map(p => ({
          ...p,
          resources: { ...p.resources }
        }))
      };
      const tempResourceGains: Record<string, Record<string, number>> = {};

      // Process each matching center
      matchingCenters.forEach(center => {
        const resourceType = center.resourceType;
        if (resourceType === 'desert') return; // Desert produces no resources

        // Check if robber is blocking this centre
        if (newState.robberPosition !== undefined && center.id === newState.robberPosition) {
          console.log(`DEBUG: Centre ${center.id} is blocked by the robber - no resources distributed`);
          const blockedMessage = `Centre ${center.id} (${resourceType}) blocked by robber`;
          newState.gameLog = [...newState.gameLog, {
            message: blockedMessage,
            timestamp: new Date().toLocaleTimeString()
          }];
          return;
        }

        console.log(`DEBUG: Processing center ${center.id} with resource ${resourceType}, vertices:`, center.vertices);

        // Check each vertex around this center
        center.vertices.forEach(vertexId => {
          const village = newState.villages.find(v => v.vertexId === vertexId);

          if (village) {
            const player = newState.players.find(p => p.id === village.playerId);
            if (player) {
              // Initialize resource gains tracking
              if (!tempResourceGains[player.id]) {
                tempResourceGains[player.id] = { clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0 };
              }

              // Determine resource amount (1 for village, 2 for city)
              const resourceAmount = village.type === 'city' ? 2 : 1;

              // Add resources to player (now safe since we deep copied)
              if (resourceType in player.resources) {
                (player.resources as any)[resourceType] += resourceAmount;
                player.resources.total += resourceAmount;
                tempResourceGains[player.id][resourceType as keyof typeof tempResourceGains[string]] += resourceAmount;

                console.log(`DEBUG: Added ${resourceAmount} ${resourceType} to ${player.name}. New total: ${player.resources[resourceType as keyof typeof player.resources]}`);
              }
            }
          }
        });
      });

      // Log resource gains immediately (inside setState to have consistent state)
      Object.entries(tempResourceGains).forEach(([playerId, gains]) => {
        const player = newState.players.find(p => p.id === playerId);
        if (player) {
          const gainsList = Object.entries(gains)
            .filter(([_, amount]) => amount > 0)
            .map(([resource, amount]) => `${amount} ${resource}`)
            .join(', ');

          if (gainsList) {
            const playerColor = getPlayerColorStyle(player.color);
            const gainMessage = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> earned ${gainsList}`;
            // Add directly to game log instead of using setTimeout
            newState.gameLog = [...newState.gameLog, {
              message: gainMessage,
              timestamp: new Date().toLocaleTimeString()
            }];
          }
        }
      });

      if (Object.keys(tempResourceGains).length === 0) {
        newState.gameLog = [...newState.gameLog, {
          message: `No players earned resources from roll ${rollTotal}`,
          timestamp: new Date().toLocaleTimeString()
        }];
      }

      console.log(`DEBUG: Resource distribution complete. ${Object.keys(tempResourceGains).length} players received resources.`);
      return newState;
    });

    // After dice roll and resource distribution, transition to play_dev_cards phase
    console.log('DEBUG: Setting turn state to play_dev_cards for development card phase');
    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: 'play_dev_cards'
      }
    }));

    // Mark dice roll phase as complete for flow control (separate from visual display)
    setDiceRollPhaseComplete(true);
    console.log('DEBUG: Dice roll phase marked as complete for flow control');
  }, [gameState, boardCenters, addToLog, getPlayerColorStyle]);

  // Roll dice function (defined after processDiceRoll so it can reference it)
  const rollDice = useCallback(() => {
    if (isRollingDice) return;

    setIsRollingDice(true);
    setShowDiceResult(false);
    setWaitingForConfirmation(false);
    setDiceRoll(null);

    // Show dice animation for 2 seconds
    setTimeout(() => {
      const die1 = Math.floor(Math.random() * 6) + 1;
      const die2 = Math.floor(Math.random() * 6) + 1;
      const total = die1 + die2;

      setDiceRoll({ die1, die2, total });
      setIsRollingDice(false);
      setShowDiceResult(true);

      // Process dice roll immediately to show results in events log
      processDiceRoll(total);

      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);

      // For human players, require Continue button press to clear dice display
      // For AI players, keep dice visible and automatically mark phase as complete
      if (currentPlayer?.isHuman) {
        setWaitingForConfirmation(true);
      } else {
        // For AI players, automatically mark dice roll phase as complete
        // This allows the AI action loop to start
        setDiceRollPhaseComplete(true);
        console.log('DEBUG: AI dice roll phase marked as complete');
      }
      // Note: For AI, showDiceResult stays true and gets cleared on advanceToNextPlayer
    }, 2000);
  }, [isRollingDice, gameState.players, gameState.currentPlayer, processDiceRoll]);

  const confirmDiceRoll = useCallback(() => {
    if (diceRoll && waitingForConfirmation) {
      setWaitingForConfirmation(false);
      setShowDiceResult(false);
      setDiceRoll(null);
      setDiceRollPhaseComplete(true);
    }
  }, [diceRoll, waitingForConfirmation]);

  // Helper function to add colored log messages
  const addColoredLog = useCallback((message: string, playerId: string) => {
    const player = gameState.players.find(p => p.id === playerId);
    const playerColor = getPlayerColorStyle(player?.color || '');
    const playerName = player?.name || playerId;

    // Replace player name in message with colored version
    const coloredMessage = message.replace(
      playerName,
      `<span style="color: ${playerColor}; font-weight: bold;">${playerName}</span>`
    );

    addToLog(coloredMessage);
  }, [gameState.players, getPlayerColorStyle, addToLog]);

  // Load board graph and add diagnostics
  const boardGraph = React.useMemo(() => {
    console.log('Loading board data for game engine, board size:', boardSize);
    const boardData = loadBoardForSize(boardSize);
    const G = boardData.graph;

    // Store centers for resource collection (both in React state and GameState)
    setBoardCenters(boardData.centers);
    setGameState(prev => ({
      ...prev,
      boardCenters: boardData.centers
    }));

    // Diagnostics at load
    console.info('GRAPH', {
      vertices: Object.keys(G.vertices).length,
      edges: Object.keys(G.edges).length,
      centers: boardData.centers.length,
      boardSize: boardSize
    });

    for (const [v, list] of Object.entries(G.edgesByVertex!)) {
      if (list.length < 2 || list.length > 3) {
        console.error('Bad degree at', v, 'edges', list);
      }
    }

    for (const [id, e] of Object.entries(G.edges)) {
      if (!G.vertices[e.v1] || !G.vertices[e.v2]) {
        console.error('Edge with missing endpoint', id, e);
      }
    }

    // Store the complete board data for validators
    (G as any).boardData = boardData;

    return G;
  }, [boardSize]);

  // Check and log trading port access when a village is placed
  const checkAndLogTradingPortAccess = useCallback((playerId: string, vertexId: number, updatedGameState: GameState): Array<{message: string, playerId: string}> => {
    const player = updatedGameState.players.find(p => p.id === playerId);
    const playerName = player?.name || playerId;
    const isHuman = player?.isHuman || false;

    console.log('DEBUG TRADING PORT CHECK:', {
      playerId,
      playerName,
      isHuman,
      vertexId,
      tradingPortsEnabled: updatedGameState.gameSettings.tradingPortsEnabled,
      hasTradingPorts: !!updatedGameState.tradingPorts,
      tradingPortsCount: updatedGameState.tradingPorts?.length,
      tradingPorts: updatedGameState.tradingPorts
    });

    if (!updatedGameState.gameSettings.tradingPortsEnabled) {
      console.log('DEBUG: Trading ports not enabled');
      return [];
    }

    // FALLBACK MECHANISM: Regenerate trading ports if they're missing
    if (!updatedGameState.tradingPorts || updatedGameState.tradingPorts.length === 0) {
      console.warn('WARNING: Trading ports are missing! Attempting to regenerate...');

      try {
        const boardData = loadBoardForSize(updatedGameState.gameSettings.boardSize || boardSize);
        const centers = boardData.centers;

        const vertices = Object.values(boardGraph.vertices).map(v => ({
          id: v.id,
          row: '',
          position: 0,
          x: 0,
          y: 0
        }));

        const edges = Object.values(boardGraph.edges).map(e => ({
          from: e.v1,
          to: e.v2
        }));

        const regeneratedPorts = generateTradingPorts(
          vertices,
          edges,
          updatedGameState.gameSettings.numberOfTradingPorts || 9,
          centers
        );

        console.log('FALLBACK: Successfully regenerated trading ports:', regeneratedPorts.length);

        // Update the game state with regenerated ports
        updatedGameState.tradingPorts = regeneratedPorts;
      } catch (error) {
        console.error('FALLBACK FAILED: Could not regenerate trading ports:', error);
        return [];
      }
    }

    if (!player) {
      console.log('DEBUG: Player not found');
      return [];
    }

    // Validate that the vertex exists in the board graph
    if (!boardGraph.vertices[vertexId]) {
      console.error('ERROR: Vertex does not exist in board graph:', vertexId);
      return [];
    }

    const newPorts = updatedGameState.tradingPorts!.filter(port => {
      // Validate that all port vertices exist in the board graph
      const allVerticesValid = port.vertices.every(v => boardGraph.vertices[v]);
      if (!allVerticesValid) {
        console.error('WARNING: Port has invalid vertices:', port);
        return false;
      }
      const matchesVertex = port.vertices.includes(vertexId);
      return matchesVertex;
    });

    const messages: Array<{message: string, playerId: string}> = [];
    if (newPorts.length > 0) {
      // Get player color for HTML formatting
      const playerColor = getPlayerColorStyle(player?.color || '');
      const formattedPlayerName = `<span style="color: ${playerColor}; font-weight: bold;">${playerName}</span>`;

      newPorts.forEach(port => {
        let portDescription = '';
        if (port.type === 'generic') {
          portDescription = '3:1 Trading Port (any 3 of the same resource for 1 of any other)';
        } else {
          const resourceName = port.type.charAt(0).toUpperCase() + port.type.slice(1);
          portDescription = `2:1 ${resourceName} Trading Port (2 ${resourceName} for 1 of any other resource)`;
        }

        const message = `${formattedPlayerName} gained access to a ${portDescription}`;
        messages.push({
          message,
          playerId
        });
      });
    }
    return messages;
  }, [boardSize, boardGraph, getPlayerColorStyle]);

  // Initialize robber position to desert centre when board centers are loaded
  useEffect(() => {
    if (boardCenters.length > 0 && gameState.robberPosition === undefined) {
      const desertCentreId = findDesertCentre(boardCenters as CentreData[]);
      if (desertCentreId !== null) {
        console.log('DEBUG: Initializing robber position to desert centre:', desertCentreId);
        setGameState(prev => ({
          ...prev,
          robberPosition: desertCentreId
        }));
      }
    }
  }, [boardCenters, gameState.robberPosition]);

  // Helper function to collect resources from adjacent centers
  const collectResourcesFromAdjacentCenters = useCallback((vertexId: number, playerId: string) => {
    console.log(`DEBUG: Collecting resources for vertex ${vertexId}, player ${playerId}`);
    
    // Find centers that include this vertex in their vertices array
    const adjacentCenters = boardCenters.filter(center => 
      center.vertices.includes(vertexId) && center.resourceType !== 'desert'
    );
    
    console.log(`DEBUG: Found ${adjacentCenters.length} adjacent non-desert centers:`, 
      adjacentCenters.map(c => ({ id: c.id, resourceType: c.resourceType, value: c.value })));
    
    if (adjacentCenters.length === 0) {
      console.log(`DEBUG: No adjacent resource centers for vertex ${vertexId}`);
      return { resources: {}, logMessage: '' };
    }
    
    // Count resources by type
    const resourceCounts: Record<string, number> = {};
    adjacentCenters.forEach(center => {
      resourceCounts[center.resourceType] = (resourceCounts[center.resourceType] || 0) + 1;
    });
    
    // Create log message
    const resourceList = Object.entries(resourceCounts)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    
    const player = gameState.players.find(p => p.id === playerId);
    const playerColor = getPlayerColorStyle(player?.color || '');
    const logMessage = `<span style="color: ${playerColor}; font-weight: bold;">${player?.name || playerId}</span> collected: ${resourceList}`;
    
    console.log(`DEBUG: Resource collection result:`, { resourceCounts, logMessage });
    
    return { resources: resourceCounts, logMessage };
  }, [boardCenters, gameState.players, getPlayerColorStyle]);
  
  // Helper function to check if roads are connected
  const areRoadsConnected = useCallback((road1: Road, road2: Road): boolean => {
    // Two roads are connected if they share a vertex
    return road1.from === road2.from || road1.from === road2.to || 
           road1.to === road2.from || road1.to === road2.to;
  }, []);

  // Dice rolling function
  // Auto-roll dice for AI players in playing phase
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        !diceRoll &&
        !isRollingDice &&
        !waitingForConfirmation &&
        gameState.turnState.step === 'awaiting_dice_roll') {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      // Only auto-roll if current player matches turnState and is AI
      if (currentPlayer &&
          !currentPlayer.isHuman &&
          currentPlayer.id === gameState.turnState.currentPlayerId) {
        console.log(`DEBUG: Auto-rolling dice for AI player ${currentPlayer.name}, step: ${gameState.turnState.step}`);
        const timer = setTimeout(() => {
          rollDice();
        }, 1500); // 1.5 second delay for AI

        return () => clearTimeout(timer);
      }
    }
  }, [gameState.phase, gameState.currentPlayer, gameState.players, gameState.turnState.step, gameState.turnState.currentPlayerId, diceRoll, isRollingDice, waitingForConfirmation, rollDice]);

  // Comprehensive validation function for development cards
  const validateDevCardPlay = useCallback((card: DevelopmentCard, currentPlayer: Player): string | null => {
    // 1. Extra Point cannot be played manually
    if (card.name === 'Extra Point') {
      return 'Extra Point cards are automatic and cannot be played manually.';
    }

    // 2. Cannot play cards drawn this turn
    if (card.turnDrawn === currentPlayer.currentTurn) {
      return 'Cannot play a card drawn this turn.';
    }

    // 3. Guard - only one per turn
    if (card.name === 'Guard' && currentPlayer.guardsPlayedThisTurn > 0) {
      return 'You can only play one Guard card per turn.';
    }

    // 4. Expert Negotiator - only one per turn
    if (card.name === 'Expert Negotiator' && gameState.turnState.expertNegotiatorActive) {
      return 'You have already played Expert Negotiator this turn.';
    }

    // 5. Road Construction - need at least 2 valid road placement locations
    if (card.name === 'Road Construction') {
      const validRoadPlacements = getValidRoadPlacements(
        currentPlayer.id,
        gameState,
        gameState.boardSize
      );
      if (validRoadPlacements.length < 1) {
        return 'You need at least one valid road placement location to play Road Construction.';
      }
    }

    // 6. Resource Swap - at least one opponent must have resources
    if (card.name === 'Resource Swap') {
      const opponents = gameState.players.filter(p => p.id !== currentPlayer.id);
      const hasOpponentWithResources = opponents.some(opp =>
        opp.resources.clay > 0 || opp.resources.lumber > 0 ||
        opp.resources.grain > 0 || opp.resources.fabric > 0 ||
        opp.resources.mineral > 0
      );
      if (!hasOpponentWithResources) {
        return 'No opponents have any resources to swap with.';
      }
    }

    // 7. Free Upgrade - player must have at least one village
    if (card.name === 'Free Upgrade') {
      const playerVillages = gameState.villages.filter(
        v => v.playerId === currentPlayer.id && v.type === 'settlement'
      );
      if (playerVillages.length === 0) {
        return 'You must have at least one Village to play Free Upgrade.';
      }
    }

    return null; // Card is valid to play
  }, [gameState, getValidRoadPlacements]);

  // Helper: Get playable dev cards for a player
  const getPlayableDevCards = useCallback((player: Player) => {
    return player.developmentCardsInHand.filter(card => {
      // Use comprehensive validation function
      const validationError = validateDevCardPlay(card, player);
      return validationError === null;
    });
  }, [validateDevCardPlay]);

  // Helper: AI decides whether to play a dev card (strategic with difficulty)
  const aiDecidePlayDevCard = useCallback((player: Player): DevelopmentCard | null => {
    const decision = shouldPlayDevCardAfterRoll(
      player,
      gameState,
      boardSize,
      player.difficulty || 'normal'
    );

    if (decision.shouldPlay && decision.cardId) {
      const card = player.developmentCardsInHand.find(c => c.id === decision.cardId);
      if (card && decision.reasoning) {
        const personality = player.character?.name ? getPersonalityForCharacter(player.character.name) : 'balanced';
        setAiDevCardDecision({ reasoning: decision.reasoning, personality });
      }
      return card || null;
    }
    return null;
  }, [gameState, boardSize]);

  // Helper to start AI action loop
  const startAIActionLoop = useCallback((playerId: string) => {
    console.log('DEBUG: Starting AI action loop for', playerId);
    setAiActionLoopActive(true);
    setAiActionLoopIterations(0);
  }, []);

  // Start AI action loop for AI players in playing phase after dice roll is complete
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'main' &&
        diceRollPhaseComplete &&
        !isRollingDice &&
        !waitingForConfirmation &&
        !aiActionLoopActive) {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      // Only start action loop if current player matches turnState and is AI
      if (currentPlayer &&
          !currentPlayer.isHuman &&
          currentPlayer.id === gameState.turnState.currentPlayerId) {
        console.log(`DEBUG: Starting AI action loop for ${currentPlayer.name}, step: ${gameState.turnState.step}, diceRollPhaseComplete: ${diceRollPhaseComplete}`);
        const timer = setTimeout(() => {
          startAIActionLoop(currentPlayer.id);
        }, 1000);

        return () => clearTimeout(timer);
      }
    }
  }, [gameState.phase, gameState.currentPlayer, gameState.players, gameState.turnState.step, gameState.turnState.currentPlayerId, diceRollPhaseComplete, isRollingDice, waitingForConfirmation, aiActionLoopActive, startAIActionLoop, gameState]);

  // Helper function to check if a player qualifies for longest road bonus
  const checkLongestRoadBonus = useCallback((
    playerId: string,
    newLength: number,
    customRoadLengths?: Map<string, number>
  ) => {
    const minLength = gameState.gameSettings?.longestRoadSize || 5;
    const bonus = gameState.gameSettings?.longestRoadBonus || 2;
    const roadLengthsToUse = customRoadLengths || gameState.longestRoadLengths;

    // Check if this player now qualifies and no one else has it
    if (newLength >= minLength) {
      const currentHolder = gameState.players.find(p => p.hasLongestRoad);

      if (!currentHolder) {
        // First player to reach minimum length gets the bonus
        const player = gameState.players.find(p => p.id === playerId);
        if (player) {
          return {
            shouldAward: true,
            bonus,
            playerName: player.name,
            roadLength: newLength,
            isFirstAchievement: true
          };
        }
      } else if (currentHolder.id !== playerId) {
        // Check if this player beats the current holder
        const currentHolderLength = roadLengthsToUse.get(currentHolder.id) || 0;
        if (newLength > currentHolderLength) {
          const player = gameState.players.find(p => p.id === playerId);
          return {
            shouldAward: true,
            bonus,
            previousHolder: currentHolder.id,
            previousHolderName: currentHolder.name,
            playerName: player?.name || '',
            roadLength: newLength,
            isFirstAchievement: false
          };
        }
      }
    }

    return { shouldAward: false, bonus: 0 };
  }, [gameState.gameSettings, gameState.players, gameState.longestRoadLengths]);


  // Initialize board graph from board data
  const initializeBoardGraph = useCallback(() => {
    // Ensure validators are initialized with the correct board data
    try {
      initializeValidators(boardSize);
    } catch (error) {
      console.error('Failed to initialize validators in initializeBoardGraph:', error);
    }
    
    const verticesOccupiedBy: Record<string, string | null> = {};
    const edgesOccupiedBy: Record<string, string | null> = {};
    
    // Initialize occupancy maps
    Object.keys(boardGraph.vertices).forEach(vId => {
      verticesOccupiedBy[vId] = null;
    });
    
    Object.keys(boardGraph.edges).forEach(eId => {
      edgesOccupiedBy[eId] = null;
    });
    
    return { verticesOccupiedBy, edgesOccupiedBy };
  }, [boardSize, boardGraph.vertices, boardGraph.edges]);
  
  // Turn lock helper
  const withTurnLock = useCallback((fn: () => void) => {
    if (gameState.turnState.lock) return;
    setGameState(prev => ({
      ...prev,
      turnState: { ...prev.turnState, lock: true }
    }));
    try {
      fn();
    } finally {
      setGameState(prev => ({
        ...prev,
        turnState: { ...prev.turnState, lock: false }
      }));
    }
  }, [gameState.turnState.lock]);
  
  // Begin turn helper
  const beginTurn = useCallback((playerId: string) => {
    setGameState(prev => ({
      ...prev,
      turnState: {
        currentPlayerId: playerId,
        step: 'init_place_village',
        placementContext: { lastVillageVertex: null },
        lock: false
      }
    }));
    console.info('STEP', 'init_place_village');
  }, []);
  
  // Validators
  
  const getNextPlayerId = useCallback((currentPlayerId: string): string => {
    const currentIndex = gameState.players.findIndex(p => p.id === currentPlayerId);
    const nextIndex = (currentIndex + 1) % gameState.players.length;
    return gameState.players[nextIndex].id;
  }, [gameState.players]);
  
  const advanceTurnFromP1 = useCallback(() => {
    const nextPlayerId = getNextPlayerId(gameState.turnState.currentPlayerId);
    console.log("NEXT TURN", nextPlayerId, 'init_place_village');
    setGameState(prev => ({
      ...prev,
      currentPlayer: nextPlayerId,
      turnState: {
        currentPlayerId: nextPlayerId,
        step: 'init_place_village',
        placementContext: { lastVillageVertex: null },
        lock: false
      }
    }));
    console.info('STEP', 'init_place_village');
  }, [gameState.turnState.currentPlayerId, getNextPlayerId]);
  
  // Phase-1 actions
  const placeVillage_P1_wrapper = useCallback((playerId: string, vertexId: number) => {
    console.log('DEBUG: placeVillage_P1_wrapper called with:', { playerId, vertexId });
    console.log('DEBUG: Current game state turn:', gameState.turnState);
    console.log('DEBUG: Current player ID:', gameState.currentPlayer);
    console.log('DEBUG: Turn state current player:', gameState.turnState.currentPlayerId);
    console.log('DEBUG: Current game phase:', gameState.phase);
    
    // Defensive input handling
    if (!vertexId && vertexId !== 0) {
      console.log('DEBUG: No vertex selected');
      addToLog('Please select a valid vertex.');
      return;
    }
    
    // Convert to number for safety and consistency
    vertexId = Number(vertexId);
    console.log('DEBUG: Processing vertex:', vertexId);
    
    // Validate using adjacency rules
    const canPlace = canPlaceVillage(vertexId, gameState.verticesOccupiedBy || {}, boardSize);
    console.log('DEBUG: canPlaceVillage result for', vertexId, ':', canPlace);
    console.log('DEBUG: Current occupied vertices:', gameState.verticesOccupiedBy);
    
    if (!canPlace) {
      const reason = whyNotVillage(vertexId, gameState.verticesOccupiedBy || {}, boardSize);
      console.log('DEBUG: placement validation failed:', reason);
      addToLog('Invalid placement — choose a free vertex not adjacent to another village or estate.');
      return;
    }
    
    console.log('DEBUG: placement validation passed');
    
    // Add debouncing to prevent double-clicks
    const now = Date.now();
    if (now - (placeVillage_P1_wrapper as any).lastCall < 300) {
      console.log('DEBUG: Debounced duplicate call');
      return;
    }
    (placeVillage_P1_wrapper as any).lastCall = now;
    
    // Create mutable copies for the engine
    const mutableState = {
      ...gameState,
      verticesOccupiedBy: { ...gameState.verticesOccupiedBy },
      turnState: { ...gameState.turnState, placementContext: { ...gameState.turnState.placementContext } }
    };
    
    // Call the phase1 engine with mutable state
    try {
      placeVillage_P1(mutableState, playerId, vertexId);
      console.log('DEBUG: Village placed successfully by engine');
    } catch (error) {
      console.error('DEBUG: Error in placeVillage_P1:', error);
      addToLog('Error placing village. Please try again.');
      return;
    }
    
    const player = gameState.players.find(p => p.id === playerId);
    const playerName = player?.name || playerId;

    // Collect resources if in Phase 2
    let resourceCollection = { resources: {}, logMessage: '' };
    if (gameState.phase === 'setup-phase-2') {
      resourceCollection = collectResourcesFromAdjacentCenters(vertexId, playerId);
      console.log('DEBUG: Resource collection for human player:', {
        vertexId,
        playerId,
        phase: gameState.phase,
        resources: resourceCollection.resources,
        logMessage: resourceCollection.logMessage
      });
    }

    console.log('DEBUG: Updating React state after village placement');

    // Update React state - SINGLE ATOMIC UPDATE
    setGameState(prev => {
      const newState = {
        ...prev,
        verticesOccupiedBy: mutableState.verticesOccupiedBy,
        turnState: mutableState.turnState,
        currentPlayer: playerId,
        villages: [...prev.villages, {
          id: `village-${vertexId}`,
          playerId,
          vertexId: vertexId,
          type: 'settlement'
        }],
        players: prev.players.map(p =>
          p.id === playerId
            ? {
                ...p,
                villageCount: p.villageCount + 1,
                score: p.score + 1,
                resources: prev.phase === 'setup-phase-2' ? {
                  clay: p.resources.clay + (resourceCollection.resources.clay || 0),
                  lumber: p.resources.lumber + (resourceCollection.resources.lumber || 0),
                  grain: p.resources.grain + (resourceCollection.resources.grain || 0),
                  fabric: p.resources.fabric + (resourceCollection.resources.fabric || 0),
                  mineral: p.resources.mineral + (resourceCollection.resources.mineral || 0),
                  total: p.resources.total + Object.values(resourceCollection.resources).reduce((sum: number, count) => sum + (count as number), 0)
                } : p.resources
              }
            : p
        )
      };

      // Generate formatted log messages using newState.players for correct colors
      const logMessages: Array<{message: string, playerId: string, timestamp: string}> = [];
      const currentPlayer = newState.players.find(p => p.id === playerId);
      const playerColor = getPlayerColorStyle(currentPlayer?.color || '');
      const formattedPlayerName = `<span style="color: ${playerColor}; font-weight: bold;">${playerName}</span>`;

      // Add village placement message with HTML formatting
      if (gameState.phase === 'setup-phase-1') {
        logMessages.push({
          message: `${formattedPlayerName} placed their first village and earned 1 point.`,
          playerId,
          timestamp: new Date().toLocaleTimeString()
        });
      } else if (gameState.phase === 'setup-phase-2') {
        logMessages.push({
          message: `${formattedPlayerName} placed their second village and earned 1 point.`,
          playerId,
          timestamp: new Date().toLocaleTimeString()
        });

        // Add resource collection message with HTML formatting
        if (resourceCollection.logMessage) {
          const formattedResourceMessage = resourceCollection.logMessage.replace(
            playerName,
            formattedPlayerName
          );
          logMessages.push({
            message: formattedResourceMessage,
            playerId,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      }

      // Generate trading port messages if player placed a village
      const tradingPortMessages: Array<{message: string, playerId: string, timestamp: string}> = [];
      const portMsgs = checkAndLogTradingPortAccess(playerId, vertexId, newState);
      console.log('DEBUG [HUMAN Trading Port]: Generated messages inside setState', {
        messagesCount: portMsgs.length,
        messages: portMsgs
      });
      portMsgs.forEach(msg => {
        tradingPortMessages.push({
          message: msg.message,
          playerId: msg.playerId,
          timestamp: new Date().toLocaleTimeString()
        });
      });

      // Combine all messages and add to gameLog in one atomic operation
      const allMessages = [...logMessages, ...tradingPortMessages];
      console.log('DEBUG [HUMAN Trading Port]: Adding all messages to gameLog', {
        totalMessages: allMessages.length,
        tradingPortCount: tradingPortMessages.length,
        allMessagesContent: allMessages
      });

      return {
        ...newState,
        gameLog: [...prev.gameLog, ...allMessages]
      };
    });

    console.log('DEBUG: Village placement complete');
  }, [gameState, collectResourcesFromAdjacentCenters, addToLog, addColoredLog, checkAndLogTradingPortAccess, getPlayerColorStyle]);
  
  const placeRoad_P1_byEdgeId_wrapper = useCallback((playerId: string, edgeIdStr: string) => {
    console.log('DEBUG: placeRoad_P1_byEdgeId_wrapper called with:', { playerId, edgeIdStr });
    
    // Add debouncing to prevent double-clicks
    const now = Date.now();
    if (now - (placeRoad_P1_byEdgeId_wrapper as any).lastCall < 300) {
      console.log('DEBUG: Debounced duplicate road call');
      return;
    }
    (placeRoad_P1_byEdgeId_wrapper as any).lastCall = now;
    
    // Create mutable copies for the engine
    const mutableState = {
      ...gameState,
      edgesOccupiedBy: { ...gameState.edgesOccupiedBy },
      turnState: { ...gameState.turnState, placementContext: { ...gameState.turnState.placementContext } }
    };
    
    // Call the phase1 engine with mutable state
    try {
      placeRoad_P1_byEdgeId(mutableState, playerId, edgeIdStr);
      console.log('DEBUG: Road placed successfully by engine');
    } catch (error) {
      console.error('DEBUG: Error in placeRoad_P1_byEdgeId:', error);
      addToLog('Error placing road. Please try again.');
      return;
    }
    
    const player = gameState.players.find(p => p.id === playerId);
    const playerName = player?.name || playerId;
    
    // Check if this road connects to the player's first road (Phase 2 only)
    let newLongestRoadLength = 1; // Default for any road
    let longestRoadUpdate = null;
    
    if (gameState.phase === 'setup-phase-2') {
      const playerRoads = gameState.roads.filter(r => r.playerId === playerId);
      if (playerRoads.length > 0) {
        // Parse edge ID to get vertices for the new road
        const [v1Str, v2Str] = edgeIdStr.split('__');
        const newFrom = parseInt(v1Str);
        const newTo = parseInt(v2Str);
        const newRoad = { id: edgeIdStr, playerId, from: newFrom, to: newTo };
        
        // Check if new road shares a vertex with any existing road
        const isConnected = playerRoads.some(existingRoad => areRoadsConnected(newRoad, existingRoad));
        
        if (isConnected) {
          newLongestRoadLength = 2;
          console.log(`DEBUG: Roads are connected, setting longest road to 2 for player ${playerId}`);
          
          // Check for longest road bonus
          longestRoadUpdate = checkLongestRoadBonus(playerId, 2);
        } else {
          console.log(`DEBUG: Roads are not connected, keeping longest road at 1 for player ${playerId}`);
        }
      }
    } else {
      // Phase 1: just track that player has 1 road
      newLongestRoadLength = Math.max(gameState.longestRoadLengths.get(playerId) || 0, 1);
    }
    
    // Update React state
    const edge = boardGraph.edges[edgeIdStr];
    if (!edge) {
      console.warn('DEBUG: Edge not found in boardGraph, but proceeding with road placement:', edgeIdStr);
      // Parse edge ID to get vertices for road creation
      const [v1Str, v2Str] = edgeIdStr.split('__');
      const fromVertex = parseInt(v1Str);
      const toVertex = parseInt(v2Str);
      
      console.log('DEBUG: Updating React state after road placement (parsed from edge ID)');
      
      setGameState(prev => ({
        ...prev,
        edgesOccupiedBy: mutableState.edgesOccupiedBy,
        turnState: mutableState.turnState,
        currentPlayer: mutableState.turnState.currentPlayerId,
        turn: mutableState.turnState.currentPlayerId !== playerId ? prev.turn + 1 : prev.turn,
        roads: [...prev.roads, {
          id: edgeIdStr,
          playerId,
          from: fromVertex,
          to: toVertex
        }],
        players: prev.players.map(p =>
          p.id === playerId
            ? {
                ...p,
                roadCount: p.roadCount + 1,
                score: longestRoadUpdate?.shouldAward ? p.score + longestRoadUpdate.bonus : p.score,
                hasLongestRoad: longestRoadUpdate?.shouldAward ? true : p.hasLongestRoad
              }
            : longestRoadUpdate?.previousHolder === p.id
              ? { ...p, hasLongestRoad: false, score: p.score - (longestRoadUpdate.bonus || 0) }
            : p.id === mutableState.turnState.currentPlayerId
              ? { ...p, isActive: true, currentTurn: p.currentTurn + (mutableState.turnState.currentPlayerId !== playerId ? 1 : 0) }
              : { ...p, isActive: false }
        ),
        longestRoadLengths: new Map([
          ...prev.longestRoadLengths,
          [playerId, newLongestRoadLength]
        ])
      }));

      // Add to activity log with parsed vertices
      addColoredLog(`${playerName} placed a road between vertices ${fromVertex} and ${toVertex}.`, playerId);

      // Log longest road achievement after state update
      if (longestRoadUpdate?.shouldAward) {
        if (longestRoadUpdate.isFirstAchievement) {
          addColoredLog(`${longestRoadUpdate.playerName} achieved the Longest Road (${longestRoadUpdate.roadLength}) and earned ${longestRoadUpdate.bonus} bonus points!`, playerId);
        } else {
          addColoredLog(`${longestRoadUpdate.playerName} took the Longest Road (${longestRoadUpdate.roadLength}) from ${longestRoadUpdate.previousHolderName} and earned ${longestRoadUpdate.bonus} bonus points!`, playerId);
          if (longestRoadUpdate.previousHolder) {
            addColoredLog(`${longestRoadUpdate.previousHolderName} lost the Longest Road and ${longestRoadUpdate.bonus} bonus points`, longestRoadUpdate.previousHolder);
          }
        }
      }

      // Check if turn advanced to next player
      if (mutableState.turnState.currentPlayerId !== playerId) {
        const nextPlayer = gameState.players.find(p => p.id === mutableState.turnState.currentPlayerId);
        if (nextPlayer) {
          addColoredLog(`${nextPlayer.name} begins their turn.`, nextPlayer.id);
        }
      }

      console.log('DEBUG: Road placement complete (parsed)');
      return;
    }
    
    const fromVertex = edge.v1;
    const toVertex = edge.v2;
    
    console.log('DEBUG: Updating React state after road placement');
    
    setGameState(prev => ({
      ...prev,
      edgesOccupiedBy: mutableState.edgesOccupiedBy,
      turnState: mutableState.turnState,
      currentPlayer: mutableState.turnState.currentPlayerId,
      turn: mutableState.turnState.currentPlayerId !== playerId ? prev.turn + 1 : prev.turn,
      roads: [...prev.roads, {
        id: edgeIdStr,
        playerId,
        from: fromVertex,
        to: toVertex
      }],
      longestRoadLengths: new Map([
        ...prev.longestRoadLengths,
        [playerId, newLongestRoadLength]
      ]),
        players: prev.players.map(p => {
          if (p.id === playerId) {
            return { 
              ...p, 
              roadCount: p.roadCount + 1,
              score: longestRoadUpdate?.shouldAward ? p.score + longestRoadUpdate.bonus : p.score,
              hasLongestRoad: longestRoadUpdate?.shouldAward ? true : p.hasLongestRoad
            };
          }
          if (longestRoadUpdate?.previousHolder === p.id) {
            return { ...p, hasLongestRoad: false, score: p.score - (longestRoadUpdate.bonus || 0) };
          }
          if (p.id === mutableState.turnState.currentPlayerId) {
            return { 
              ...p, 
              isActive: true, 
              currentTurn: p.currentTurn + (mutableState.turnState.currentPlayerId !== playerId ? 1 : 0) 
            };
          }
          return { ...p, isActive: false };
        })
    }));
    
    // Add to activity log with colored text
    const timestamp = new Date().toLocaleTimeString();
    if (gameState.phase === 'setup-phase-1') {
      addColoredLog(`${playerName} placed a road between vertices ${fromVertex} and ${toVertex}.`, playerId);
    } else if (gameState.phase === 'setup-phase-2') {
      addColoredLog(`${playerName} placed a road between vertices ${fromVertex} and ${toVertex}.`, playerId);
      if (newLongestRoadLength === 2 && !longestRoadUpdate?.shouldAward) {
        addColoredLog(`${playerName}'s roads are now connected (longest road: 2).`, playerId);
      }
    }

    // Log longest road achievement after state update
    if (longestRoadUpdate?.shouldAward) {
      if (longestRoadUpdate.isFirstAchievement) {
        addColoredLog(`${longestRoadUpdate.playerName} achieved the Longest Road (${longestRoadUpdate.roadLength}) and earned ${longestRoadUpdate.bonus} bonus points!`, playerId);
      } else {
        addColoredLog(`${longestRoadUpdate.playerName} took the Longest Road (${longestRoadUpdate.roadLength}) from ${longestRoadUpdate.previousHolderName} and earned ${longestRoadUpdate.bonus} bonus points!`, playerId);
        if (longestRoadUpdate.previousHolder) {
          addColoredLog(`${longestRoadUpdate.previousHolderName} lost the Longest Road and ${longestRoadUpdate.bonus} bonus points`, longestRoadUpdate.previousHolder);
        }
      }
    }

    // Check if turn advanced to next player
    if (mutableState.turnState.currentPlayerId !== playerId) {
      const nextPlayer = gameState.players.find(p => p.id === mutableState.turnState.currentPlayerId);
      if (nextPlayer) {
        addColoredLog(`${nextPlayer.name} begins their turn.`, nextPlayer.id);
      }
    }

    console.log('DEBUG: Road placement complete');
  }, [gameState, boardGraph, areRoadsConnected, addToLog, addColoredLog, checkLongestRoadBonus]);
  
  // AI logic bound to the same gates
  const aiTakeTurn_P1_wrapper = useCallback((playerId: string) => {
    console.log('DEBUG: aiTakeTurn_P1_wrapper called for player:', playerId);
    
    // Add debouncing to prevent multiple AI calls
    const now = Date.now();
    if (now - (aiTakeTurn_P1_wrapper as any).lastCall < 500) {
      console.log('DEBUG: Debounced duplicate AI call');
      return;
    }
    (aiTakeTurn_P1_wrapper as any).lastCall = now;
    
    // Create mutable copies for the engine
    const mutableState = {
      ...gameState,
      verticesOccupiedBy: { ...gameState.verticesOccupiedBy },
      edgesOccupiedBy: { ...gameState.edgesOccupiedBy },
      turnState: { ...gameState.turnState, placementContext: { ...gameState.turnState.placementContext } }
    };
    
    const initialStep = mutableState.turnState.step;
    const initialPlayerId = mutableState.turnState.currentPlayerId;
    
    console.log('DEBUG: AI turn initial state:', { step: initialStep, playerId: initialPlayerId });
    
    // Call the phase1 engine with mutable state
    try {
      aiTakeTurn_P1(mutableState);
      console.log('DEBUG: AI turn completed successfully');
    } catch (error) {
      console.error('DEBUG: Error in AI turn:', error);
      return;
    }
    
    const player = gameState.players.find(p => p.id === playerId);
    const playerName = player?.name || playerId;

    // Check what changed using reliable placement context instead of state comparison
    // If step changed from 'init_place_village' to 'init_place_road', a village was placed
    const villagePlaced = initialStep === 'init_place_village' && mutableState.turnState.step === 'init_place_road';
    const villageVertexId = villagePlaced ? mutableState.turnState.placementContext.lastVillageVertex : null;

    const roadAdded = Object.keys(mutableState.edgesOccupiedBy).find(e =>
      mutableState.edgesOccupiedBy[e] === playerId && !gameState.edgesOccupiedBy[e]
    );

    console.log('DEBUG: AI changes detected:', {
      playerId,
      playerName,
      villagePlaced,
      villageVertexId,
      roadAdded,
      initialStep,
      newStep: mutableState.turnState.step,
      placementContext: mutableState.turnState.placementContext
    });

    if (villagePlaced) {
      console.log(`DEBUG: AI ${playerName} (${playerId}) PLACED VILLAGE at vertex ${villageVertexId}`);
    } else {
      console.log(`DEBUG: AI ${playerName} (${playerId}) did NOT place village (step transition: ${initialStep} -> ${mutableState.turnState.step})`);
    }

    // Initialize resource collection for AI
    let aiResourceCollection = { resources: {}, logMessage: '' };

    // Collect resources if AI placed a village in Phase 2
    if (villagePlaced && villageVertexId !== null && gameState.phase === 'setup-phase-2') {
      aiResourceCollection = collectResourcesFromAdjacentCenters(villageVertexId, playerId);
    }

    // Check road edge details
    if (roadAdded) {
      const edge = boardGraph.edges[roadAdded];
      console.log('DEBUG: AI road edge details:', {
        roadAdded,
        edge,
        edgeExists: !!edge,
        totalEdgesInGraph: Object.keys(boardGraph.edges).length,
        boardSize: boardSize
      });

      if (edge && edge.v1 && edge.v2) {
        const [v1Str, v2Str] = roadAdded.split('__');
        console.log('DEBUG: AI road vertices:', { fromVertex: parseInt(v1Str), toVertex: parseInt(v2Str), edgeId: roadAdded });
      }
    }

    // Check if AI road connects to existing road (Phase 2 only)
    let newLongestRoadLength = 1; // Default for any road
    let aiLongestRoadUpdate = null;

    if (gameState.phase === 'setup-phase-2' && roadAdded) {
      const playerRoads = gameState.roads.filter(r => r.playerId === playerId);
      if (playerRoads.length > 0) {
        const [v1Str, v2Str] = roadAdded.split('__');
        const newRoad = {
          id: roadAdded,
          playerId,
          from: parseInt(v1Str),
          to: parseInt(v2Str)
        };

        const isConnected = playerRoads.some(existingRoad => areRoadsConnected(newRoad, existingRoad));
        if (isConnected) {
          newLongestRoadLength = 2;
          aiLongestRoadUpdate = checkLongestRoadBonus(playerId, 2);
          console.log(`DEBUG: AI roads are connected, setting longest road to 2 for player ${playerId}`);
        }
      }
    } else if (roadAdded) {
      // Phase 1: just track that AI has 1 road
      newLongestRoadLength = Math.max(gameState.longestRoadLengths.get(playerId) || 0, 1);
    }
    
    // Update React state with any changes made by AI - SINGLE ATOMIC UPDATE
    setGameState(prev => {
      const newState = {
        ...prev,
        verticesOccupiedBy: mutableState.verticesOccupiedBy,
        edgesOccupiedBy: mutableState.edgesOccupiedBy,
        turnState: mutableState.turnState,
        currentPlayer: mutableState.turnState.currentPlayerId,
        turn: mutableState.turnState.currentPlayerId !== initialPlayerId ? prev.turn + 1 : prev.turn,
        villages: villagePlaced && villageVertexId !== null ? [...prev.villages, {
          id: `village-${villageVertexId}`,
          playerId,
          vertexId: villageVertexId,
          type: 'settlement'
        }] : prev.villages,
      roads: roadAdded ? (() => {
        // Parse edge ID to get vertices
        const [v1Str, v2Str] = roadAdded.split('__');
        const fromVertex = parseInt(v1Str);
        const toVertex = parseInt(v2Str);

        if (isNaN(fromVertex) || isNaN(toVertex)) {
          console.error("DEBUG: Invalid edge ID format in AI road creation:", roadAdded);
          return prev.roads;
        }

        console.log(`DEBUG: AI ${playerName} creating road: ${fromVertex} -> ${toVertex}`, {
          edgeId: roadAdded,
          playerId,
          roadCount: prev.roads.length + 1
        });
        return [...prev.roads, {
          id: roadAdded,
          playerId,
          from: fromVertex,
          to: toVertex
        }];
      })() : prev.roads,
      longestRoadLengths: roadAdded ? new Map([
        ...prev.longestRoadLengths,
        [playerId, newLongestRoadLength]
      ]) : prev.longestRoadLengths,
      players: prev.players.map(p => {
        if (p.id === playerId) {
          const villageScore = villagePlaced ? 1 : 0;
          const longestRoadScore = aiLongestRoadUpdate?.shouldAward ? aiLongestRoadUpdate.bonus : 0;
          return {
            ...p,
            villageCount: villagePlaced ? p.villageCount + 1 : p.villageCount,
            roadCount: roadAdded ? p.roadCount + 1 : p.roadCount,
            score: p.score + villageScore + longestRoadScore,
            hasLongestRoad: aiLongestRoadUpdate?.shouldAward ? true : p.hasLongestRoad,
            isActive: mutableState.turnState.currentPlayerId === playerId,
            resources: villagePlaced && prev.phase === 'setup-phase-2' ? {
              clay: p.resources.clay + (aiResourceCollection.resources.clay || 0),
              lumber: p.resources.lumber + (aiResourceCollection.resources.lumber || 0),
              grain: p.resources.grain + (aiResourceCollection.resources.grain || 0),
              fabric: p.resources.fabric + (aiResourceCollection.resources.fabric || 0),
              mineral: p.resources.mineral + (aiResourceCollection.resources.mineral || 0),
              total: p.resources.total + Object.values(aiResourceCollection.resources).reduce((sum: number, count) => sum + (count as number), 0)
            } : p.resources
          };
        } else if (aiLongestRoadUpdate?.previousHolder === p.id) {
          return { ...p, hasLongestRoad: false, score: p.score - (aiLongestRoadUpdate.bonus || 0) };
        } else if (p.id === mutableState.turnState.currentPlayerId) {
          return {
            ...p,
            isActive: true,
            currentTurn: mutableState.turnState.currentPlayerId !== initialPlayerId ? p.currentTurn + 1 : p.currentTurn
          };
        } else {
          return { ...p, isActive: false };
        }
      })
      };

      // Generate formatted log messages using newState.players for correct colors
      const logMessages: Array<{message: string, playerId: string, timestamp: string}> = [];
      const currentPlayer = newState.players.find(p => p.id === playerId);
      const playerColor = getPlayerColorStyle(currentPlayer?.color || '');
      const formattedPlayerName = `<span style="color: ${playerColor}; font-weight: bold;">${playerName}</span>`;

      // Add village placement message with HTML formatting
      if (villagePlaced && villageVertexId !== null) {
        logMessages.push({
          message: `${formattedPlayerName} placed a village at vertex ${villageVertexId} and earned 1 point.`,
          playerId,
          timestamp: new Date().toLocaleTimeString()
        });

        // Add AI decision context for village placement in testing mode
        if (gameState.gameSettings.testingMode && currentPlayer && !currentPlayer.isHuman) {
          const personality = currentPlayer.character?.name ?
            getPersonalityForCharacter(currentPlayer.character.name) : 'balanced';
          const personalityLabel = personality.charAt(0).toUpperCase() + personality.slice(1);
          const reasoning = generateSetupVillageReasoning(villageVertexId, newState);
          logMessages.push({
            message: `<span style="color: #6B7280; font-style: italic; padding-left: 16px; display: block;">${personalityLabel} - Objective: ${reasoning}</span>`,
            playerId,
            timestamp: new Date().toLocaleTimeString()
          });
        }

        // Add resource collection message for Phase 2 with HTML formatting
        if (gameState.phase === 'setup-phase-2' && aiResourceCollection.logMessage) {
          const formattedResourceMessage = aiResourceCollection.logMessage.replace(
            playerName,
            formattedPlayerName
          );
          logMessages.push({
            message: formattedResourceMessage,
            playerId,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      }

      // Add road placement messages with HTML formatting
      if (roadAdded) {
        const [v1Str, v2Str] = roadAdded.split('__');
        const fromVertex = parseInt(v1Str);
        const toVertex = parseInt(v2Str);

        if (!isNaN(fromVertex) && !isNaN(toVertex)) {
          logMessages.push({
            message: `${formattedPlayerName} placed a road connecting vertex ${fromVertex} to vertex ${toVertex}.`,
            playerId,
            timestamp: new Date().toLocaleTimeString()
          });

          // Add AI decision context for road placement in testing mode
          if (gameState.gameSettings.testingMode && currentPlayer && !currentPlayer.isHuman) {
            const personality = currentPlayer.character?.name ?
              getPersonalityForCharacter(currentPlayer.character.name) : 'balanced';
            const personalityLabel = personality.charAt(0).toUpperCase() + personality.slice(1);
            const reasoning = generateSetupRoadReasoning(fromVertex, toVertex, villageVertexId, newState);
            logMessages.push({
              message: `<span style="color: #6B7280; font-style: italic; padding-left: 16px; display: block;">${personalityLabel} - Objective: ${reasoning}</span>`,
              playerId,
              timestamp: new Date().toLocaleTimeString()
            });
          }

          // Add longest road connection message if applicable
          if (gameState.phase === 'setup-phase-2' && newLongestRoadLength === 2 && !aiLongestRoadUpdate?.shouldAward) {
            logMessages.push({
              message: `${formattedPlayerName}'s roads are now connected (longest road: 2).`,
              playerId,
              timestamp: new Date().toLocaleTimeString()
            });
          }
        } else {
          logMessages.push({
            message: `${formattedPlayerName} attempted to place a road (edge data invalid).`,
            playerId,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      }

      // Add longest road bonus messages with HTML formatting
      if (aiLongestRoadUpdate) {
        if (aiLongestRoadUpdate.shouldAward) {
          logMessages.push({
            message: `${formattedPlayerName} claimed the Longest Road and earned ${aiLongestRoadUpdate.bonus} bonus points`,
            playerId,
            timestamp: new Date().toLocaleTimeString()
          });
        }
        if (aiLongestRoadUpdate.previousHolder && aiLongestRoadUpdate.previousHolderName) {
          const previousPlayer = newState.players.find(p => p.id === aiLongestRoadUpdate.previousHolder);
          const previousPlayerColor = getPlayerColorStyle(previousPlayer?.color || '');
          const formattedPreviousPlayerName = `<span style="color: ${previousPlayerColor}; font-weight: bold;">${aiLongestRoadUpdate.previousHolderName}</span>`;
          logMessages.push({
            message: `${formattedPreviousPlayerName} lost the Longest Road and ${aiLongestRoadUpdate.bonus} bonus points`,
            playerId: aiLongestRoadUpdate.previousHolder,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      }

      // Generate trading port messages if AI placed a village
      const tradingPortMessages: Array<{message: string, playerId: string, timestamp: string}> = [];
      if (villagePlaced && villageVertexId !== null) {
        const portMsgs = checkAndLogTradingPortAccess(playerId, villageVertexId, newState);
        console.log('DEBUG [AI Trading Port]: Generated messages inside setState', {
          messagesCount: portMsgs.length,
          messages: portMsgs
        });
        portMsgs.forEach(msg => {
          tradingPortMessages.push({
            message: msg.message,
            playerId: msg.playerId,
            timestamp: new Date().toLocaleTimeString()
          });
        });
      }

      // Add turn transition message with HTML formatting
      const turnTransitionMessages: Array<{message: string, playerId: string, timestamp: string}> = [];
      if (mutableState.turnState.currentPlayerId !== initialPlayerId) {
        const nextPlayer = newState.players.find(p => p.id === mutableState.turnState.currentPlayerId);
        if (nextPlayer) {
          const nextPlayerColor = getPlayerColorStyle(nextPlayer.color);
          const formattedNextPlayerName = `<span style="color: ${nextPlayerColor}; font-weight: bold;">${nextPlayer.name}</span>`;
          turnTransitionMessages.push({
            message: `${formattedNextPlayerName} begins their turn.`,
            playerId: nextPlayer.id,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      }

      // Combine all messages and add to gameLog in one atomic operation
      const allMessages = [...logMessages, ...tradingPortMessages, ...turnTransitionMessages];
      console.log('DEBUG [AI Trading Port]: Adding all messages to gameLog', {
        totalMessages: allMessages.length,
        tradingPortCount: tradingPortMessages.length,
        allMessagesContent: allMessages
      });

      return {
        ...newState,
        gameLog: [...prev.gameLog, ...allMessages]
      };
    });

    // All log messages are now added inside the setGameState callback above
    // This ensures atomic updates and prevents message loss due to multiple renders
  }, [gameState, collectResourcesFromAdjacentCenters, areRoadsConnected, addToLog, addColoredLog, boardGraph, checkLongestRoadBonus, checkAndLogTradingPortAccess, getPlayerColorStyle, generateSetupVillageReasoning, generateSetupRoadReasoning]);
  
  const getCurrentStep = useCallback(() => {
    if (!gameState) return undefined;
    return gameSteps.find(step => step.id === gameState.currentStep);
  }, [gameSteps, gameState]);

  const getCurrentPlayer = useCallback(() => {
    if (!gameState) return undefined;
    return gameState.players.find(player => player.id === gameState.currentPlayer);
  }, [gameState]);

  // Helper function to get adjacent vertices
  const getAdjacentVertices = useCallback((vertexId: number): number[] => {
    // Use the board graph for the current board size
    const boardData = loadBoardForSize(boardSize);
    const vertexIdStr = `V${vertexId.toString().padStart(3, '0')}`;
    const neighbors = boardData.graph.neighbors?.[vertexIdStr] || [];
    // Convert back to numbers
    return neighbors.map(vId => parseInt(vId.substring(1)));
  }, [boardSize]);

  // Helper function to get valid vertices for village placement
  const getValidVerticesForVillage = useCallback(() => {
    const occupiedVertices = new Set(gameState.villages.map(v => v.vertexId));
    const validVertices: number[] = [];
    
    // Check all vertices for the current board size
    for (let vertexId = 1; vertexId <= gameState.totalVertices; vertexId++) {
      if (occupiedVertices.has(vertexId)) continue;
      
      // Check if any adjacent vertex has a village
      const adjacentVertices = getAdjacentVertices(vertexId);
      const hasAdjacentVillage = adjacentVertices.some(adjVertex => occupiedVertices.has(adjVertex));
      
      if (!hasAdjacentVillage) {
        validVertices.push(vertexId);
      }
    }
    
    return validVertices;
  }, [gameState.villages, gameState.totalVertices, getAdjacentVertices]);

  // Helper function to get legal roads for a village
  const getLegalRoadsForVillage = useCallback((villageVertex: number) => {
    const adjacentVertices = getAdjacentVertices(villageVertex);
    const existingRoads = new Set(gameState.roads.map(road => `${Math.min(road.from, road.to)}-${Math.max(road.from, road.to)}`));
    
    return adjacentVertices.filter(adjVertex => {
      const roadKey = `${Math.min(villageVertex, adjVertex)}-${Math.max(villageVertex, adjVertex)}`;
      return !existingRoads.has(roadKey);
    });
  }, [getAdjacentVertices, gameState.roads]);
  
  const placeVillageAtVertex = useCallback((vertexId: number) => {
    const currentPlayer = getCurrentPlayer();
    if (!currentPlayer) return false;

    // Validate vertex is within board range
    if (vertexId < 1 || vertexId > gameState.totalVertices) {
      addToLog(`Invalid vertex ${vertexId} - must be between 1 and ${gameState.totalVertices}!`);
      return false;
    }

    // Check if vertex is valid (not occupied and no adjacent villages)
    const isOccupied = gameState.villages.some(v => v.vertexId === vertexId);
    if (isOccupied) {
      addToLog(`Vertex ${vertexId} is already occupied!`);
      return false;
    }

    // Check for adjacent villages
    const adjacentVertices = getAdjacentVertices(vertexId);
    const hasAdjacentVillage = adjacentVertices.some(adjVertex => 
      gameState.villages.some(v => v.vertexId === adjVertex)
    );
    
    if (hasAdjacentVillage) {
      addToLog(`Cannot place village at vertex ${vertexId} - too close to existing village!`);
      return false;
    }

    // Check if player has already placed a village this turn
    const playerVillagesThisTurn = gameState.villages.filter(v => 
      v.playerId === currentPlayer.id && 
      gameState.phase === 'setup-phase-1'
    ).length;
    
    if (playerVillagesThisTurn >= 1) {
      addToLog(`${currentPlayer.name} has already placed a village this turn!`);
      return false;
    }

    // Create new village
    const newVillage: Village = {
      id: `village-${Date.now()}`,
      playerId: currentPlayer.id,
      vertexId,
      type: 'settlement'
    };

    // Variable to capture trading port messages
    let tradingPortMessages: Array<{message: string, playerId: string}> = [];

    // Update game state
    setGameState(prev => {
      const newState = {
        ...prev,
        villages: [...prev.villages, newVillage],
        players: prev.players.map(p =>
          p.id === currentPlayer.id
            ? { ...p, villageCount: p.villageCount + 1, score: p.score + 1, hasPlacedVillage: true }
            : p
        ),
        lastPlacedVillage: vertexId,
        currentStep: 'place-road',
        adjacentVertices: getAdjacentVertices(vertexId)
      };

      // Check for trading port access with the updated state and capture messages
      tradingPortMessages = checkAndLogTradingPortAccess(currentPlayer.id, vertexId, newState);

      return newState;
    });

    addToLog(`${currentPlayer.name} placed a Village and earned 1 point.`);

    // Add trading port messages after state update completes
    tradingPortMessages.forEach(msg => {
      addColoredLog(msg.message, msg.playerId);
    });

    return true;
  }, [gameState, getCurrentPlayer, addToLog, addColoredLog, getAdjacentVertices, checkAndLogTradingPortAccess]);

  const placeRoadToVertex = useCallback((toVertexId: number) => {
    const currentPlayer = getCurrentPlayer();
    if (!currentPlayer || !gameState.lastPlacedVillage) return false;

    // Validate vertex is within board range
    if (toVertexId < 1 || toVertexId > gameState.totalVertices) {
      addToLog(`Invalid vertex ${toVertexId} - must be between 1 and ${gameState.totalVertices}!`);
      return false;
    }

    // Validate that the target vertex is adjacent to the last placed village using board data
    const adjacentVertices = getAdjacentVertices(gameState.lastPlacedVillage);
    if (!adjacentVertices.includes(toVertexId)) {
      addToLog(`Cannot place road to vertex ${toVertexId} - not adjacent to village at vertex ${gameState.lastPlacedVillage}!`);
      addToLog(`Valid adjacent vertices: ${adjacentVertices.join(', ')}`);
      return false;
    }

    // Check if road already exists between these vertices
    const roadExists = gameState.roads.some(road => 
      (road.from === gameState.lastPlacedVillage && road.to === toVertexId) ||
      (road.to === gameState.lastPlacedVillage && road.from === toVertexId)
    );
    
    if (roadExists) {
      addToLog(`Road already exists between vertices ${gameState.lastPlacedVillage} and ${toVertexId}!`);
      return false;
    }

    // Create new road
    const newRoad: Road = {
      id: `road-${Date.now()}`,
      playerId: currentPlayer.id,
      from: gameState.lastPlacedVillage,
      to: toVertexId
    };

    // Update game state
    setGameState(prev => ({
      ...prev,
      roads: [...prev.roads, newRoad],
      players: prev.players.map(p => 
        p.id === currentPlayer.id 
          ? { ...p, roadCount: p.roadCount + 1, hasPlacedRoad: true }
          : p
      ),
      lastPlacedVillage: null,
      adjacentVertices: [],
      currentStep: 'end-turn'
    }));

    addToLog(`${currentPlayer.name} placed a Road from vertex ${gameState.lastPlacedVillage} to vertex ${toVertexId}.`);
    
    // Auto-execute end turn
    setTimeout(() => {
      nextPlayer();
    }, 500);

    return true;
  }, [gameState, getCurrentPlayer, addToLog, getAdjacentVertices]);

  const nextPlayer = useCallback(() => {
    const currentIndex = gameState.players.findIndex(p => p.id === gameState.currentPlayer);
    const nextIndex = (currentIndex + 1) % gameState.players.length;
    
    const nextPlayerId = gameState.players[nextIndex].id;
    const isNewRound = nextIndex === 0;
    const newTurn = isNewRound ? gameState.turn + 1 : gameState.turn;
    
    // Determine next phase and step based on turn
    let nextPhase = gameState.phase;
    let nextStep = gameState.currentStep;
    
    if (isNewRound) {
      if (gameState.turn === 1) {
        // After all players finish T1, move to Setup Phase 2
        nextPhase = 'setup-phase-2';
        nextStep = 'place-village';
        addToLog(`=== SETUP PHASE 2 BEGINS ===`);
      } else if (gameState.turn === 2) {
        // After all players finish T2, move to Main Gameplay
        nextPhase = 'playing';
        nextStep = 'main-phase';
        addToLog(`=== MAIN GAMEPLAY BEGINS ===`);
      }
    } else {
      // Same phase, reset to village placement
      nextStep = 'place-village';
    }

    setGameState(prev => ({
      ...prev,
      currentPlayer: nextPlayerId,
      turn: newTurn,
      phase: nextPhase,
      currentStep: nextStep,
      players: prev.players.map(p => ({
        ...p,
        isActive: p.id === nextPlayerId,
        currentTurn: p.id === nextPlayerId ? newTurn : p.currentTurn,
        // Reset placement flags for new turn
        hasPlacedVillage: isNewRound ? false : p.hasPlacedVillage,
        hasPlacedRoad: isNewRound ? false : p.hasPlacedRoad
      }))
    }));

    addToLog(`${gameState.players[nextIndex].name} begins Turn ${newTurn} (${nextPhase})`);
    
    return nextPlayerId;
  }, [gameState.players, gameState.currentPlayer, gameState.turn, gameState.phase, gameState.currentStep, addToLog]);

  // Track previous config to detect new game
  const prevConfigRef = React.useRef<GameConfig | undefined>(undefined);
  const prevInitializedRef = React.useRef<boolean>(false);

  // Reset initialized flag when starting a new game
  useEffect(() => {
    const prevConfig = prevConfigRef.current;
    const prevInitialized = prevInitializedRef.current;

    prevConfigRef.current = config;
    prevInitializedRef.current = initialized;

    if (config && initialized) {
      const wasUndefined = !prevConfig;
      const configChanged = prevConfig && (
        prevConfig.playerName !== config.playerName ||
        prevConfig.boardSize !== config.boardSize ||
        prevConfig.playerOrder.length !== config.playerOrder.length
      );

      if ((wasUndefined && prevInitialized) || configChanged) {
        console.log("Resetting game for new session", { wasUndefined, configChanged });
        setInitialized(false);
        setGameState(DEFAULT_GAME_STATE);
      }
    }
  }, [config, initialized]);

  // Initialize game state when config is available
  useEffect(() => {
    if (config && !initialized) {
      console.log("Initializing game with config:", config);
      
      // Ensure board size is valid
      if (!config.boardSize) {
        console.error('Board size is missing from config');
        return;
      }
      
      try {
        // Initialize validators with board size
        initializeValidators(config.boardSize);
      } catch (error) {
        console.error('Failed to initialize validators:', error);
        return;
      }
      
      console.log('=== PLAYER INITIALIZATION DEBUG ===');
      console.log('Config Player Order:', config.playerOrder);
      console.log('Config Player Color:', config.playerColor);
      console.log('Config AI Colors:', config.aiColors);
      
      // Get total vertices for the selected board size
      const totalVertices = Object.keys(boardGraph.vertices).length;
      
      // Initialize board graph
      const occupancyMaps = initializeBoardGraph();
      
      // Log initial village candidates
      const candidates = Object.keys(boardGraph.vertices).filter(v => canPlaceVillage(v, occupancyMaps.verticesOccupiedBy));
      console.log('Phase-1 initial village candidates:', candidates.length);
      
      // Initialize players based on config
      const players: Player[] = [];
      
      // Add human player
      // Helper to get initial resources based on testing mode
      const getInitialResources = () => {
        if (config.gameSettings.testingMode) {
          return { clay: 4, lumber: 4, grain: 4, fabric: 4, mineral: 4, total: 20 };
        }
        return { clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0, total: 0 };
      };

      const humanOrderIndex = config.playerOrder.findIndex(order => order === 1);
      console.log('Human player order index:', humanOrderIndex, 'from playerOrder:', config.playerOrder);
      console.log('Human player will be assigned color:', config.playerColor);
      players.push({
        id: 'human',
        name: config.playerName,
        isHuman: true,
        color: config.playerColor,
        isActive: false, // Will be set when game starts
        resources: getInitialResources(),
        developmentCards: 0,
        developmentCardsInHand: [],
        armyCount: 0,
        secretPoints: 0,
        score: 0,
        hasLongestRoad: false,
        hasLargestArmy: false,
        order: humanOrderIndex + 1,
        difficulty: undefined,
        currentTurn: 0,
        villageCount: 0,
        cityCount: 0,
        roadCount: 0,
        hasPlacedVillage: false,
        hasPlacedRoad: false,
        guardsPlayedThisTurn: 0
      });
      
      // Add AI players
      for (let i = 0; i < aiPlayerCount; i++) {
        const aiOrderIndex = config.playerOrder.findIndex(order => order === i + 2);
        console.log(`AI player ${i + 1} order index:`, aiOrderIndex, 'from playerOrder:', config.playerOrder);
        console.log(`AI player ${i + 1} will be assigned color:`, config.aiColors[i]);
        players.push({
          id: `ai-${i + 1}`,
          name: config.aiCharacters[i].name,
          isHuman: false,
          color: config.aiColors[i],
          isActive: false,
          resources: getInitialResources(),
          developmentCards: 0,
          developmentCardsInHand: [],
          armyCount: 0,
          secretPoints: 0,
          score: 0,
          hasLongestRoad: false,
          hasLargestArmy: false,
          character: config.aiCharacters[i],
          order: aiOrderIndex + 1,
          difficulty: config.aiDifficulty,
          currentTurn: 0,
          villageCount: 0,
          cityCount: 0,
          roadCount: 0,
          hasPlacedVillage: false,
          hasPlacedRoad: false,
          guardsPlayedThisTurn: 0
        });
      }
      
      // Sort players by turn order
      players.sort((a, b) => a.order - b.order);
      console.log('Final player order:', players.map(p => ({ name: p.name, order: p.order })));
      
      // Find first player
      const firstPlayer = players[0];

      // Initialize and shuffle development card deck
      const initialDeck = createInitialDeck(config.gameSettings.developmentCardDeck);
      const shuffledDeck = shuffleDeck(initialDeck);

      // Load board centers directly for trading port generation
      const boardData = loadBoardForSize(config.boardSize);
      const loadedBoardCenters = boardData.centers;
      console.log('DEBUG: Loaded board centers directly for initialization:', loadedBoardCenters.length);

      // Initialize robber position to desert centre
      const initialRobberPosition = findDesertCentre(loadedBoardCenters as CentreData[]);
      if (initialRobberPosition !== null) {
        console.log('DEBUG: Initializing robber position to desert centre:', initialRobberPosition);
      } else {
        console.warn('WARNING: No desert centre found for robber initialization');
      }

      // Generate trading ports synchronously during initialization
      let initialTradingPorts: any[] = [];
      if (config.gameSettings.tradingPortsEnabled && loadedBoardCenters.length > 0) {
        console.log('DEBUG: Generating trading ports during game initialization');
        console.log(`DEBUG: loadedBoardCenters.length = ${loadedBoardCenters.length}`);
        console.log(`DEBUG: numberOfTradingPorts = ${config.gameSettings.numberOfTradingPorts}`);

        const vertices = Object.values(boardGraph.vertices).map(v => ({
          id: v.id,
          row: '',
          position: 0,
          x: 0,
          y: 0
        }));

        const edges = Object.values(boardGraph.edges).map(e => ({
          from: e.v1,
          to: e.v2
        }));

        initialTradingPorts = generateTradingPorts(
          vertices,
          edges,
          config.gameSettings.numberOfTradingPorts,
          loadedBoardCenters
        );

        console.log('DEBUG: Successfully generated trading ports:', initialTradingPorts);
        console.log(`DEBUG: Total ports created: ${initialTradingPorts.length}`);

        // Validate that all port vertices exist in the board graph
        const invalidPorts = initialTradingPorts.filter(port => {
          return port.vertices.some((vertexId: number) => !boardGraph.vertices[vertexId]);
        });

        if (invalidPorts.length > 0) {
          console.error('WARNING: Some trading ports have invalid vertices:', invalidPorts);
        }
      } else if (!config.gameSettings.tradingPortsEnabled) {
        console.log('DEBUG: Trading ports disabled, setting to empty array');
      } else {
        console.log('DEBUG: Board centers not loaded, ports will be empty');
      }

      // Format first player name with HTML for the game log
      const firstPlayerColor = getPlayerColorStyle(firstPlayer.color);
      const formattedFirstPlayerName = `<span style="color: ${firstPlayerColor}; font-weight: bold;">${firstPlayer.name}</span>`;

      setGameState({
        currentPlayer: firstPlayer.id,
        currentStep: 'place-village',
        turn: 1,
        phase: 'setup-phase-1',
        players,
        gameLog: [
          { message: `Game initialized with ${players.length} players`, timestamp: new Date().toLocaleTimeString() },
          { message: `Setup Phase 1 begins`, timestamp: new Date().toLocaleTimeString() },
          { message: `${formattedFirstPlayerName} goes first`, timestamp: new Date().toLocaleTimeString() }
        ],
        robberPosition: initialRobberPosition !== null ? initialRobberPosition : undefined,
        gameSettings: { ...config.gameSettings, boardSize: config.boardSize },
        stepHistory: [],
        villages: [],
        roads: [],
        longestRoadLengths: new Map(),
        adjacentVertices: [], // Will be populated when needed
        lastPlacedVillage: null,
        totalVertices,
        boardSize: config.boardSize,
        turnState: {
          currentPlayerId: firstPlayer.id,
          step: 'init_place_village',
          placementContext: { lastVillageVertex: null },
          lock: false
        },
        boardGraph: {
          edges: {},
          vertices: {},
          edgesByVertex: {}
        },
        ...occupancyMaps,
        developmentCardDeck: shuffledDeck,
        developmentCardDiscard: [],
        tradingPorts: initialTradingPorts
      });
      
      // Start the first player's turn
      setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          players: prev.players.map(p => ({
            ...p,
            isActive: p.id === firstPlayer.id,
            currentTurn: p.id === firstPlayer.id ? 1 : 0
          }))
        }));
        const playerColor = getPlayerColorStyle(firstPlayer.color);
        const turnMessage = `<span style="color: ${playerColor}; font-weight: bold;">${firstPlayer.name}</span> begins Turn 1`;
        addToLog(turnMessage);
        beginTurn(firstPlayer.id);
      }, 500);
      
      setInitialized(true);
    }
  }, [config, initialized, boardSize, initializeBoardGraph, boardGraph.vertices, addToLog, beginTurn]);

  // Auto-execute AI turns
  useEffect(() => {
    if (!gameState || (gameState.phase !== 'setup-phase-1' && gameState.phase !== 'setup-phase-2') || !initialized || gameState.turnState.lock) return;
    
    const currentPlayer = getCurrentPlayer();
    if (!currentPlayer || currentPlayer.isHuman) return;
    if (gameState.turnState.currentPlayerId !== currentPlayer.id) return;
    
    console.log(`DEBUG: AI turn trigger for ${currentPlayer.name}, phase: ${gameState.phase}, step: ${gameState.turnState.step}`);
      
    // AI takes turn automatically
    const aiDelay = 1000 + Math.random() * 500; // Random delay for realism
    
    const timeoutId = setTimeout(() => {
      console.log(`AI ${currentPlayer.name} taking turn in ${gameState.phase}, step ${gameState.turnState.step}`);
      try {
        withTurnLock(() => {
          aiTakeTurn_P1_wrapper(currentPlayer.id);
        });
      } catch (error) {
        console.error('AI turn error:', error);
      }
    }, aiDelay);
    
    return () => clearTimeout(timeoutId);
  }, [gameState, initialized, getCurrentPlayer, aiTakeTurn_P1_wrapper, withTurnLock]);

  // Check for phase progression
  useEffect(() => {
    if (gameState?.phase === 'setup-phase-1' && gameState.players.length > 0) {
      // Check if all players have completed Setup Phase 1 (placed village and road)
      const allPlayersCompletedPhase1 = gameState.players.every(player => 
        player.villageCount >= 1 && player.roadCount >= 1
      );
      
      if (allPlayersCompletedPhase1) {
        addToLog('=== Setup Phase 1 Complete ===');
        
        // Reset to first player for Phase 2
        const firstPlayer = gameState.players.find(p => p.order === 1);
        if (!firstPlayer) {
          console.error('No first player found for Phase 2');
          return;
        }
        
        setGameState(prev => ({
          ...prev,
          phase: 'setup-phase-2',
          currentStep: 'place-village',
          currentPlayer: firstPlayer.id,
          turnState: {
            currentPlayerId: firstPlayer.id,
            step: 'init_place_village',
            placementContext: { lastVillageVertex: null },
            lock: false
          },
          players: prev.players.map(p => ({
            ...p,
            isActive: p.id === firstPlayer.id,
            currentTurn: p.id === firstPlayer.id ? 2 : p.currentTurn
          }))
        }));
        addToLog('=== Setup Phase 2 Begins ===');
        const playerColor = getPlayerColorStyle(firstPlayer.color);
        const turnMessage = `<span style="color: ${playerColor}; font-weight: bold;">${firstPlayer.name}</span> begins Turn 2`;
        addToLog(turnMessage);
      }
    } else if (gameState?.phase === 'setup-phase-2' && gameState.players.length > 0) {
      // Check if all players have completed Setup Phase 2 (placed 2 villages and 2 roads each)
      const allPlayersCompletedPhase2 = gameState.players.every(player =>
        player.villageCount >= 2 && player.roadCount >= 2
      );

      if (allPlayersCompletedPhase2) {
        addToLog('=== Setup Phase 2 Complete ===');

        // Get first player for main gameplay
        const firstPlayer = gameState.players.find(p => p.order === 1);

        console.log('DEBUG: Transitioning to Main Gameplay Phase');
        console.log('DEBUG: Player turns before transition:', gameState.players.map(p => ({ name: p.name, currentTurn: p.currentTurn })));

        setGameState(prev => ({
          ...prev,
          phase: 'playing',
          currentStep: 'main-phase',
          currentPlayer: firstPlayer?.id || prev.currentPlayer,
          turnState: {
            currentPlayerId: firstPlayer?.id || prev.currentPlayer,
            step: 'awaiting_dice_roll',
            placementContext: {
              lastVillageVertex: null,
              buildingType: null
            },
            lock: false
          },
          players: prev.players.map(p => ({
            ...p,
            isActive: p.id === firstPlayer?.id,
            // First player should start at Turn 3 (completed T1 and T2), others keep their current turn (T2)
            currentTurn: p.id === firstPlayer?.id ? 3 : p.currentTurn
          }))
        }));

        console.log('DEBUG: Player turns after transition:',
          gameState.players.map(p => ({ name: p.name, willBe: p.id === firstPlayer?.id ? 3 : p.currentTurn })));

        addToLog('=== Main Gameplay Begins ===');
        if (firstPlayer) {
          const playerColor = getPlayerColorStyle(firstPlayer.color);
          const turnMessage = `<span style="color: ${playerColor}; font-weight: bold;">${firstPlayer.name}</span> begins Turn 3`;
          setTimeout(() => addToLog(turnMessage), 100);
        }
      }
    }
  }, [gameState?.players, gameState?.phase, addToLog, getPlayerColorStyle]);

  // Gameplay building actions
  const handleShowBuyMenu = useCallback(() => {
    console.log('DEBUG: handleShowBuyMenu called');
    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: 'buy_item'
      }
    }));
  }, []);

  const handleBuyDevelopmentCard = useCallback((playerId: string) => {
    console.log('DEBUG: handleBuyDevelopmentCard called for player:', playerId);

    const player = gameState.players.find(p => p.id === playerId);
    if (!player) {
      console.log('DEBUG: Player not found');
      return false;
    }

    if (player.resources.grain < 1 || player.resources.fabric < 1 || player.resources.mineral < 1) {
      if (player.isHuman) {
        addToLog('Not enough resources to buy a development card!');
      }
      return false;
    }

    if (gameState.developmentCardDeck.length === 0) {
      if (player.isHuman) {
        addToLog('No development cards left in the deck!');
      }
      return false;
    }

    const [drawnCard, ...remainingDeck] = gameState.developmentCardDeck;
    const currentTurn = player.currentTurn;
    const cardWithOwner = { ...drawnCard, ownerId: playerId, location: 'hand' as const, turnDrawn: currentTurn };

    setGameState(prev => ({
      ...prev,
      developmentCardDeck: remainingDeck,
      players: prev.players.map(p => {
        if (p.id === playerId) {
          let updatedScore = p.score;
          let updatedSecretPoints = p.secretPoints;
          const isExtraPoint = drawnCard.name === 'Extra Point';

          if (isExtraPoint) {
            updatedScore += 1;
            updatedSecretPoints += 1;
          }

          return {
            ...p,
            resources: {
              ...p.resources,
              grain: p.resources.grain - 1,
              fabric: p.resources.fabric - 1,
              mineral: p.resources.mineral - 1,
              total: p.resources.total - 3
            },
            developmentCards: p.developmentCards + 1,
            developmentCardsInHand: [...p.developmentCardsInHand, cardWithOwner],
            score: updatedScore,
            secretPoints: updatedSecretPoints
          };
        }
        return p;
      }),
      turnState: {
        ...prev.turnState,
        step: 'main',
        placementContext: {
          lastVillageVertex: null,
          buildingType: null
        }
      }
    }));

    const playerColor = getPlayerColorStyle(player.color);
    const purchaseMessage = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> purchased a Development Card`;
    addToLog(purchaseMessage);

    if (drawnCard.name === 'Extra Point' && player.isHuman) {
      const pointMessage = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> gained 1 point from Extra Point card`;
      setTimeout(() => addToLog(pointMessage), 500);
    }

    // If human player, set the drawn card for modal display
    if (player.isHuman) {
      setDrawnCardForModal(drawnCard);
    }

    return true;
  }, [gameState, addToLog, getPlayerColorStyle]);

  const handleBuyItem = useCallback((itemType: 'road' | 'village' | 'estate' | 'developmentCard') => {
    console.log('DEBUG: handleBuyItem called with:', itemType);

    if (itemType === 'developmentCard') {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer) {
        handleBuyDevelopmentCard(currentPlayer.id);
      }
      return;
    }

    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: itemType === 'road' ? 'place_road_gameplay' : itemType === 'village' ? 'place_village_gameplay' : 'place_estate_gameplay',
        placementContext: {
          ...prev.turnState.placementContext,
          buildingType: itemType
        }
      }
    }));
  }, [gameState.players, gameState.currentPlayer, handleBuyDevelopmentCard]);

  const handleCancelBuyItem = useCallback(() => {
    console.log('DEBUG: handleCancelBuyItem called');
    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: 'main',
        placementContext: {
          lastVillageVertex: null,
          buildingType: null
        }
      }
    }));
  }, []);

  const handleSkipPlayDevCards = useCallback(() => {
    console.log('DEBUG: handleSkipPlayDevCards called');
    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: 'main'
      }
    }));
  }, []);

  const handlePlayDevCard = useCallback((card: DevelopmentCard) => {
    console.log('DEBUG: handlePlayDevCard called for card:', card.name);

    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
    if (!currentPlayer) {
      console.log('DEBUG: No current player found');
      return;
    }

    // Validate card can be played using comprehensive validation
    const validationError = validateDevCardPlay(card, currentPlayer);
    if (validationError) {
      console.log('DEBUG: Card validation failed:', validationError);
      setCardValidationError(validationError);
      return;
    }

    // Handle Expert Negotiator
    if (card.name === 'Expert Negotiator') {
      const playerColor = getPlayerColorStyle(currentPlayer.color);
      const playMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> played Expert Negotiator - 2:1 trading available this turn!`;
      addToLog(playMessage);

      if (!currentPlayer.isHuman && aiDevCardDecision) {
        addAIDecisionContext(currentPlayer.id, aiDevCardDecision.personality, aiDevCardDecision.reasoning);
        setAiDevCardDecision(null);
      }

      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p => {
          if (p.id === currentPlayer.id) {
            return {
              ...p,
              developmentCardsInHand: p.developmentCardsInHand.filter(c => c.id !== card.id),
              developmentCards: p.developmentCards - 1
            };
          }
          return p;
        }),
        developmentCardDiscard: [...prev.developmentCardDiscard, { ...card, location: 'discard' as CardLocation }],
        turnState: {
          ...prev.turnState,
          expertNegotiatorActive: true
        }
      }));

      setPlayedCardForModal({
        card,
        playerName: currentPlayer.name,
        playerNumber: currentPlayer.order,
        playerColor: currentPlayer.color
      });
      return;
    }

    // For Guard card, handle immediately with card removal
    if (card.name === 'Guard') {
      const playerColor = getPlayerColorStyle(currentPlayer.color);
      const playMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> played ${card.name}`;
      addToLog(playMessage);

      if (!currentPlayer.isHuman && aiDevCardDecision) {
        addAIDecisionContext(currentPlayer.id, aiDevCardDecision.personality, aiDevCardDecision.reasoning);
        setAiDevCardDecision(null);
      }

      handlePlayGuardCard(currentPlayer, card.id);
      return;
    }

    // For interactive cards (require user selection), don't remove card yet
    // Card will be removed in the confirmation handlers
    const interactiveCards = ['Road Construction', 'Booming Economy', 'Closed Market', 'Resource Swap', 'Free Upgrade'];
    const isInteractive = interactiveCards.includes(card.name);

    const playerColor = getPlayerColorStyle(currentPlayer.color);
    const playMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> played ${card.name}`;
    addToLog(playMessage);

    if (!currentPlayer.isHuman && aiDevCardDecision) {
      addAIDecisionContext(currentPlayer.id, aiDevCardDecision.personality, aiDevCardDecision.reasoning);
      setAiDevCardDecision(null);
    }

    if (isInteractive) {
      // For interactive cards, set BOTH pendingCardId AND step in a single atomic state update
      // This prevents race conditions where useEffect fires before pendingCardId is set
      setGameState(prev => {
        let newStep: TurnStep = 'play_dev_cards';
        const newPlacementContext: any = {
          ...prev.turnState.placementContext,
          pendingCardId: card.id
        };

        // Determine the step and any initial context based on card type
        switch (card.name) {
          case 'Road Construction':
            newStep = 'place_road_gameplay';
            newPlacementContext.freeRoadsRemaining = 2;
            break;
          case 'Booming Economy':
            newStep = 'booming_economy_selection';
            newPlacementContext.resourcesSelected = [];
            break;
          case 'Closed Market':
            newStep = 'closed_market_selection';
            break;
          case 'Resource Swap':
            newStep = 'resource_swap_selection';
            break;
          case 'Free Upgrade':
            newStep = 'free_upgrade_selection';
            break;
        }

        return {
          ...prev,
          turnState: {
            ...prev.turnState,
            step: newStep,
            placementContext: newPlacementContext
          }
        };
      });

      // Add the selection message to the log
      const selectionMessages: { [key: string]: string } = {
        'Road Construction': 'can now place 2 free roads',
        'Booming Economy': 'is selecting 2 free resources',
        'Closed Market': 'is selecting a resource type to take from all players',
        'Resource Swap': 'is selecting a player to swap resources with',
        'Free Upgrade': 'is selecting a Village to upgrade'
      };

      const selectionMessage = selectionMessages[card.name];
      if (selectionMessage) {
        setTimeout(() => addToLog(`<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> ${selectionMessage}`), 100);
      }
    } else {
      // Non-interactive cards: remove immediately
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p => {
          if (p.id === currentPlayer.id) {
            return {
              ...p,
              developmentCardsInHand: p.developmentCardsInHand.filter(c => c.id !== card.id),
              developmentCards: p.developmentCards - 1
            };
          }
          return p;
        }),
        developmentCardDiscard: [...prev.developmentCardDiscard, { ...card, location: 'discard' as const }]
      }));
    }
  }, [gameState, addToLog, getPlayerColorStyle]);

  const handlePlayGuardCard = useCallback((player: Player, cardId?: string) => {
    console.log('DEBUG: Playing Guard card for player:', player.name);

    // Increment army count
    const newArmyCount = player.armyCount + 1;
    const largestArmySize = gameState.gameSettings.largestArmySize;
    const largestArmyBonus = gameState.gameSettings.largestArmyBonus;

    // Find current largest army holder
    const currentLargestArmyHolder = gameState.players.find(p => p.hasLargestArmy);

    let updatedPlayers = gameState.players.map(p => {
      if (p.id === player.id) {
        // If cardId is provided, also remove the card from hand
        const updatedPlayer = {
          ...p,
          armyCount: newArmyCount,
          guardsPlayedThisTurn: p.guardsPlayedThisTurn + 1
        };
        if (cardId) {
          updatedPlayer.developmentCardsInHand = p.developmentCardsInHand.filter(c => c.id !== cardId);
          updatedPlayer.developmentCards = p.developmentCards - 1;
        }
        return updatedPlayer;
      }
      return p;
    });

    // Track log messages to add after state update
    let previousHolderName = '';
    let achievementGained = false;

    // Check if this player now has largest army
    if (gameState.gameSettings.largestArmyEnabled && newArmyCount >= largestArmySize) {
      console.log('DEBUG: Checking Largest Army - player:', player.name, 'newArmyCount:', newArmyCount, 'largestArmySize:', largestArmySize);
      console.log('DEBUG: Current holder:', currentLargestArmyHolder?.name, 'armyCount:', currentLargestArmyHolder?.armyCount);

      let shouldTakeLargestArmy = false;

      if (!currentLargestArmyHolder) {
        // No one has it yet, and this player meets the minimum requirement
        console.log('DEBUG: No current holder, awarding to', player.name);
        shouldTakeLargestArmy = true;
      } else if (currentLargestArmyHolder.id !== player.id && newArmyCount > currentLargestArmyHolder.armyCount) {
        // Someone else has it, and this player now exceeds their count
        console.log('DEBUG: Player', player.name, 'exceeds current holder', currentLargestArmyHolder.name);
        shouldTakeLargestArmy = true;
        previousHolderName = currentLargestArmyHolder.name;
      } else {
        console.log('DEBUG: Largest Army not changing');
      }

      if (shouldTakeLargestArmy) {
        achievementGained = true;
        // Transfer largest army bonus
        updatedPlayers = updatedPlayers.map(p => {
          if (p.id === player.id) {
            return { ...p, hasLargestArmy: true, score: p.score + largestArmyBonus };
          } else if (p.hasLargestArmy) {
            return { ...p, hasLargestArmy: false, score: p.score - largestArmyBonus };
          }
          return p;
        });
      }
    }

    setGameState(prev => ({
      ...prev,
      players: updatedPlayers,
      turnState: {
        ...prev.turnState,
        step: 'move_robber'
      }
    }));

    // Add log messages after state update
    const playerColor = getPlayerColorStyle(player.color);
    const armyMessage = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> added 1 to Army count (now ${newArmyCount})`;
    addToLog(armyMessage);

    if (achievementGained) {
      if (previousHolderName) {
        addColoredLog(`${player.name} took the Largest Army (${newArmyCount}) from ${previousHolderName} and earned ${largestArmyBonus} bonus points!`, player.id);
      } else {
        addColoredLog(`${player.name} achieved the Largest Army (${newArmyCount}) and earned ${largestArmyBonus} bonus points!`, player.id);
      }
    }
  }, [gameState, addToLog, addColoredLog, getPlayerColorStyle]);

  const handlePlayRoadConstructionCard = useCallback((player: Player) => {
    console.log('DEBUG: Playing Road Construction card for player:', player.name);

    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: 'place_road_gameplay',
        placementContext: {
          ...prev.turnState.placementContext,
          buildingType: 'road',
          freeRoadsRemaining: 2
        }
      }
    }));

    const playerColor = getPlayerColorStyle(player.color);
    const message = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> can now place 2 free roads`;
    setTimeout(() => addToLog(message), 100);
  }, [addToLog, getPlayerColorStyle]);

  const handlePlayBoomingEconomyCard = useCallback((player: Player) => {
    console.log('DEBUG: Playing Booming Economy card for player:', player.name);

    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: 'booming_economy_selection',
        placementContext: {
          ...prev.turnState.placementContext,
          resourcesSelected: []
        }
      }
    }));

    const playerColor = getPlayerColorStyle(player.color);
    const message = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> is selecting 2 free resources`;
    setTimeout(() => addToLog(message), 100);
  }, [addToLog, getPlayerColorStyle]);

  const handlePlayClosedMarketCard = useCallback((player: Player) => {
    console.log('DEBUG: Playing Closed Market card for player:', player.name);

    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: 'closed_market_selection'
      }
    }));

    const playerColor = getPlayerColorStyle(player.color);
    const message = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> is selecting a resource type to take from all players`;
    setTimeout(() => addToLog(message), 100);
  }, [addToLog, getPlayerColorStyle]);

  const handlePlayResourceSwapCard = useCallback((player: Player) => {
    console.log('DEBUG: Playing Resource Swap card for player:', player.name);

    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: 'resource_swap_selection'
      }
    }));

    const playerColor = getPlayerColorStyle(player.color);
    const message = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> is selecting a player to swap resources with`;
    setTimeout(() => addToLog(message), 100);
  }, [addToLog, getPlayerColorStyle]);

  const handlePlayFreeUpgradeCard = useCallback((player: Player) => {
    console.log('DEBUG: Playing Free Upgrade card for player:', player.name);

    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: 'free_upgrade_selection'
      }
    }));

    const playerColor = getPlayerColorStyle(player.color);
    const message = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> is selecting a Village to upgrade`;
    setTimeout(() => addToLog(message), 100);
  }, [addToLog, getPlayerColorStyle]);

  const handleBoomingEconomyResourceSelection = useCallback((resourceType: 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral') => {
    console.log('DEBUG: Booming Economy resource selected:', resourceType);

    setGameState(prev => {
      const resourcesSelected = (prev.turnState.placementContext.resourcesSelected || []) as string[];
      const newResourcesSelected = [...resourcesSelected, resourceType];

      return {
        ...prev,
        turnState: {
          ...prev.turnState,
          placementContext: {
            ...prev.turnState.placementContext,
            resourcesSelected: newResourcesSelected
          }
        }
      };
    });
  }, []);

  const handleConfirmBoomingEconomy = useCallback(() => {
    console.log(`🎁 handleConfirmBoomingEconomy called`);

    setGameState(prev => {
      const resourcesSelected = (prev.turnState.placementContext.resourcesSelected || []) as string[];
      const pendingCardId = prev.turnState.placementContext.pendingCardId;

      console.log(`DEBUG: Confirming Booming Economy with ${resourcesSelected.length} resources selected:`, resourcesSelected);

      if (resourcesSelected.length !== 2) {
        console.warn(`WARNING: Cannot confirm Booming Economy - expected 2 resources, got ${resourcesSelected.length}`);
        return prev;
      }

      const currentPlayer = prev.players.find(p => p.id === prev.currentPlayer);
      if (!currentPlayer) {
        console.warn(`   WARNING: Could not find current player`);
        return prev;
      }

      const updatedPlayers = prev.players.map(p => {
        if (p.id === prev.currentPlayer) {
          const newResources = { ...p.resources };
          resourcesSelected.forEach(res => {
            const before = newResources[res as keyof typeof newResources];
            newResources[res as keyof typeof newResources]++;
            newResources.total++;
            const after = newResources[res as keyof typeof newResources];
            console.log(`   Adding ${res}: ${before} → ${after}`);
          });

          console.log(`   ✓ Resources granted. Total resources: ${newResources.total}`);

          // Remove the card now that it's successfully played
          if (pendingCardId) {
            return {
              ...p,
              resources: newResources,
              developmentCardsInHand: p.developmentCardsInHand.filter(c => c.id !== pendingCardId),
              developmentCards: p.developmentCards - 1
            };
          }

          return { ...p, resources: newResources };
        }
        return p;
      });

      // Find the card to move to discard
      const cardToDiscard = currentPlayer.developmentCardsInHand.find(c => c.id === pendingCardId);

      // Log inside the state update to ensure fresh data
      const capitalizedResources = resourcesSelected.map(r => r.charAt(0).toUpperCase() + r.slice(1));
      const resourceText = capitalizedResources.length === 2 && capitalizedResources[0] === capitalizedResources[1]
        ? `2 ${capitalizedResources[0]}`
        : capitalizedResources.join(' and ');
      const playerColor = getPlayerColorStyle(currentPlayer.color);
      const logMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> gained ${resourceText} from Booming Economy`;

      console.log(`   📋 Prepared log message for ${currentPlayer.name}: gained ${resourcesSelected.join(', ')}`);
      setTimeout(() => {
        console.log(`   📝 Adding to Events log: ${logMessage}`);
        addToLog(logMessage);
      }, 100);

      return {
        ...prev,
        players: updatedPlayers,
        developmentCardDiscard: cardToDiscard
          ? [...prev.developmentCardDiscard, { ...cardToDiscard, location: 'discard' as const }]
          : prev.developmentCardDiscard,
        turnState: {
          ...prev.turnState,
          step: 'play_dev_cards',
          placementContext: {
            ...prev.turnState.placementContext,
            resourcesSelected: [],
            pendingCardId: undefined
          }
        }
      };
    });
  }, [addToLog, getPlayerColorStyle]);

  const handleClosedMarketResourceSelection = useCallback((resourceType: 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral') => {
    console.log('DEBUG: Closed Market resource type selected:', resourceType);

    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        placementContext: {
          ...prev.turnState.placementContext,
          selectedResource: resourceType
        }
      }
    }));
  }, []);

  const handleConfirmClosedMarket = useCallback(() => {
    console.log('🔍 CLOSED MARKET CONFIRM: Handler called');
    let logData: { mainMessage: string; transfers: { message: string }[] } | null = null;

    setGameState(prev => {
      console.log('🔍 CLOSED MARKET CONFIRM: Inside setGameState callback');
      const currentPlayer = prev.players.find(p => p.id === prev.currentPlayer);
      if (!currentPlayer) {
        console.log('🔍 CLOSED MARKET CONFIRM: No current player found, returning prev');
        return prev;
      }

      const resourceType = prev.turnState.placementContext.selectedResource as 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral';
      const pendingCardId = prev.turnState.placementContext.pendingCardId;
      console.log('🔍 CLOSED MARKET CONFIRM: resourceType =', resourceType, ', pendingCardId =', pendingCardId);

      if (!resourceType) {
        console.log('🔍 CLOSED MARKET CONFIRM: No resource type selected, returning prev');
        return prev;
      }

      let totalTransferred = 0;
      const transfers: { from: string; fromColor: string; amount: number }[] = [];

      const updatedPlayers = prev.players.map(p => {
        if (p.id === currentPlayer.id) {
          return p;
        }

        const amountToTransfer = p.resources[resourceType];
        if (amountToTransfer > 0) {
          totalTransferred += amountToTransfer;
          transfers.push({
            from: p.name,
            fromColor: getPlayerColorStyle(p.color),
            amount: amountToTransfer
          });

          return {
            ...p,
            resources: {
              ...p.resources,
              [resourceType]: 0,
              total: p.resources.total - amountToTransfer
            }
          };
        }
        return p;
      });

      const finalPlayers = updatedPlayers.map(p => {
        if (p.id === currentPlayer.id) {
          // Remove the card now that it's successfully played
          if (pendingCardId) {
            return {
              ...p,
              resources: {
                ...p.resources,
                [resourceType]: p.resources[resourceType] + totalTransferred,
                total: p.resources.total + totalTransferred
              },
              developmentCardsInHand: p.developmentCardsInHand.filter(c => c.id !== pendingCardId),
              developmentCards: p.developmentCards - 1
            };
          }
          return {
            ...p,
            resources: {
              ...p.resources,
              [resourceType]: p.resources[resourceType] + totalTransferred,
              total: p.resources.total + totalTransferred
            }
          };
        }
        return p;
      });

      // Find the card to move to discard
      const cardToDiscard = currentPlayer.developmentCardsInHand.find(c => c.id === pendingCardId);

      // Capture log data to be used after state update
      const playerColor = getPlayerColorStyle(currentPlayer.color);
      const mainLogMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> took ${totalTransferred} ${resourceType} from other players`;

      logData = {
        mainMessage: mainLogMessage,
        transfers: transfers.map(transfer => ({
          message: `<span style="color: ${transfer.fromColor}; font-weight: bold;">${transfer.from}</span> gave up ${transfer.amount} ${resourceType}`
        }))
      };
      console.log('🔍 CLOSED MARKET CONFIRM: logData set with', transfers.length, 'transfers, total =', totalTransferred);

      return {
        ...prev,
        players: finalPlayers,
        developmentCardDiscard: cardToDiscard
          ? [...prev.developmentCardDiscard, { ...cardToDiscard, location: 'discard' as const }]
          : prev.developmentCardDiscard,
        turnState: {
          ...prev.turnState,
          step: 'play_dev_cards',
          placementContext: {
            ...prev.turnState.placementContext,
            selectedResource: undefined,
            pendingCardId: undefined
          }
        }
      };
    });

    // Log AFTER state update completes
    if (logData) {
      console.log('🔍 CLOSED MARKET CONFIRM: Scheduling log messages, main =', logData.mainMessage.substring(0, 50));
      setTimeout(() => {
        console.log('🔍 CLOSED MARKET CONFIRM: Executing main log message');
        addToLog(logData.mainMessage);
      }, 100);
      logData.transfers.forEach((transfer, index) => {
        setTimeout(() => {
          console.log('🔍 CLOSED MARKET CONFIRM: Executing transfer log', index);
          addToLog(transfer.message);
        }, 200 + (index * 50));
      });
    } else {
      console.log('🔍 CLOSED MARKET CONFIRM: No logData to schedule');
    }
  }, [addToLog, getPlayerColorStyle]);

  const handleResourceSwapPlayerSelection = useCallback((targetPlayerId: string) => {
    console.log('DEBUG: Resource Swap target player selected:', targetPlayerId);

    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        placementContext: {
          ...prev.turnState.placementContext,
          selectedPlayerId: targetPlayerId
        }
      }
    }));
  }, []);

  const handleConfirmResourceSwap = useCallback(() => {
    console.log('🔍 RESOURCE SWAP CONFIRM: Handler called');
    let logMessage: string | null = null;

    setGameState(prev => {
      console.log('🔍 RESOURCE SWAP CONFIRM: Inside setGameState callback');
      const currentPlayer = prev.players.find(p => p.id === prev.currentPlayer);
      const targetPlayerId = prev.turnState.placementContext.selectedPlayerId;
      const targetPlayer = prev.players.find(p => p.id === targetPlayerId);
      const pendingCardId = prev.turnState.placementContext.pendingCardId;
      console.log('🔍 RESOURCE SWAP CONFIRM: targetPlayerId =', targetPlayerId, ', pendingCardId =', pendingCardId);

      if (!currentPlayer || !targetPlayer) {
        console.log('🔍 RESOURCE SWAP CONFIRM: Missing player, returning prev');
        return prev;
      }

      const tempResources = { ...currentPlayer.resources };

      const updatedPlayers = prev.players.map(p => {
        if (p.id === currentPlayer.id) {
          // Remove the card now that it's successfully played
          if (pendingCardId) {
            return {
              ...p,
              resources: { ...targetPlayer.resources },
              developmentCardsInHand: p.developmentCardsInHand.filter(c => c.id !== pendingCardId),
              developmentCards: p.developmentCards - 1
            };
          }
          return { ...p, resources: { ...targetPlayer.resources } };
        } else if (p.id === targetPlayer.id) {
          return { ...p, resources: tempResources };
        }
        return p;
      });

      // Find the card to move to discard
      const cardToDiscard = currentPlayer.developmentCardsInHand.find(c => c.id === pendingCardId);

      // Capture log data to be used after state update
      const currentPlayerColor = getPlayerColorStyle(currentPlayer.color);
      const targetPlayerColor = getPlayerColorStyle(targetPlayer.color);
      logMessage = `<span style="color: ${currentPlayerColor}; font-weight: bold;">${currentPlayer.name}</span> swapped all resources with <span style="color: ${targetPlayerColor}; font-weight: bold;">${targetPlayer.name}</span>`;
      console.log('🔍 RESOURCE SWAP CONFIRM: logMessage set =', logMessage.substring(0, 50));

      return {
        ...prev,
        players: updatedPlayers,
        developmentCardDiscard: cardToDiscard
          ? [...prev.developmentCardDiscard, { ...cardToDiscard, location: 'discard' as const }]
          : prev.developmentCardDiscard,
        turnState: {
          ...prev.turnState,
          step: 'play_dev_cards',
          placementContext: {
            ...prev.turnState.placementContext,
            selectedPlayerId: undefined,
            pendingCardId: undefined
          }
        }
      };
    });

    // Log AFTER state update completes
    if (logMessage) {
      console.log('🔍 RESOURCE SWAP CONFIRM: Scheduling log message');
      setTimeout(() => {
        console.log('🔍 RESOURCE SWAP CONFIRM: Executing log message');
        addToLog(logMessage);
      }, 100);
    } else {
      console.log('🔍 RESOURCE SWAP CONFIRM: No logMessage to schedule');
    }
  }, [addToLog, getPlayerColorStyle]);

  const handleCancelCardEffect = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: 'play_dev_cards',
        placementContext: {
          ...prev.turnState.placementContext,
          resourcesSelected: [],
          selectedResource: undefined,
          selectedPlayerId: undefined,
          pendingCardId: undefined,
          freeRoadsRemaining: undefined,
          buildingType: null
        }
      }
    }));
  }, []);

  const handleFreeUpgradeVillageSelection = useCallback((vertexId: number) => {
    console.log('🔥 handleFreeUpgradeVillageSelection CALLED with vertexId:', vertexId);

    let logMessage: string | null = null;

    setGameState(prev => {
      const currentPlayer = prev.players.find(p => p.id === prev.currentPlayer);
      const pendingCardId = prev.turnState.placementContext.pendingCardId;
      if (!currentPlayer) {
        console.log('🔥 FREE UPGRADE: No current player found!');
        return prev;
      }

      const village = prev.villages.find(v => v.vertexId === vertexId && v.playerId === currentPlayer.id && v.type === 'settlement');
      if (!village) {
        console.log('🔥 FREE UPGRADE: Invalid village selection');
        addToLog('Invalid village selection');
        return prev;
      }

      console.log(`🔥 FREE UPGRADE: Upgrading village ${village.id} for ${currentPlayer.name}`);

      const updatedVillages = prev.villages.map(v => {
        if (v.id === village.id) {
          return { ...v, type: 'city' as const };
        }
        return v;
      });

      const updatedPlayers = prev.players.map(p => {
        if (p.id === currentPlayer.id) {
          // Remove the card now that it's successfully played
          if (pendingCardId) {
            return {
              ...p,
              score: p.score + 1,
              villageCount: p.villageCount - 1,
              cityCount: p.cityCount + 1,
              developmentCardsInHand: p.developmentCardsInHand.filter(c => c.id !== pendingCardId),
              developmentCards: p.developmentCards - 1
            };
          }
          return {
            ...p,
            score: p.score + 1,
            villageCount: p.villageCount - 1,
            cityCount: p.cityCount + 1
          };
        }
        return p;
      });

      // Find the card to move to discard
      const cardToDiscard = currentPlayer.developmentCardsInHand.find(c => c.id === pendingCardId);

      // Capture log data to be used after state update
      const playerColor = getPlayerColorStyle(currentPlayer.color);
      logMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> upgraded a Village to an Estate for free and earned 1 point`;

      console.log(`🔥 FREE UPGRADE: Prepared log message for ${currentPlayer.name}`);

      return {
        ...prev,
        players: updatedPlayers,
        villages: updatedVillages,
        developmentCardDiscard: cardToDiscard
          ? [...prev.developmentCardDiscard, { ...cardToDiscard, location: 'discard' as const }]
          : prev.developmentCardDiscard,
        turnState: {
          ...prev.turnState,
          step: 'play_dev_cards',
          placementContext: {
            ...prev.turnState.placementContext,
            pendingCardId: undefined
          }
        }
      };
    });

    // Log AFTER state update completes
    if (logMessage) {
      console.log(`🔥 FREE UPGRADE: addToLog executing now - ${logMessage.substring(0, 50)}...`);
      setTimeout(() => addToLog(logMessage), 100);
    }
  }, [addToLog, getPlayerColorStyle]);

  // Auto-handle play_dev_cards phase for AI players
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'play_dev_cards' &&
        !playedCardForModal) {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer &&
          !currentPlayer.isHuman &&
          currentPlayer.id === gameState.turnState.currentPlayerId) {
        console.log(`DEBUG: AI player ${currentPlayer.name} in play_dev_cards phase`);

        const timer = setTimeout(() => {
          const cardToPlay = aiDecidePlayDevCard(currentPlayer);

          if (cardToPlay) {
            console.log(`DEBUG: AI player ${currentPlayer.name} decided to play ${cardToPlay.name}`);

            // Mark that AI played a dev card this phase
            aiPlayedDevCardThisPhaseRef.current = true;

            setPlayedCardForModal({
              card: cardToPlay,
              playerName: currentPlayer.name,
              playerNumber: currentPlayer.order,
              playerColor: currentPlayer.color
            });

            handlePlayDevCard(cardToPlay);
          } else {
            console.log(`DEBUG: AI player ${currentPlayer.name} skipping dev card play phase`);
            setGameState(prev => ({
              ...prev,
              turnState: {
                ...prev.turnState,
                step: 'main'
              }
            }));
          }
        }, 800);

        return () => clearTimeout(timer);
      }
    }
  }, [gameState.phase, gameState.currentPlayer, gameState.players, gameState.turnState.step, gameState.turnState.currentPlayerId, gameState.villages, aiDecidePlayDevCard, handlePlayDevCard, playedCardForModal]);

  // After AI plays dev card and modal closes, advance to main phase
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'play_dev_cards' &&
        !playedCardForModal &&
        aiPlayedDevCardThisPhaseRef.current) {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer && !currentPlayer.isHuman) {
        console.log(`DEBUG: AI dev card modal closed, advancing to main phase`);
        aiPlayedDevCardThisPhaseRef.current = false;

        setGameState(prev => ({
          ...prev,
          turnState: {
            ...prev.turnState,
            step: 'main'
          }
        }));
      }
    }
  }, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, gameState.players, playedCardForModal]);

  // Auto-handle Booming Economy selection for AI players
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'booming_economy_selection' &&
        (!gameState.turnState.placementContext.resourcesSelected || gameState.turnState.placementContext.resourcesSelected.length === 0)) {  // Guard to prevent re-triggering
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer && !currentPlayer.isHuman) {
        // Prevent duplicate execution if already processing
        if (aiCardEffectProcessingRef.current) {
          return;
        }

        aiCardEffectProcessingRef.current = true;
        console.log(`\n🔥 BOOMING ECONOMY: Setting up 600ms timeout for ${currentPlayer.name}`);
        console.log(`💰 ${currentPlayer.name} is selecting 2 free resources from Booming Economy...`);

        // Clear any existing timeouts from previous runs
        boomingEconomyTimeoutsRef.current.forEach(t => clearTimeout(t));
        boomingEconomyTimeoutsRef.current = [];

        const timer1 = setTimeout(() => {
          console.log(`🔥 BOOMING ECONOMY TIMEOUT EXECUTING for ${currentPlayer.name}`);
          // Use strategic selection based on AI difficulty
          const difficulty = currentPlayer.difficulty || 'normal';
          const selection = selectBoomingEconomyResources(currentPlayer, gameState, difficulty);

          const [resource1, resource2] = selection.resources;
          console.log(`   ✓ ${currentPlayer.name} selected ${resource1} and ${resource2}`);
          console.log(`   📋 Reasoning: ${selection.reasoning}`);

          // Log AI decision context in testing mode
          if (gameState.gameSettings.testingMode) {
            const personality = currentPlayer.character?.name ? getPersonalityForCharacter(currentPlayer.character.name) : 'balanced';
            addAIDecisionContext(currentPlayer.id, personality, selection.reasoning);
          }

          // Add both resources at once to avoid race condition
          handleBoomingEconomyResourceSelection(resource1 as 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral');

          // Small delay to ensure first selection is processed
          const timer2 = setTimeout(() => {
            handleBoomingEconomyResourceSelection(resource2 as 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral');

            // Confirm after both selections
            const timer3 = setTimeout(() => {
              console.log(`   🎁 Confirming selection...`);
              handleConfirmBoomingEconomy();
              // Clear the processing flag when complete
              aiCardEffectProcessingRef.current = false;
              console.log(`🔥 BOOMING ECONOMY TIMEOUT COMPLETE for ${currentPlayer.name}`);
              // Clear from tracking array
              boomingEconomyTimeoutsRef.current = [];
            }, 300);
            boomingEconomyTimeoutsRef.current.push(timer3);
          }, 200);
          boomingEconomyTimeoutsRef.current.push(timer2);
        }, 600);
        boomingEconomyTimeoutsRef.current.push(timer1);

        return () => {
          console.log(`🔥 BOOMING ECONOMY CLEANUP: Cancelling all timeouts for ${currentPlayer.name}`);
          boomingEconomyTimeoutsRef.current.forEach(t => clearTimeout(t));
          boomingEconomyTimeoutsRef.current = [];
          aiCardEffectProcessingRef.current = false;
        };
      }
    }
  }, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, handleBoomingEconomyResourceSelection, handleConfirmBoomingEconomy]);

  // Auto-handle Closed Market selection for AI players
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'closed_market_selection' &&
        !gameState.turnState.placementContext.selectedResource) {  // Guard to prevent re-triggering
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer && !currentPlayer.isHuman) {
        // Prevent duplicate execution if already processing
        if (aiCardEffectProcessingRef.current) {
          return;
        }

        aiCardEffectProcessingRef.current = true;
        console.log(`\n🚫 ${currentPlayer.name} is selecting a resource to close from trading...`);

        // Clear any existing timeouts from previous runs
        closedMarketTimeoutsRef.current.forEach(t => clearTimeout(t));
        closedMarketTimeoutsRef.current = [];

        const timer1 = setTimeout(() => {
          // Use strategic selection based on AI difficulty
          const difficulty = currentPlayer.difficulty || 'normal';
          const selection = selectClosedMarketResource(currentPlayer, gameState, difficulty);

          console.log(`   ✓ ${currentPlayer.name} selected ${selection.resource} to close from trading`);

          // Log AI decision context in testing mode
          if (gameState.gameSettings.testingMode) {
            const personality = currentPlayer.character?.name ? getPersonalityForCharacter(currentPlayer.character.name) : 'balanced';
            addAIDecisionContext(currentPlayer.id, personality, selection.reasoning);
          }

          handleClosedMarketResourceSelection(selection.resource as 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral');

          const timer2 = setTimeout(() => {
            console.log(`   🎯 Confirming Closed Market selection...`);
            handleConfirmClosedMarket();
            // Clear the processing flag when complete
            aiCardEffectProcessingRef.current = false;
            // Clear from tracking array
            closedMarketTimeoutsRef.current = [];
          }, 400);
          closedMarketTimeoutsRef.current.push(timer2);
        }, 800);
        closedMarketTimeoutsRef.current.push(timer1);

        return () => {
          console.log(`🚫 CLOSED MARKET CLEANUP: Cancelling all timeouts`);
          closedMarketTimeoutsRef.current.forEach(t => clearTimeout(t));
          closedMarketTimeoutsRef.current = [];
          aiCardEffectProcessingRef.current = false;
        };
      }
    }
  }, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, handleClosedMarketResourceSelection, handleConfirmClosedMarket]);

  // Auto-handle Resource Swap selection for AI players
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'resource_swap_selection' &&
        !gameState.turnState.placementContext.selectedPlayerId) {  // Guard to prevent re-triggering
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer && !currentPlayer.isHuman) {
        // Prevent duplicate execution if already processing
        if (aiCardEffectProcessingRef.current) {
          return;
        }

        aiCardEffectProcessingRef.current = true;
        console.log(`\n🔄 ${currentPlayer.name} is selecting a player to swap all resources with...`);

        // Clear any existing timeouts from previous runs
        resourceSwapTimeoutsRef.current.forEach(t => clearTimeout(t));
        resourceSwapTimeoutsRef.current = [];

        const timer1 = setTimeout(() => {
          const otherPlayers = gameState.players.filter(p => p.id !== currentPlayer.id);
          if (otherPlayers.length > 0) {
            // Use strategic selection based on AI difficulty
            const difficulty = currentPlayer.difficulty || 'normal';
            const selection = selectResourceSwapTarget(currentPlayer, gameState, difficulty);

            if (selection.targetPlayerId) {
              const targetPlayer = gameState.players.find(p => p.id === selection.targetPlayerId);
              console.log(`   ✓ ${currentPlayer.name} selected ${targetPlayer?.name}`);
              console.log(`   📋 Reasoning: ${selection.reasoning}`);

              handleResourceSwapPlayerSelection(selection.targetPlayerId);

              const timer2 = setTimeout(() => {
                console.log(`   🔄 Confirming Resource Swap...`);
                handleConfirmResourceSwap();
                // Clear the processing flag when complete
                aiCardEffectProcessingRef.current = false;
                // Clear from tracking array
                resourceSwapTimeoutsRef.current = [];
              }, 400);
              resourceSwapTimeoutsRef.current.push(timer2);
            } else {
              // Edge case: No valid target found
              console.log(`DEBUG: AI player ${currentPlayer.name} found no valid target for Resource Swap, canceling card`);
              addToLog(`${currentPlayer.name} found no valid target for Resource Swap`);
              handleCancelCardEffect();
              aiCardEffectProcessingRef.current = false;
              resourceSwapTimeoutsRef.current = [];
            }
          } else {
            // Edge case: No other players (shouldn't happen in normal game)
            console.log(`DEBUG: AI player ${currentPlayer.name} has no other players to swap with, canceling card`);
            addToLog(`${currentPlayer.name} has no other players to swap with`);
            handleCancelCardEffect();
            aiCardEffectProcessingRef.current = false;
            resourceSwapTimeoutsRef.current = [];
          }
        }, 800);
        resourceSwapTimeoutsRef.current.push(timer1);

        return () => {
          console.log(`🔄 RESOURCE SWAP CLEANUP: Cancelling all timeouts`);
          resourceSwapTimeoutsRef.current.forEach(t => clearTimeout(t));
          resourceSwapTimeoutsRef.current = [];
          aiCardEffectProcessingRef.current = false;
        };
      }
    }
  }, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, handleResourceSwapPlayerSelection, handleConfirmResourceSwap, handleCancelCardEffect, addToLog]);

  // Auto-handle Free Upgrade selection for AI players
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'free_upgrade_selection') {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer && !currentPlayer.isHuman) {
        // Prevent duplicate execution if already processing
        if (aiCardEffectProcessingRef.current) {
          console.log(`🔥 FREE UPGRADE: Already processing, skipping`);
          return;
        }

        aiCardEffectProcessingRef.current = true;
        console.log(`🔥 FREE UPGRADE: Setting up 800ms timeout for ${currentPlayer.name}`);

        // Clear any existing timeouts from previous runs
        freeUpgradeTimeoutsRef.current.forEach(t => clearTimeout(t));
        freeUpgradeTimeoutsRef.current = [];

        const timer1 = setTimeout(() => {
          console.log(`🔥 FREE UPGRADE TIMEOUT EXECUTING for ${currentPlayer.name}`);
          const playerVillages = gameState.villages.filter(v => v.playerId === currentPlayer.id && v.type === 'settlement');
          console.log(`🔥 FREE UPGRADE: Found ${playerVillages.length} villages to upgrade`);
          if (playerVillages.length > 0) {
            const village = playerVillages[Math.floor(Math.random() * playerVillages.length)];
            console.log(`🔥 FREE UPGRADE: Calling handleFreeUpgradeVillageSelection(${village.vertexId})`);
            handleFreeUpgradeVillageSelection(village.vertexId);
          } else {
            // Edge case: AI has no villages to upgrade
            console.log(`DEBUG: AI player ${currentPlayer.name} has no villages to upgrade, canceling Free Upgrade card`);
            addToLog(`${currentPlayer.name} has no villages to upgrade`);
            handleCancelCardEffect();
          }
          // Clear the processing flag when complete
          aiCardEffectProcessingRef.current = false;
          freeUpgradeTimeoutsRef.current = [];
          console.log(`🔥 FREE UPGRADE TIMEOUT COMPLETE for ${currentPlayer.name}`);
        }, 800);
        freeUpgradeTimeoutsRef.current.push(timer1);

        return () => {
          console.log(`🔥 FREE UPGRADE CLEANUP: Cancelling all timeouts for ${currentPlayer.name}`);
          freeUpgradeTimeoutsRef.current.forEach(t => clearTimeout(t));
          freeUpgradeTimeoutsRef.current = [];
          aiCardEffectProcessingRef.current = false;
        };
      }
    }
  }, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, handleFreeUpgradeVillageSelection, handleCancelCardEffect, addToLog, gameState.villages]);

  // Debug: Track step changes
  useEffect(() => {
    console.log(`🔥 STEP CHANGE: phase=${gameState.phase}, step=${gameState.turnState.step}, currentPlayer=${gameState.currentPlayer}`);
  }, [gameState.phase, gameState.turnState.step, gameState.currentPlayer]);

  const handleEndTurn = useCallback(() => {
    console.log('DEBUG: handleEndTurn called');

    // Victory check is now handled in advanceToNextPlayer
    // This simplifies the code and ensures all players (human and AI) are checked
    advanceToNextPlayer(gameState);
  }, [gameState, advanceToNextPlayer]);

  const handlePlaceRoadGameplay = useCallback((playerId: string, fromVertexId: number, toVertexId: number) => {
    console.log('DEBUG: handlePlaceRoadGameplay called with from:', fromVertexId, 'to:', toVertexId);
    const currentPlayer = gameState.players.find(p => p.id === playerId);
    if (!currentPlayer) return;

    const isFreeRoad = (gameState.turnState.placementContext.freeRoadsRemaining ?? 0) > 0;

    if (!isFreeRoad && (currentPlayer.resources.clay < 1 || currentPlayer.resources.lumber < 1)) {
      addToLog('Not enough resources to build a road!');
      return;
    }

    const playerRoads = gameState.roads.filter(r => r.playerId === playerId);
    const playerVillages = gameState.villages.filter(v => v.playerId === playerId);

    const allPlayerVertices = new Set<number>();
    playerRoads.forEach(r => {
      allPlayerVertices.add(r.from);
      allPlayerVertices.add(r.to);
    });
    playerVillages.forEach(v => allPlayerVertices.add(v.vertexId));

    // Validate that fromVertex is owned by the player
    if (!allPlayerVertices.has(fromVertexId)) {
      addToLog('Cannot place road there - starting vertex not owned by player!');
      return;
    }

    // Validate that the vertices are adjacent
    const boardData = loadBoardForSize(boardSize);
    const neighbors = boardData.adjacencyMap[fromVertexId] || [];
    if (!neighbors.includes(toVertexId)) {
      addToLog('Cannot place road there - vertices are not adjacent!');
      return;
    }

    // Validate that the edge is not already occupied
    const edgeId = fromVertexId < toVertexId ? `${fromVertexId}__${toVertexId}` : `${toVertexId}__${fromVertexId}`;
    if (gameState.edgesOccupiedBy[edgeId]) {
      addToLog('Cannot place road there - edge is already occupied!');
      return;
    }

    const fromVertex = fromVertexId;

    const newRoad: Road = {
      id: edgeId,
      playerId,
      from: fromVertex,
      to: toVertexId
    };

    // Calculate longest road achievement info before state update
    const updatedRoads = [...gameState.roads, newRoad];
    const verticesWithOwnership = buildVerticesWithOwnership(boardGraph, gameState.verticesOccupiedBy);
    const longestPath = calculateLongestRoadPath(playerId, updatedRoads, verticesWithOwnership);
    const longestRoadUpdate = checkLongestRoadBonus(playerId, longestPath);

    setGameState(prev => {
      const updatedEdgesOccupiedBy = { ...prev.edgesOccupiedBy, [edgeId]: playerId };
      const updatedRoads = [...prev.roads, newRoad];

      const verticesWithOwnership = buildVerticesWithOwnership(boardGraph, prev.verticesOccupiedBy);
      const longestPath = calculateLongestRoadPath(playerId, updatedRoads, verticesWithOwnership);

      const freeRoadsRemaining = (prev.turnState.placementContext.freeRoadsRemaining ?? 0);
      const newFreeRoadsRemaining = isFreeRoad ? freeRoadsRemaining - 1 : 0;
      const pendingCardId = prev.turnState.placementContext.pendingCardId;
      const isCompletingRoadConstruction = isFreeRoad && newFreeRoadsRemaining === 0 && pendingCardId;

      // Find card to discard if completing Road Construction
      const currentPlayer = prev.players.find(p => p.id === playerId);
      const cardToDiscard = isCompletingRoadConstruction && currentPlayer
        ? currentPlayer.developmentCardsInHand.find(c => c.id === pendingCardId)
        : null;

      return {
        ...prev,
        roads: updatedRoads,
        edgesOccupiedBy: updatedEdgesOccupiedBy,
        longestRoadLengths: new Map([...prev.longestRoadLengths, [playerId, longestPath]]),
        developmentCardDiscard: cardToDiscard
          ? [...prev.developmentCardDiscard, { ...cardToDiscard, location: 'discard' as const }]
          : prev.developmentCardDiscard,
        players: prev.players.map(p => {
          if (p.id === playerId) {
            return {
              ...p,
              resources: isFreeRoad ? p.resources : {
                ...p.resources,
                clay: p.resources.clay - 1,
                lumber: p.resources.lumber - 1,
                total: p.resources.total - 2
              },
              roadCount: p.roadCount + 1,
              score: longestRoadUpdate?.shouldAward ? p.score + longestRoadUpdate.bonus : p.score,
              hasLongestRoad: longestRoadUpdate?.shouldAward ? true : p.hasLongestRoad,
              // Remove card when completing Road Construction
              developmentCardsInHand: isCompletingRoadConstruction
                ? p.developmentCardsInHand.filter(c => c.id !== pendingCardId)
                : p.developmentCardsInHand,
              developmentCards: isCompletingRoadConstruction
                ? p.developmentCards - 1
                : p.developmentCards
            };
          }
          if (longestRoadUpdate?.previousHolder === p.id) {
            return { ...p, hasLongestRoad: false, score: p.score - (longestRoadUpdate.bonus || 0) };
          }
          return p;
        }),
        turnState: {
          ...prev.turnState,
          step: newFreeRoadsRemaining > 0 ? 'place_road_gameplay' : 'main',
          placementContext: {
            lastVillageVertex: null,
            buildingType: newFreeRoadsRemaining > 0 ? 'road' : null,
            freeRoadsRemaining: newFreeRoadsRemaining,
            pendingCardId: isCompletingRoadConstruction ? undefined : prev.turnState.placementContext.pendingCardId
          }
        }
      };
    });

    const playerColor = getPlayerColorStyle(currentPlayer.color);
    const roadMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> built a road from vertex ${fromVertex} to ${toVertexId}`;
    addToLog(roadMessage);

    // Log longest road achievement after state update
    if (longestRoadUpdate?.shouldAward) {
      if (longestRoadUpdate.isFirstAchievement) {
        addColoredLog(`${longestRoadUpdate.playerName} achieved the Longest Road (${longestRoadUpdate.roadLength}) and earned ${longestRoadUpdate.bonus} bonus points!`, playerId);
      } else {
        addColoredLog(`${longestRoadUpdate.playerName} took the Longest Road (${longestRoadUpdate.roadLength}) from ${longestRoadUpdate.previousHolderName} and earned ${longestRoadUpdate.bonus} bonus points!`, playerId);
        if (longestRoadUpdate.previousHolder) {
          addColoredLog(`${longestRoadUpdate.previousHolderName} lost the Longest Road and ${longestRoadUpdate.bonus} bonus points`, longestRoadUpdate.previousHolder);
        }
      }
    }
  }, [gameState, boardGraph, boardSize, addToLog, getPlayerColorStyle, checkLongestRoadBonus, addColoredLog]);

  // Auto-handle Road Construction placement for AI players
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'place_road_gameplay') {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      const freeRoadsRemaining = gameState.turnState.placementContext.freeRoadsRemaining ?? 0;

      if (currentPlayer && !currentPlayer.isHuman && freeRoadsRemaining > 0) {
        const timer = setTimeout(() => {
          const difficulty = currentPlayer.difficulty || 'normal';
          const roadLocation = selectStrategicRoadLocation(currentPlayer.id, gameState, boardSize, difficulty, true);

          if (roadLocation) {
            const { fromVertex, toVertex, reasoning, personality } = roadLocation;

            // Log AI decision context for Road Construction placement in testing mode
            if (gameState.gameSettings.testingMode) {
              const personalityLabel = personality.charAt(0).toUpperCase() + personality.slice(1);
              const playerColor = getPlayerColorStyle(currentPlayer.color);
              const contextMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> <span style="color: #6B7280; font-style: italic;">using free road from Road Construction</span>`;
              addToLog(contextMessage);
              const reasoningMessage = `<span style="color: #6B7280; font-style: italic; padding-left: 16px; display: block;">${personalityLabel} - ${reasoning}</span>`;
              setTimeout(() => addToLog(reasoningMessage), 50);
            }

            handlePlaceRoadGameplay(currentPlayer.id, fromVertex, toVertex);
          } else {
            console.log('DEBUG: AI cannot place road for Road Construction, skipping to main phase');
            setGameState(prev => ({
              ...prev,
              turnState: {
                ...prev.turnState,
                step: 'main',
                placementContext: {
                  ...prev.turnState.placementContext,
                  freeRoadsRemaining: 0
                }
              }
            }));
          }
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, gameState.players, gameState.turnState.placementContext.freeRoadsRemaining, boardSize, handlePlaceRoadGameplay]);

  const handlePlaceVillageGameplay = useCallback((vertexId: number) => {
    console.log('DEBUG: handlePlaceVillageGameplay called');
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
    if (!currentPlayer) return;

    if (currentPlayer.resources.clay < 1 || currentPlayer.resources.lumber < 1 ||
        currentPlayer.resources.grain < 1 || currentPlayer.resources.fabric < 1) {
      addToLog('Not enough resources to build a village!');
      return;
    }

    if (!canPlaceVillage(vertexId, gameState.verticesOccupiedBy || {}, boardSize)) {
      addToLog('Cannot place village there - too close to another settlement!');
      return;
    }

    const playerRoads = gameState.roads.filter(r => r.playerId === currentPlayer.id);
    const isAdjacentToRoad = playerRoads.some(r => r.from === vertexId || r.to === vertexId);

    if (!isAdjacentToRoad) {
      addToLog('Village must be adjacent to one of your roads!');
      return;
    }

    const newVillage: Village = {
      id: `village-${vertexId}-${Date.now()}`,
      playerId: currentPlayer.id,
      vertexId,
      type: 'settlement'
    };

    // Variable to capture trading port messages and disruption info
    let tradingPortMessages: Array<{message: string, playerId: string}> = [];
    let roadDisruptions: RoadDisruption[] = [];
    let updatedRoadLengths: Map<string, number> = new Map();

    setGameState(prev => {
      const updatedVerticesOccupiedBy = { ...prev.verticesOccupiedBy, [vertexId]: currentPlayer.id };
      const boardGraph = loadBoardGraph(boardSize);
      const vertices = buildVerticesWithOwnership(boardGraph, updatedVerticesOccupiedBy);

      roadDisruptions = checkForRoadDisruptions(
        vertexId,
        currentPlayer.id,
        prev,
        vertices,
        prev.longestRoadLengths
      );

      updatedRoadLengths = recalculateAllPlayersRoadLengths(
        { ...prev, verticesOccupiedBy: updatedVerticesOccupiedBy },
        vertices
      );

      let updatedPlayers = prev.players.map(p =>
        p.id === currentPlayer.id
          ? {
              ...p,
              resources: {
                ...p.resources,
                clay: p.resources.clay - 1,
                lumber: p.resources.lumber - 1,
                grain: p.resources.grain - 1,
                fabric: p.resources.fabric - 1,
                total: p.resources.total - 4
              },
              villageCount: p.villageCount + 1,
              score: p.score + 1
            }
          : p
      );

      const currentHolder = updatedPlayers.find(p => p.hasLongestRoad);
      if (currentHolder && roadDisruptions.some(d => d.playerId === currentHolder.id)) {
        const holderNewLength = updatedRoadLengths.get(currentHolder.id) || 0;
        const minLength = prev.gameSettings?.longestRoadSize || 5;

        if (holderNewLength < minLength) {
          updatedPlayers = updatedPlayers.map(p =>
            p.id === currentHolder.id
              ? { ...p, hasLongestRoad: false, score: p.score - (prev.gameSettings?.longestRoadBonus || 2) }
              : p
          );
        } else {
          const otherPlayers = Array.from(updatedRoadLengths.entries())
            .filter(([pid]) => pid !== currentHolder.id);
          const someoneHasLonger = otherPlayers.some(([, length]) => length > holderNewLength);

          if (someoneHasLonger) {
            const [newHolderId, newHolderLength] = otherPlayers.reduce((max, curr) =>
              curr[1] > max[1] ? curr : max
            );

            updatedPlayers = updatedPlayers.map(p => {
              if (p.id === currentHolder.id) {
                return { ...p, hasLongestRoad: false, score: p.score - (prev.gameSettings?.longestRoadBonus || 2) };
              } else if (p.id === newHolderId) {
                return { ...p, hasLongestRoad: true, score: p.score + (prev.gameSettings?.longestRoadBonus || 2) };
              }
              return p;
            });
          }
        }
      }

      const newState = {
        ...prev,
        villages: [...prev.villages, newVillage],
        verticesOccupiedBy: updatedVerticesOccupiedBy,
        players: updatedPlayers,
        longestRoadLengths: updatedRoadLengths,
        turnState: {
          ...prev.turnState,
          step: 'main',
          placementContext: {
            lastVillageVertex: null,
            buildingType: null
          }
        }
      };

      tradingPortMessages = checkAndLogTradingPortAccess(currentPlayer.id, vertexId, newState);

      return newState;
    });

    const playerColor = getPlayerColorStyle(currentPlayer.color);
    const villageMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> built a village at vertex ${vertexId} and earned 1 point`;
    addToLog(villageMessage);

    tradingPortMessages.forEach(msg => {
      addColoredLog(msg.message, msg.playerId);
    });

    roadDisruptions.forEach(disruption => {
      const disruptedPlayer = gameState.players.find(p => p.id === disruption.playerId);
      if (disruptedPlayer) {
        const disruptedPlayerColor = getPlayerColorStyle(disruptedPlayer.color);
        const disruptionMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span>'s village disrupted <span style="color: ${disruptedPlayerColor}; font-weight: bold;">${disruptedPlayer.name}</span>'s road network (${disruption.oldLength} → ${disruption.newLength} segments)`;
        addToLog(disruptionMessage);
      }
    });
  }, [gameState, boardSize, addToLog, getPlayerColorStyle, checkAndLogTradingPortAccess]);

  const handlePlaceEstateGameplay = useCallback((vertexId: number) => {
    console.log('DEBUG: handlePlaceEstateGameplay called');
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
    if (!currentPlayer) return;

    if (currentPlayer.resources.grain < 2 || currentPlayer.resources.mineral < 3) {
      addToLog('Not enough resources to build an estate!');
      return;
    }

    const village = gameState.villages.find(v =>
      v.playerId === currentPlayer.id &&
      v.vertexId === vertexId &&
      v.type === 'settlement'
    );

    if (!village) {
      addToLog('No village at that location to upgrade!');
      return;
    }

    setGameState(prev => ({
      ...prev,
      villages: prev.villages.map(v =>
        v.id === village.id ? { ...v, type: 'city' as 'city' } : v
      ),
      players: prev.players.map(p =>
        p.id === currentPlayer.id
          ? {
              ...p,
              resources: {
                ...p.resources,
                grain: p.resources.grain - 2,
                mineral: p.resources.mineral - 3,
                total: p.resources.total - 5
              },
              villageCount: p.villageCount - 1,
              cityCount: p.cityCount + 1,
              score: p.score + 1
            }
          : p
      ),
      turnState: {
        ...prev.turnState,
        step: 'main',
        placementContext: {
          lastVillageVertex: null,
          buildingType: null
        }
      }
    }));

    const playerColor = getPlayerColorStyle(currentPlayer.color);
    const estateMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> upgraded village at vertex ${vertexId} to an estate and earned 1 point`;
    addToLog(estateMessage);
  }, [gameState, addToLog, getPlayerColorStyle]);

  const handleAIBuildRoad = useCallback((playerId: string) => {
    console.log('DEBUG: AI building road for', playerId);
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return false;

    const difficulty = player.difficulty || 'normal';
    const roadLocation = selectStrategicRoadLocation(playerId, gameState, boardSize, difficulty);
    if (!roadLocation) {
      console.log('DEBUG: No valid road location found');
      return false;
    }

    const { fromVertex, toVertex, edgeId } = roadLocation;
    const newRoad: Road = {
      id: edgeId,
      playerId,
      from: fromVertex,
      to: toVertex
    };

    // Calculate longest road achievement info before state update
    const updatedRoads = [...gameState.roads, newRoad];
    const verticesWithOwnership = buildVerticesWithOwnership(boardGraph, gameState.verticesOccupiedBy);
    const longestPath = calculateLongestRoadPath(playerId, updatedRoads, verticesWithOwnership);
    const longestRoadUpdate = checkLongestRoadBonus(playerId, longestPath);

    setGameState(prev => {
      const updatedEdgesOccupiedBy = { ...prev.edgesOccupiedBy, [edgeId]: playerId };
      const updatedRoads = [...prev.roads, newRoad];

      const verticesWithOwnership = buildVerticesWithOwnership(boardGraph, prev.verticesOccupiedBy);
      const longestPath = calculateLongestRoadPath(playerId, updatedRoads, verticesWithOwnership);

      return {
        ...prev,
        roads: updatedRoads,
        edgesOccupiedBy: updatedEdgesOccupiedBy,
        longestRoadLengths: new Map([...prev.longestRoadLengths, [playerId, longestPath]]),
        players: prev.players.map(p => {
          if (p.id === playerId) {
            return {
              ...p,
              resources: {
                ...p.resources,
                clay: p.resources.clay - 1,
                lumber: p.resources.lumber - 1,
                total: p.resources.total - 2
              },
              roadCount: p.roadCount + 1,
              score: longestRoadUpdate?.shouldAward ? p.score + longestRoadUpdate.bonus : p.score,
              hasLongestRoad: longestRoadUpdate?.shouldAward ? true : p.hasLongestRoad
            };
          }
          if (longestRoadUpdate?.previousHolder === p.id) {
            return { ...p, hasLongestRoad: false, score: p.score - (longestRoadUpdate.bonus || 0) };
          }
          return p;
        })
      };
    });

    const playerColor = getPlayerColorStyle(player.color);
    const roadMessage = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> built a road from vertex ${fromVertex} to ${toVertex}`;
    addToLog(roadMessage);
    addAIDecisionContext(playerId, roadLocation.personality, roadLocation.reasoning);

    // Log longest road achievement after state update
    if (longestRoadUpdate?.shouldAward) {
      if (longestRoadUpdate.isFirstAchievement) {
        addColoredLog(`${longestRoadUpdate.playerName} achieved the Longest Road (${longestRoadUpdate.roadLength}) and earned ${longestRoadUpdate.bonus} bonus points!`, playerId);
      } else {
        addColoredLog(`${longestRoadUpdate.playerName} took the Longest Road (${longestRoadUpdate.roadLength}) from ${longestRoadUpdate.previousHolderName} and earned ${longestRoadUpdate.bonus} bonus points!`, playerId);
        if (longestRoadUpdate.previousHolder) {
          addColoredLog(`${longestRoadUpdate.previousHolderName} lost the Longest Road and ${longestRoadUpdate.bonus} bonus points`, longestRoadUpdate.previousHolder);
        }
      }
    }

    return true;
  }, [gameState, boardSize, boardGraph, checkLongestRoadBonus, getPlayerColorStyle, addToLog, addColoredLog]);

  const handleAIBuildVillage = useCallback((playerId: string) => {
    console.log('DEBUG: AI building village for', playerId);
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return false;

    const difficulty = player.difficulty || 'normal';
    const villageDecision = selectStrategicVillageLocation(playerId, gameState, boardSize, difficulty);
    if (!villageDecision) {
      console.log('DEBUG: No valid village location found');
      return false;
    }

    const vertexId = villageDecision.vertexId;
    const newVillage: Village = {
      id: `village-${vertexId}-${Date.now()}`,
      playerId,
      vertexId,
      type: 'settlement'
    };

    // Variable to capture trading port messages and disruption info
    let tradingPortMessages: Array<{message: string, playerId: string}> = [];
    let roadDisruptions: RoadDisruption[] = [];
    let updatedRoadLengths: Map<string, number> = new Map();

    setGameState(prev => {
      const updatedVerticesOccupiedBy = { ...prev.verticesOccupiedBy, [vertexId]: playerId };
      const boardGraph = loadBoardGraph(boardSize);
      const vertices = buildVerticesWithOwnership(boardGraph, updatedVerticesOccupiedBy);

      roadDisruptions = checkForRoadDisruptions(
        vertexId,
        playerId,
        prev,
        vertices,
        prev.longestRoadLengths
      );

      updatedRoadLengths = recalculateAllPlayersRoadLengths(
        { ...prev, verticesOccupiedBy: updatedVerticesOccupiedBy },
        vertices
      );

      let updatedPlayers = prev.players.map(p =>
        p.id === playerId
          ? {
              ...p,
              resources: {
                ...p.resources,
                clay: p.resources.clay - 1,
                lumber: p.resources.lumber - 1,
                grain: p.resources.grain - 1,
                fabric: p.resources.fabric - 1,
                total: p.resources.total - 4
              },
              villageCount: p.villageCount + 1,
              score: p.score + 1
            }
          : p
      );

      const currentHolder = updatedPlayers.find(p => p.hasLongestRoad);
      if (currentHolder && roadDisruptions.some(d => d.playerId === currentHolder.id)) {
        const holderNewLength = updatedRoadLengths.get(currentHolder.id) || 0;
        const minLength = prev.gameSettings?.longestRoadSize || 5;

        if (holderNewLength < minLength) {
          updatedPlayers = updatedPlayers.map(p =>
            p.id === currentHolder.id
              ? { ...p, hasLongestRoad: false, score: p.score - (prev.gameSettings?.longestRoadBonus || 2) }
              : p
          );
        } else {
          const otherPlayers = Array.from(updatedRoadLengths.entries())
            .filter(([pid]) => pid !== currentHolder.id);
          const someoneHasLonger = otherPlayers.some(([, length]) => length > holderNewLength);

          if (someoneHasLonger) {
            const [newHolderId, newHolderLength] = otherPlayers.reduce((max, curr) =>
              curr[1] > max[1] ? curr : max
            );

            updatedPlayers = updatedPlayers.map(p => {
              if (p.id === currentHolder.id) {
                return { ...p, hasLongestRoad: false, score: p.score - (prev.gameSettings?.longestRoadBonus || 2) };
              } else if (p.id === newHolderId) {
                return { ...p, hasLongestRoad: true, score: p.score + (prev.gameSettings?.longestRoadBonus || 2) };
              }
              return p;
            });
          }
        }
      }

      const newState = {
        ...prev,
        villages: [...prev.villages, newVillage],
        verticesOccupiedBy: updatedVerticesOccupiedBy,
        players: updatedPlayers,
        longestRoadLengths: updatedRoadLengths
      };

      tradingPortMessages = checkAndLogTradingPortAccess(playerId, vertexId, newState);

      return newState;
    });

    const playerColor = getPlayerColorStyle(player.color);
    const villageMessage = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> built a village at vertex ${vertexId} and earned 1 point`;
    addToLog(villageMessage);
    addAIDecisionContext(playerId, villageDecision.personality, villageDecision.reasoning);

    tradingPortMessages.forEach(msg => {
      addColoredLog(msg.message, msg.playerId);
    });

    roadDisruptions.forEach(disruption => {
      const disruptedPlayer = gameState.players.find(p => p.id === disruption.playerId);
      if (disruptedPlayer) {
        const disruptedPlayerColor = getPlayerColorStyle(disruptedPlayer.color);
        const disruptionMessage = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span>'s village disrupted <span style="color: ${disruptedPlayerColor}; font-weight: bold;">${disruptedPlayer.name}</span>'s road network (${disruption.oldLength} → ${disruption.newLength} segments)`;
        addToLog(disruptionMessage);
      }
    });

    return true;
  }, [gameState, boardSize, getPlayerColorStyle, addToLog, addColoredLog, checkAndLogTradingPortAccess]);

  const handleAIBuildEstate = useCallback((playerId: string) => {
    console.log('DEBUG: AI building estate for', playerId);
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return false;

    const difficulty = player.difficulty || 'normal';
    const estateDecision = selectStrategicEstateLocation(playerId, gameState, difficulty);
    if (!estateDecision) {
      console.log('DEBUG: No valid estate location found');
      return false;
    }

    const vertexId = estateDecision.vertexId;
    const village = gameState.villages.find(v =>
      v.playerId === playerId &&
      v.vertexId === vertexId &&
      v.type === 'settlement'
    );

    if (!village) return false;

    setGameState(prev => ({
      ...prev,
      villages: prev.villages.map(v =>
        v.id === village.id ? { ...v, type: 'city' as 'city' } : v
      ),
      players: prev.players.map(p =>
        p.id === playerId
          ? {
              ...p,
              resources: {
                ...p.resources,
                grain: p.resources.grain - 2,
                mineral: p.resources.mineral - 3,
                total: p.resources.total - 5
              },
              villageCount: p.villageCount - 1,
              cityCount: p.cityCount + 1,
              score: p.score + 1
            }
          : p
      )
    }));

    const playerColor = getPlayerColorStyle(player.color);
    const estateMessage = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> upgraded village at vertex ${vertexId} to an estate and earned 1 point`;
    addToLog(estateMessage);
    addAIDecisionContext(playerId, estateDecision.personality, estateDecision.reasoning);

    return true;
  }, [gameState, getPlayerColorStyle, addToLog, addAIDecisionContext]);

  // AI Trading handlers
  const handleAIBankTrade = useCallback((playerId: string): boolean => {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return false;

    // Use the new trading strategy with history tracking
    const tradeEval = evaluateTradeOpportunity(player, gameState, turnTradeHistory);

    if (!tradeEval.shouldTrade || tradeEval.tradeType !== 'bank') {
      return false;
    }

    if (!tradeEval.offering || !tradeEval.offeringAmount || !tradeEval.requesting) {
      return false;
    }

    // Calculate the requested amount based on trade rate
    const tradeRate = getBestTradeRateForResource(playerId, tradeEval.offering, gameState);
    const requestedAmount = tradeEval.requestingAmount || (tradeEval.offeringAmount / tradeRate.rate);

    const validation = canExecuteBankTrade(
      playerId,
      tradeEval.offering,
      tradeEval.offeringAmount,
      tradeEval.requesting,
      requestedAmount,
      gameState
    );

    if (!validation.valid) {
      return false;
    }

    const playerColor = getPlayerColorStyle(player.color);
    const rateDisplay = getTradeRateDisplay(tradeRate);

    const message = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> traded ${tradeEval.offeringAmount} ${tradeEval.offering} for ${requestedAmount} ${tradeEval.requesting} with the bank (${rateDisplay})`;
    addToLog(message);

    if (tradeEval.reasoning && !player.isHuman) {
      const personality = player.character?.name ? getPersonalityForCharacter(player.character.name) : 'balanced';
      addAIDecisionContext(playerId, personality, tradeEval.reasoning);
    }

    // Update trade history
    setTurnTradeHistory(prev => {
      const newHistory = { ...prev };

      // Record the trade
      newHistory.tradesExecuted.push({
        offering: tradeEval.offering!,
        offeringAmount: tradeEval.offeringAmount!,
        requesting: tradeEval.requesting!,
        requestingAmount: requestedAmount
      });

      // Track resources gained/lost
      newHistory.resourcesLost[tradeEval.offering!] = (newHistory.resourcesLost[tradeEval.offering!] || 0) + tradeEval.offeringAmount!;
      newHistory.resourcesGained[tradeEval.requesting!] = (newHistory.resourcesGained[tradeEval.requesting!] || 0) + requestedAmount;

      // Lock in the target goal from first trade
      if (!newHistory.targetGoal && tradeEval.reasoning) {
        // Extract the goal from the trade evaluation (this would have been determined in evaluateTradeOpportunity)
        // For now, just track that we have a locked goal
        newHistory.targetGoal = {
          targetBuilding: 'village', // This would be extracted from reasoning or passed differently
          neededResources: {},
          priority: 0
        };
      }

      return newHistory;
    });

    setGameState(prev => {
      const newPlayers = prev.players.map(p => {
        if (p.id === playerId) {
          const newResources = {
            ...p.resources,
            [tradeEval.offering!]: p.resources[tradeEval.offering!] - tradeEval.offeringAmount!,
            [tradeEval.requesting!]: p.resources[tradeEval.requesting!] + requestedAmount
          };
          newResources.total = newResources.clay + newResources.lumber + newResources.grain + newResources.fabric + newResources.mineral;
          return { ...p, resources: newResources };
        }
        return p;
      });

      return {
        ...prev,
        players: newPlayers,
        turnState: {
          ...prev.turnState,
          aiTradeAttemptsThisTurn: (prev.turnState.aiTradeAttemptsThisTurn || 0) + 1
        }
      };
    });

    return true;
  }, [gameState, turnTradeHistory, getPlayerColorStyle, addToLog, addAIDecisionContext]);

  const handleAIPlayerTrade = useCallback((playerId: string): boolean => {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return false;

    const attemptsThisTurn = gameState.turnState.aiTradeAttemptsThisTurn || 0;

    if (!shouldAttemptPlayerTrade(player, gameState, attemptsThisTurn)) {
      return false;
    }

    const failedProposals = gameState.turnState.aiFailedTradeProposalsThisTurn || new Set<string>();
    const proposal = generatePlayerTradeProposal(player, gameState, failedProposals);

    if (!proposal) {
      return false;
    }

    const validation = canProposePlayerTrade(
      playerId,
      proposal.offeredResources,
      proposal.requestedResources,
      gameState
    );

    if (!validation.valid) {
      return false;
    }

    const otherPlayers = gameState.players.filter(p => p.id !== playerId);

    const proposer = gameState.players.find(p => p.id === playerId);
    if (!proposer) return false;

    const sortedPlayers = [...gameState.players].sort((a, b) => a.order - b.order);
    const proposerIndex = sortedPlayers.findIndex(p => p.id === playerId);

    const respondingPlayerOrder: string[] = [];
    for (let i = 1; i < sortedPlayers.length; i++) {
      const index = (proposerIndex + i) % sortedPlayers.length;
      respondingPlayerOrder.push(sortedPlayers[index].id);
    }

    const tradeProposal = {
      proposingPlayerId: playerId,
      offeredResources: proposal.offeredResources,
      requestedResources: proposal.requestedResources,
      respondingPlayers: otherPlayers.map(p => p.id),
      responses: {} as Record<string, 'accepted' | 'rejected' | 'pending'>,
      proposerIsAI: true,
      currentRespondingPlayerIndex: 0,
      respondingPlayerOrder
    };

    otherPlayers.forEach(p => {
      tradeProposal.responses[p.id] = 'pending';
    });

    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        tradeProposal,
        aiTradeAttemptsThisTurn: (prev.turnState.aiTradeAttemptsThisTurn || 0) + 1
      }
    }));

    const playerColor = getPlayerColorStyle(player.color);
    const offeredList = Object.entries(proposal.offeredResources)
      .filter(([_, amount]) => (amount as number) > 0)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(', ');
    const requestedList = Object.entries(proposal.requestedResources)
      .filter(([_, amount]) => (amount as number) > 0)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(', ');

    const message = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> proposed trade: offering ${offeredList} for ${requestedList}`;
    addToLog(message);

    if (!player.isHuman && proposal) {
      const personality = player.character?.name ? getPersonalityForCharacter(player.character.name) : 'balanced';

      // Get detailed reasoning about what build is being pursued
      const tradeEval = evaluateTradeOpportunity(player, gameState, turnTradeHistory);
      let reasoning = 'Optimize resource portfolio';

      if (tradeEval.reasoning && tradeEval.reasoning.includes('toward')) {
        // Use the detailed reasoning from evaluateTradeOpportunity
        reasoning = tradeEval.reasoning;
      } else {
        // Fall back to simple build goal if available
        const requestedResource = Object.keys(proposal.requestedResources).find(r => proposal.requestedResources[r] > 0);
        reasoning = requestedResource ? `Acquiring ${requestedResource} to work toward building goals` : 'Optimize resource portfolio';
      }

      addAIDecisionContext(playerId, personality, reasoning);
    }

    return true;
  }, [gameState, getPlayerColorStyle, addToLog, addAIDecisionContext]);

  useEffect(() => {
    if (!aiActionLoopActive) return;
    if (gameState.phase !== 'playing') return;

    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
    if (!currentPlayer || currentPlayer.isHuman) {
      setAiActionLoopActive(false);
      return;
    }

    // Check if there's an active trade proposal - if so, pause the AI loop
    if (gameState.turnState.tradeProposal) {
      console.log('DEBUG: AI action loop paused - active trade proposal detected');
      return;
    }

    // Check if there's an active card modal - if so, pause the AI loop
    if (playedCardForModal) {
      console.log('DEBUG: AI action loop paused - card modal is showing');
      return;
    }

    if (aiActionLoopIterations > 20) {
      console.log('DEBUG: AI action loop max iterations reached, ending turn');
      setAiActionLoopActive(false);
      setTimeout(() => advanceToNextPlayer(gameState), 500);
      return;
    }

    const timer = setTimeout(() => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🤖 AI TURN - ${currentPlayer.name} (Iteration ${aiActionLoopIterations + 1})`);
      console.log(`${'='.repeat(60)}`);

      // Check if we should continue the turn
      const shouldContinue = shouldContinueTurn(
        currentPlayer,
        gameState,
        boardSize,
        aiActionLoopIterations,
        currentPlayer.difficulty || 'normal'
      );

      if (!shouldContinue) {
        console.log('✗ Turn complete - no more beneficial actions');
        setAiActionLoopActive(false);
        setTimeout(() => advanceToNextPlayer(gameState), 500);
        return;
      }

      // Create turn plan
      const turnPlan = createTurnPlan(
        currentPlayer,
        gameState,
        boardSize,
        currentPlayer.difficulty || 'normal'
      );

      if (turnPlan.actions.length === 0) {
        console.log('✗ No actions in turn plan - ending turn');
        setAiActionLoopActive(false);
        setTimeout(() => advanceToNextPlayer(gameState), 500);
        return;
      }

      // Execute the highest priority action
      const nextAction = turnPlan.actions[0];
      console.log(`\n⚡ Executing action: ${nextAction.type} (priority ${nextAction.priority})`);

      let actionSuccess = false;

      switch (nextAction.type) {
        case 'play_dev_card':
          console.log('   Playing development card...');
          // Dev card playing would be handled here
          break;

        case 'trade_bank':
          console.log('   Attempting bank trade...');
          const tradeAttempts = gameState.turnState.aiTradeAttemptsThisTurn || 0;
          if (tradeAttempts < 3) {
            actionSuccess = handleAIBankTrade(currentPlayer.id);
            console.log(`   ${actionSuccess ? '✓' : '✗'} Bank trade ${actionSuccess ? 'successful' : 'failed'}`);
          }
          break;

        case 'trade_player':
          console.log('   Attempting player trade...');
          const playerTradeAttempts = gameState.turnState.aiTradeAttemptsThisTurn || 0;
          if (playerTradeAttempts < 3) {
            actionSuccess = handleAIPlayerTrade(currentPlayer.id);
            console.log(`   ${actionSuccess ? '✓' : '✗'} Player trade ${actionSuccess ? 'initiated' : 'failed'}`);
          }
          break;

        case 'build':
          const buildingType = nextAction.data?.buildingType;
          console.log(`   Building ${buildingType}...`);

          switch (buildingType) {
            case 'road':
              actionSuccess = handleAIBuildRoad(currentPlayer.id);
              break;
            case 'village':
              actionSuccess = handleAIBuildVillage(currentPlayer.id);
              break;
            case 'estate':
              actionSuccess = handleAIBuildEstate(currentPlayer.id);
              break;
            case 'dev_card':
              actionSuccess = handleBuyDevelopmentCard(currentPlayer.id);
              break;
          }

          console.log(`   ${actionSuccess ? '✓' : '✗'} Build ${actionSuccess ? 'successful' : 'failed'}`);
          break;

        case 'end_turn':
          console.log('   Ending turn...');
          setAiActionLoopActive(false);
          setTimeout(() => advanceToNextPlayer(gameState), 500);
          return;
      }

      console.log(`${'='.repeat(60)}\n`);

      // Continue to next iteration
      setAiActionLoopIterations(prev => prev + 1);
    }, 1500);

    return () => clearTimeout(timer);
  }, [aiActionLoopActive, aiActionLoopIterations, gameState, boardSize, playedCardForModal, handleAIBuildRoad, handleAIBuildVillage, handleAIBuildEstate, handleBuyDevelopmentCard, handleAIBankTrade, handleAIPlayerTrade, advanceToNextPlayer]);

  // Complete discard phase and transition to move_robber
  const completeDiscardPhase = useCallback(() => {
    console.log('DEBUG: ===== COMPLETING DISCARD PHASE =====');
    console.log('DEBUG: Transitioning to move_robber phase');

    setDiscardState({
      playersNeedingDiscard: [],
      currentDiscardIndex: 0,
      isProcessing: false
    });

    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: 'move_robber'
      }
    }));

    addToLog('All discards complete - move the robber');
    console.log('DEBUG: ===== DISCARD PHASE COMPLETE, MOVING TO ROBBER PHASE =====');
  }, [addToLog]);

  // Process AI player discard
  const processAIDiscard = useCallback((discardIndex: number) => {
    console.log('DEBUG: processAIDiscard called with index:', discardIndex);
    console.log('DEBUG: Total players in discard queue:', discardState.playersNeedingDiscard.length);

    if (discardIndex >= discardState.playersNeedingDiscard.length) {
      console.log('DEBUG: All discards complete, calling completeDiscardPhase');
      completeDiscardPhase();
      return;
    }

    const playerId = discardState.playersNeedingDiscard[discardIndex];
    const player = gameState.players.find(p => p.id === playerId);

    console.log('DEBUG: Processing discard for player:', player?.name, 'isHuman:', player?.isHuman);

    if (!player || player.isHuman) {
      console.log('DEBUG: Player is human or not found, skipping to next');
      // Skip to next if something went wrong or player is human
      if (discardIndex + 1 < discardState.playersNeedingDiscard.length) {
        setTimeout(() => processAIDiscard(discardIndex + 1), 1500);
      } else {
        completeDiscardPhase();
      }
      return;
    }

    const maxResourceHold = gameState.gameSettings?.maxResourceHold || 7;
    const discardAmount = calculateDiscardAmount(player.resources.total);

    // Select strategic resources and apply discard
    const selection = selectStrategicDiscardResources(player, discardAmount, gameState);
    applyDiscardToPlayer(playerId, selection);

    // Move to next player or complete
    const nextIndex = discardIndex + 1;
    if (nextIndex < discardState.playersNeedingDiscard.length) {
      setDiscardState(prev => ({
        ...prev,
        currentDiscardIndex: nextIndex
      }));

      setTimeout(() => {
        processAIDiscard(nextIndex);
      }, 1500);
    } else {
      completeDiscardPhase();
    }
  }, [discardState, gameState.players, gameState.gameSettings, calculateDiscardAmount, selectRandomResourcesForDiscard, applyDiscardToPlayer, getPlayerColorStyle, addToLog, completeDiscardPhase]);

  // Handle human player discard
  const handleHumanDiscard = useCallback((selection: { clay: number; lumber: number; grain: number; fabric: number; mineral: number }) => {
    console.log('DEBUG: handleHumanDiscard called with selection:', selection);
    console.log('DEBUG: Current discard queue length:', discardState.playersNeedingDiscard.length);
    console.log('DEBUG: Current discard index:', discardState.currentDiscardIndex);

    if (discardState.playersNeedingDiscard.length === 0) {
      console.log('DEBUG: No players in discard queue, returning');
      return;
    }

    const currentPlayerId = discardState.playersNeedingDiscard[discardState.currentDiscardIndex];
    const currentPlayer = gameState.players.find(p => p.id === currentPlayerId);
    console.log('DEBUG: Human player discarding:', currentPlayer?.name);

    applyDiscardToPlayer(currentPlayerId, selection);

    // Move to next player in discard queue
    const nextIndex = discardState.currentDiscardIndex + 1;
    console.log('DEBUG: Next discard index will be:', nextIndex);

    if (nextIndex < discardState.playersNeedingDiscard.length) {
      const nextPlayer = gameState.players.find(p => p.id === discardState.playersNeedingDiscard[nextIndex]);
      console.log('DEBUG: Next player to discard:', nextPlayer?.name, 'isHuman:', nextPlayer?.isHuman);

      setDiscardState(prev => ({
        ...prev,
        currentDiscardIndex: nextIndex
      }));

      // If next player is AI, start AI discard process
      if (nextPlayer && !nextPlayer.isHuman) {
        console.log('DEBUG: Starting AI discard process for next player');
        setTimeout(() => {
          processAIDiscard(nextIndex);
        }, 1500);
      } else {
        console.log('DEBUG: Next player is human, waiting for their modal');
      }
    } else {
      console.log('DEBUG: All players have discarded, completing discard phase');
      // All discards complete, transition to main phase
      completeDiscardPhase();
    }
  }, [discardState, gameState.players, applyDiscardToPlayer, processAIDiscard, completeDiscardPhase]);

  // Start AI discard processing when entering discard phase
  useEffect(() => {
    console.log('DEBUG: AI discard useEffect triggered');
    console.log('DEBUG: turnState.step:', gameState.turnState.step);
    console.log('DEBUG: discardState.isProcessing:', discardState.isProcessing);
    console.log('DEBUG: discardState.playersNeedingDiscard.length:', discardState.playersNeedingDiscard.length);
    console.log('DEBUG: discardState.currentDiscardIndex:', discardState.currentDiscardIndex);

    if (gameState.turnState.step === 'awaiting_discard' &&
        discardState.isProcessing &&
        discardState.playersNeedingDiscard.length > 0 &&
        discardState.currentDiscardIndex < discardState.playersNeedingDiscard.length) {

      const currentPlayerId = discardState.playersNeedingDiscard[discardState.currentDiscardIndex];
      const currentPlayer = gameState.players.find(p => p.id === currentPlayerId);

      console.log('DEBUG: First player in discard queue:', currentPlayer?.name, 'isHuman:', currentPlayer?.isHuman);

      // If first player in queue is AI, start AI discard process
      if (currentPlayer && !currentPlayer.isHuman && discardState.currentDiscardIndex === 0) {
        console.log('DEBUG: Starting AI discard process for first AI player in queue');
        setTimeout(() => {
          processAIDiscard(0);
        }, 1500);
      } else if (currentPlayer?.isHuman) {
        console.log('DEBUG: First player is human - modal should open via App.tsx useEffect');
      }
    }
  }, [gameState.turnState.step, gameState.players, discardState, processAIDiscard]);

  // Robber movement handlers
  const handleMoveRobber = useCallback((centreId: number) => {
    console.log('DEBUG: handleMoveRobber called with centreId:', centreId);

    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
    if (!currentPlayer) return;

    const oldPosition = gameState.robberPosition;

    // Move the robber
    setGameState(prev => ({
      ...prev,
      robberPosition: centreId
    }));

    // Log robber movement
    const playerColor = getPlayerColorStyle(currentPlayer.color);
    const moveMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> moved the robber from centre ${oldPosition} to centre ${centreId}`;
    addToLog(moveMessage);

    // Check for players with adjacent buildings
    const eligibleTargets = getPlayersWithAdjacentBuildings(
      centreId,
      boardCenters as CentreData[],
      gameState,
      currentPlayer.id
    );

    console.log('DEBUG: Eligible steal targets:', eligibleTargets.map(p => p.name));

    if (eligibleTargets.length === 0) {
      // No one to steal from, proceed to play_dev_cards phase
      addToLog('No players to steal from');
      console.log('DEBUG: Resetting robberMovementInitiated to false (human handleMoveRobber - no targets)');
      setRobberMovementInitiated(false);
      setGameState(prev => ({
        ...prev,
        turnState: {
          ...prev.turnState,
          step: 'play_dev_cards'
        }
      }));
    } else {
      // Set eligible targets for stealing
      setEligibleStealTargets(eligibleTargets);
    }
  }, [gameState, boardCenters, addToLog, getPlayerColorStyle]);

  const handleStealResource = useCallback((targetPlayerId: string) => {
    console.log('DEBUG: handleStealResource called with targetPlayerId:', targetPlayerId);

    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
    const targetPlayer = gameState.players.find(p => p.id === targetPlayerId);

    if (!currentPlayer || !targetPlayer) return;

    const stealResult = stealRandomResource(targetPlayer, currentPlayer);

    if (stealResult.resource && stealResult.amount > 0) {
      // Transfer resource
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p => {
          if (p.id === targetPlayerId) {
            return {
              ...p,
              resources: {
                ...p.resources,
                [stealResult.resource!]: p.resources[stealResult.resource!] - stealResult.amount,
                total: p.resources.total - stealResult.amount
              }
            };
          } else if (p.id === currentPlayer.id) {
            return {
              ...p,
              resources: {
                ...p.resources,
                [stealResult.resource!]: p.resources[stealResult.resource!] + stealResult.amount,
                total: p.resources.total + stealResult.amount
              }
            };
          }
          return p;
        })
      }));

      // Log the theft - show specific resource if human is involved
      const currentPlayerColor = getPlayerColorStyle(currentPlayer.color);
      const targetPlayerColor = getPlayerColorStyle(targetPlayer.color);

      const isHumanInvolved = currentPlayer.isHuman || targetPlayer.isHuman;
      const stealMessage = isHumanInvolved
        ? `<span style="color: ${currentPlayerColor}; font-weight: bold;">${currentPlayer.name}</span> stole 1 ${stealResult.resource} from <span style="color: ${targetPlayerColor}; font-weight: bold;">${targetPlayer.name}</span>`
        : `<span style="color: ${currentPlayerColor}; font-weight: bold;">${currentPlayer.name}</span> stole a resource from <span style="color: ${targetPlayerColor}; font-weight: bold;">${targetPlayer.name}</span>`;

      addToLog(stealMessage);
    } else {
      // Target has no resources
      addToLog(`${targetPlayer.name} has no resources to steal`);
    }

    // Clear steal targets and proceed to play_dev_cards phase
    setEligibleStealTargets([]);
    setSelectedStealTarget(null);
    console.log('DEBUG: Resetting robberMovementInitiated to false (human handleStealResource)');
    setRobberMovementInitiated(false);
    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        step: 'play_dev_cards'
      }
    }));
  }, [gameState, addToLog, getPlayerColorStyle]);

  // AI robber movement automation
  useEffect(() => {
    console.log('DEBUG: AI robber useEffect triggered - step:', gameState.turnState.step, 'robberMovementInitiated:', robberMovementInitiated);

    // Safety check: ensure boardCenters is loaded before attempting robber movement
    if (boardCenters.length === 0) {
      console.log('DEBUG: Skipping robber logic - boardCenters not loaded yet');
      return;
    }

    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'move_robber' &&
        !robberMovementInitiated) {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);

      if (currentPlayer && !currentPlayer.isHuman) {
        console.log('DEBUG: AI player moving robber:', currentPlayer.name);
        console.log('DEBUG: Setting robberMovementInitiated to true');
        setRobberMovementInitiated(true);

        setTimeout(() => {
          // Calculate robber placement BEFORE state update to avoid duplicates in StrictMode
          const freshState = {
            ...gameState,
            boardCenters: gameState.boardCenters && gameState.boardCenters.length > 0
              ? gameState.boardCenters
              : boardCenters
          };

          console.log('DEBUG: Current robber position in state:', freshState.robberPosition);
          console.log('DEBUG: boardCenters length:', boardCenters.length);

          const robberPlacement = selectRobberPlacement(
            currentPlayer,
            freshState,
            boardSize,
            currentPlayer.difficulty || 'normal'
          );

          if (!robberPlacement || robberPlacement.hexId === null) {
            console.error('DEBUG: No valid robber destination found');
            setGameState(prev => ({
              ...prev,
              turnState: {
                ...prev.turnState,
                step: 'play_dev_cards'
              }
            }));
            setTimeout(() => setRobberMovementInitiated(false), 0);
            return;
          }

          const newCentreId = robberPlacement.hexId;

          // Verify the move is valid (extra safety check)
          if (newCentreId === freshState.robberPosition) {
            console.error('ERROR: AI tried to move robber to same position!', newCentreId);
            setGameState(prev => ({
              ...prev,
              turnState: {
                ...prev.turnState,
                step: 'play_dev_cards'
              }
            }));
            setTimeout(() => setRobberMovementInitiated(false), 0);
            return;
          }

          // Check for steal targets using boardCenters from React state
          const eligibleTargets = getPlayersWithAdjacentBuildings(
            newCentreId,
            boardCenters as CentreData[],
            freshState,
            currentPlayer.id
          );

          // Determine steal target
          let targetPlayerId = robberPlacement.targetPlayerId;

          // Validate target
          if (targetPlayerId && !eligibleTargets.some(t => t.id === targetPlayerId)) {
            console.warn(`AI selected invalid steal target, selecting random target instead.`);
            targetPlayerId = selectRandomStealTarget(eligibleTargets)?.id;
          } else if (!targetPlayerId && eligibleTargets.length > 0) {
            targetPlayerId = selectRandomStealTarget(eligibleTargets)?.id;
          }

          const targetPlayer = targetPlayerId ? freshState.players.find(p => p.id === targetPlayerId) : null;
          let stealResult: { resource: string | null; amount: number } | null = null;

          if (targetPlayer && targetPlayer.resources.total > 0) {
            stealResult = stealRandomResource(targetPlayer, currentPlayer);
          }

          // Prepare log messages
          const playerColor = getPlayerColorStyle(currentPlayer.color);
          const moveMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> moved the robber from centre ${freshState.robberPosition} to centre ${newCentreId}`;

          let stealMessage: string | null = null;
          if (stealResult && stealResult.resource && stealResult.amount > 0 && targetPlayer) {
            const currentPlayerColor = getPlayerColorStyle(currentPlayer.color);
            const targetPlayerColor = getPlayerColorStyle(targetPlayer.color);
            const isHumanInvolved = targetPlayer.isHuman;
            stealMessage = isHumanInvolved
              ? `<span style="color: ${currentPlayerColor}; font-weight: bold;">${currentPlayer.name}</span> stole 1 ${stealResult.resource} from <span style="color: ${targetPlayerColor}; font-weight: bold;">${targetPlayer.name}</span>`
              : `<span style="color: ${currentPlayerColor}; font-weight: bold;">${currentPlayer.name}</span> stole a resource from <span style="color: ${targetPlayerColor}; font-weight: bold;">${targetPlayer.name}</span>`;
          } else if (eligibleTargets.length > 0) {
            const targetName = targetPlayer?.name || 'target player';
            stealMessage = `${targetName} has no resources to steal`;
          } else {
            stealMessage = 'No players to steal from';
          }

          // Update state (pure function, no side effects)
          setGameState(prev => {
            let updatedPlayers = prev.players;

            if (stealResult && stealResult.resource && stealResult.amount > 0 && targetPlayer) {
              updatedPlayers = prev.players.map(p => {
                if (p.id === targetPlayer.id) {
                  return {
                    ...p,
                    resources: {
                      ...p.resources,
                      [stealResult.resource!]: p.resources[stealResult.resource!] - stealResult.amount,
                      total: p.resources.total - stealResult.amount
                    }
                  };
                } else if (p.id === currentPlayer.id) {
                  return {
                    ...p,
                    resources: {
                      ...p.resources,
                      [stealResult.resource!]: p.resources[stealResult.resource!] + stealResult.amount,
                      total: p.resources.total + stealResult.amount
                    }
                  };
                }
                return p;
              });
            }

            return {
              ...prev,
              robberPosition: newCentreId,
              players: updatedPlayers,
              turnState: {
                ...prev.turnState,
                step: 'play_dev_cards'
              }
            };
          });

          // Log AFTER state update (outside the updater function)
          setTimeout(() => {
            addToLog(moveMessage);
            if (currentPlayer && !currentPlayer.isHuman && robberPlacement.reasoning) {
              const personality = currentPlayer.character?.name ?
                getPersonalityForCharacter(currentPlayer.character.name) : 'balanced';
              addAIDecisionContext(currentPlayer.id, personality, robberPlacement.reasoning);
            }
          }, 0);
          if (stealMessage) {
            setTimeout(() => addToLog(stealMessage), 100);
          }
          setTimeout(() => setRobberMovementInitiated(false), 0);
        }, 1500);
      }
    }
  }, [gameState.phase, gameState.turnState.step, gameState.players, gameState.currentPlayer, gameState.robberPosition, gameState.gameSettings, boardCenters, boardSize, robberMovementInitiated, addToLog, getPlayerColorStyle]);

  // Trading handlers
  const handleExecuteBankTrade = useCallback((offeringResource: 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral', offeringAmount: number, requestedResource: 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral', requestedAmount?: number) => {
    let logData: { playerName: string; playerColor: string; offeringAmount: number; offeringResource: string; requestedAmount: number; requestedResource: string; rateDisplay: string } | null = null;

    setGameState(prev => {
      const currentPlayer = prev.players.find(p => p.id === prev.currentPlayer);
      if (!currentPlayer) return prev;

      // Calculate requested amount based on trade rate if not provided
      const tradeRate = getBestTradeRateForResource(currentPlayer.id, offeringResource, prev);
      const calculatedRequestedAmount = requestedAmount || (offeringAmount / tradeRate.rate);

      const newPlayers = prev.players.map(p => {
        if (p.id === currentPlayer.id) {
          const newResources = {
            ...p.resources,
            [offeringResource]: p.resources[offeringResource] - offeringAmount,
            [requestedResource]: p.resources[requestedResource] + calculatedRequestedAmount
          };
          newResources.total = newResources.clay + newResources.lumber + newResources.grain + newResources.fabric + newResources.mineral;
          return { ...p, resources: newResources };
        }
        return p;
      });

      // Capture data for logging
      logData = {
        playerName: currentPlayer.name,
        playerColor: getPlayerColorStyle(currentPlayer.color),
        offeringAmount,
        offeringResource,
        requestedAmount: calculatedRequestedAmount,
        requestedResource,
        rateDisplay: getTradeRateDisplay(tradeRate)
      };

      return { ...prev, players: newPlayers };
    });

    // Log after state update completes
    if (logData) {
      const message = `<span style="color: ${logData.playerColor}; font-weight: bold;">${logData.playerName}</span> traded ${logData.offeringAmount} ${logData.offeringResource} for ${logData.requestedAmount} ${logData.requestedResource} with the bank (${logData.rateDisplay})`;
      setTimeout(() => addToLog(message), 100);
    }
  }, [getPlayerColorStyle, addToLog]);

  const handleProposePlayerTrade = useCallback((offeredResources: any, requestedResources: any) => {
    let logData: { playerName: string; playerColor: string; offeredList: string; requestedList: string } | null = null;

    setGameState(prev => {
      const currentPlayer = prev.players.find(p => p.id === prev.currentPlayer);
      if (!currentPlayer) return prev;

      const otherPlayers = prev.players.filter(p => p.id !== currentPlayer.id);

      const sortedPlayers = [...prev.players].sort((a, b) => a.order - b.order);
      const proposerIndex = sortedPlayers.findIndex(p => p.id === currentPlayer.id);

      const respondingPlayerOrder: string[] = [];
      for (let i = 1; i < sortedPlayers.length; i++) {
        const index = (proposerIndex + i) % sortedPlayers.length;
        respondingPlayerOrder.push(sortedPlayers[index].id);
      }

      const tradeProposal = {
        proposingPlayerId: currentPlayer.id,
        offeredResources,
        requestedResources,
        respondingPlayers: otherPlayers.map(p => p.id),
        responses: {} as Record<string, 'accepted' | 'rejected' | 'pending'>,
        currentRespondingPlayerIndex: 0,
        respondingPlayerOrder
      };

      otherPlayers.forEach(player => {
        tradeProposal.responses[player.id] = 'pending';
      });

      // Capture data for logging
      const offeredList = Object.entries(offeredResources)
        .filter(([_, amount]) => (amount as number) > 0)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(', ');
      const requestedList = Object.entries(requestedResources)
        .filter(([_, amount]) => (amount as number) > 0)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(', ');

      logData = {
        playerName: currentPlayer.name,
        playerColor: getPlayerColorStyle(currentPlayer.color),
        offeredList,
        requestedList
      };

      return {
        ...prev,
        turnState: {
          ...prev.turnState,
          tradeProposal
        }
      };
    });

    // Log after state update completes
    if (logData) {
      const message = `<span style="color: ${logData.playerColor}; font-weight: bold;">${logData.playerName}</span> proposed trade: offering ${logData.offeredList} for ${logData.requestedList}`;
      setTimeout(() => addToLog(message), 100);
    }
  }, [getPlayerColorStyle, addToLog]);

  useEffect(() => {
    const tradeProposal = gameState.turnState.tradeProposal;
    if (!tradeProposal) return;

    const { currentRespondingPlayerIndex, respondingPlayerOrder } = tradeProposal;

    if (currentRespondingPlayerIndex >= respondingPlayerOrder.length) {
      return;
    }

    const currentResponderId = respondingPlayerOrder[currentRespondingPlayerIndex];
    const currentResponder = gameState.players.find(p => p.id === currentResponderId);
    const currentResponse = tradeProposal.responses[currentResponderId];

    if (!currentResponder) return;

    if (currentResponse !== 'pending') {
      return;
    }

    if (currentResponder.isHuman) {
      return;
    }

    const timer = setTimeout(() => {
      const hasEnoughResources = Object.entries(tradeProposal.requestedResources).every(
        ([resource, amount]) => currentResponder.resources[resource as keyof typeof currentResponder.resources] >= (amount as number)
      );

      const willAccept = hasEnoughResources && Math.random() < 0.35;

      if (willAccept) {
        const proposingPlayer = gameState.players.find(p => p.id === tradeProposal.proposingPlayerId);
        if (!proposingPlayer) return;

        const proposingColor = getPlayerColorStyle(proposingPlayer.color);
        const acceptingColor = getPlayerColorStyle(currentResponder.color);

        const offeredList = Object.entries(tradeProposal.offeredResources)
          .filter(([_, amount]) => (amount as number) > 0)
          .map(([resource, amount]) => `${amount} ${resource}`)
          .join(', ');
        const requestedList = Object.entries(tradeProposal.requestedResources)
          .filter(([_, amount]) => (amount as number) > 0)
          .map(([resource, amount]) => `${amount} ${resource}`)
          .join(', ');

        const message = `<span style="color: ${proposingColor}; font-weight: bold;">${proposingPlayer.name}</span> traded ${offeredList} with <span style="color: ${acceptingColor}; font-weight: bold;">${currentResponder.name}</span> for ${requestedList}`;
        addToLog(message);

        setGameState(prev => {
          const newPlayers = prev.players.map(p => {
            if (p.id === proposingPlayer.id) {
              const newResources = { ...p.resources };
              Object.entries(tradeProposal.offeredResources).forEach(([resource, amount]) => {
                newResources[resource as keyof typeof newResources] = (newResources[resource as keyof typeof newResources] as number) - (amount as number);
              });
              Object.entries(tradeProposal.requestedResources).forEach(([resource, amount]) => {
                newResources[resource as keyof typeof newResources] = (newResources[resource as keyof typeof newResources] as number) + (amount as number);
              });
              newResources.total = newResources.clay + newResources.lumber + newResources.grain + newResources.fabric + newResources.mineral;
              return { ...p, resources: newResources };
            }

            if (p.id === currentResponderId) {
              const newResources = { ...p.resources };
              Object.entries(tradeProposal.offeredResources).forEach(([resource, amount]) => {
                newResources[resource as keyof typeof newResources] = (newResources[resource as keyof typeof newResources] as number) + (amount as number);
              });
              Object.entries(tradeProposal.requestedResources).forEach(([resource, amount]) => {
                newResources[resource as keyof typeof newResources] = (newResources[resource as keyof typeof newResources] as number) - (amount as number);
              });
              newResources.total = newResources.clay + newResources.lumber + newResources.grain + newResources.fabric + newResources.mineral;
              return { ...p, resources: newResources };
            }

            return p;
          });

          return {
            ...prev,
            players: newPlayers,
            turnState: {
              ...prev.turnState,
              tradeProposal: undefined
            }
          };
        });
      } else {
        setGameState(prev => {
          const currentProposal = prev.turnState.tradeProposal;
          if (!currentProposal) return prev;

          const newResponses = { ...currentProposal.responses, [currentResponderId]: 'rejected' };
          const newIndex = currentProposal.currentRespondingPlayerIndex + 1;

          if (newIndex >= currentProposal.respondingPlayerOrder.length) {
            const proposingPlayer = prev.players.find(p => p.id === currentProposal.proposingPlayerId);
            let newGameLog = prev.gameLog;

            if (proposingPlayer) {
              const proposingColor = getPlayerColorStyle(proposingPlayer.color);
              const message = `<span style="color: ${proposingColor}; font-weight: bold;">${proposingPlayer.name}</span>'s trade was rejected by all players`;
              const timestamp = new Date().toLocaleTimeString();
              newGameLog = [...prev.gameLog, { message, timestamp }];
            }

            if (currentProposal.proposerIsAI) {
              const proposalKey = getTradeProposalKey(currentProposal.offeredResources, currentProposal.requestedResources);
              const failedProposals = prev.turnState.aiFailedTradeProposalsThisTurn || new Set<string>();
              failedProposals.add(proposalKey);

              console.log(`   🚫 Trade rejected by all - adding to failed proposals: "${proposalKey}"`);
              console.log(`   📋 Failed proposals this turn: ${Array.from(failedProposals).join(', ')}`);

              return {
                ...prev,
                gameLog: newGameLog,
                turnState: {
                  ...prev.turnState,
                  tradeProposal: undefined,
                  aiFailedTradeProposalsThisTurn: failedProposals
                }
              };
            }

            return {
              ...prev,
              gameLog: newGameLog,
              turnState: {
                ...prev.turnState,
                tradeProposal: undefined
              }
            };
          }

          return {
            ...prev,
            turnState: {
              ...prev.turnState,
              tradeProposal: {
                ...currentProposal,
                responses: newResponses,
                currentRespondingPlayerIndex: newIndex
              }
            }
          };
        });
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [gameState.turnState.tradeProposal, gameState.players, getPlayerColorStyle]);

  const handleHumanAcceptAITrade = useCallback(() => {
    let logMessage: string | null = null;

    setGameState(prev => {
      const tradeProposal = prev.turnState.tradeProposal;
      if (!tradeProposal) return prev;

      const humanPlayer = prev.players.find(p => p.isHuman);
      if (!humanPlayer) return prev;

      const proposingPlayer = prev.players.find(p => p.id === tradeProposal.proposingPlayerId);
      if (!proposingPlayer) return prev;

      const hasEnoughResources = Object.entries(tradeProposal.requestedResources).every(
        ([resource, amount]) => humanPlayer.resources[resource as keyof typeof humanPlayer.resources] >= (amount as number)
      );

      if (!hasEnoughResources) return prev;

      const newPlayers = prev.players.map(p => {
        if (p.id === proposingPlayer.id) {
          const newResources = { ...p.resources };
          Object.entries(tradeProposal.offeredResources).forEach(([resource, amount]) => {
            newResources[resource as keyof typeof newResources] = (newResources[resource as keyof typeof newResources] as number) - (amount as number);
          });
          Object.entries(tradeProposal.requestedResources).forEach(([resource, amount]) => {
            newResources[resource as keyof typeof newResources] = (newResources[resource as keyof typeof newResources] as number) + (amount as number);
          });
          newResources.total = newResources.clay + newResources.lumber + newResources.grain + newResources.fabric + newResources.mineral;
          return { ...p, resources: newResources };
        }

        if (p.id === humanPlayer.id) {
          const newResources = { ...p.resources };
          Object.entries(tradeProposal.offeredResources).forEach(([resource, amount]) => {
            newResources[resource as keyof typeof newResources] = (newResources[resource as keyof typeof newResources] as number) + (amount as number);
          });
          Object.entries(tradeProposal.requestedResources).forEach(([resource, amount]) => {
            newResources[resource as keyof typeof newResources] = (newResources[resource as keyof typeof newResources] as number) - (amount as number);
          });
          newResources.total = newResources.clay + newResources.lumber + newResources.grain + newResources.fabric + newResources.mineral;
          return { ...p, resources: newResources };
        }

        return p;
      });

      // Capture log data to be used after state update
      const offeredList = Object.entries(tradeProposal.offeredResources)
        .filter(([_, amount]) => (amount as number) > 0)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(', ');
      const requestedList = Object.entries(tradeProposal.requestedResources)
        .filter(([_, amount]) => (amount as number) > 0)
        .map(([resource, amount]) => `${amount} ${resource}`)
        .join(', ');

      const proposingColor = getPlayerColorStyle(proposingPlayer.color);
      const acceptingColor = getPlayerColorStyle(humanPlayer.color);
      logMessage = `<span style="color: ${proposingColor}; font-weight: bold;">${proposingPlayer.name}</span> traded ${offeredList} with <span style="color: ${acceptingColor}; font-weight: bold;">${humanPlayer.name}</span> for ${requestedList}`;

      return {
        ...prev,
        players: newPlayers,
        turnState: {
          ...prev.turnState,
          tradeProposal: undefined
        }
      };
    });

    // Log AFTER state update completes
    if (logMessage) {
      setTimeout(() => addToLog(logMessage), 100);
    }
  }, [getPlayerColorStyle, addToLog]);

  const handleHumanRejectAITrade = useCallback(() => {
    setGameState(prev => {
      const currentProposal = prev.turnState.tradeProposal;
      if (!currentProposal) return prev;

      const humanPlayer = prev.players.find(p => p.isHuman);
      if (!humanPlayer) return prev;

      const newResponses = { ...currentProposal.responses, [humanPlayer.id]: 'rejected' };
      const newIndex = currentProposal.currentRespondingPlayerIndex + 1;

      if (newIndex >= currentProposal.respondingPlayerOrder.length) {
        const proposingPlayer = prev.players.find(p => p.id === currentProposal.proposingPlayerId);
        let newGameLog = prev.gameLog;

        if (proposingPlayer) {
          const proposingColor = getPlayerColorStyle(proposingPlayer.color);
          const message = `<span style="color: ${proposingColor}; font-weight: bold;">${proposingPlayer.name}</span>'s trade was rejected by all players`;
          const timestamp = new Date().toLocaleTimeString();
          newGameLog = [...prev.gameLog, { message, timestamp }];
        }

        if (currentProposal.proposerIsAI) {
          const proposalKey = getTradeProposalKey(currentProposal.offeredResources, currentProposal.requestedResources);
          const failedProposals = prev.turnState.aiFailedTradeProposalsThisTurn || new Set<string>();
          failedProposals.add(proposalKey);

          console.log(`   🚫 Trade rejected by all - adding to failed proposals: "${proposalKey}"`);
          console.log(`   📋 Failed proposals this turn: ${Array.from(failedProposals).join(', ')}`);

          return {
            ...prev,
            gameLog: newGameLog,
            turnState: {
              ...prev.turnState,
              tradeProposal: undefined,
              aiFailedTradeProposalsThisTurn: failedProposals
            }
          };
        }

        return {
          ...prev,
          gameLog: newGameLog,
          turnState: {
            ...prev.turnState,
            tradeProposal: undefined
          }
        };
      }

      return {
        ...prev,
        turnState: {
          ...prev.turnState,
          tradeProposal: {
            ...currentProposal,
            responses: newResponses,
            currentRespondingPlayerIndex: newIndex
          }
        }
      };
    });
  }, [getPlayerColorStyle]);

  return {
    gameState,
    gameSteps,
    getCurrentStep,
    getCurrentPlayer,
    addToLog,
    rollDice,
    diceRoll,
    isRollingDice,
    showDiceResult,
    waitingForConfirmation,
    confirmDiceRoll,
    placeVillageAtVertex: (vertexId: number) => {
      const currentPlayer = getCurrentPlayer();
      if (currentPlayer) {
        console.log('DEBUG: placeVillageAtVertex called with:', { vertexId, currentPlayer: currentPlayer.name });
        placeVillage_P1_wrapper(currentPlayer.id, Number(vertexId));
      }
      else {
        console.log('DEBUG: No current player found for village placement');
      }
    },
    placeRoadByEdgeId: (playerId: string, toVertexId: number) => {
      console.log('DEBUG: placeRoadByEdgeId called with:', { playerId, toVertexId });
      console.log('DEBUG: Current turn state:', gameState.turnState);
      console.log('DEBUG: Last village vertex:', gameState.turnState.placementContext.lastVillageVertex);
      
      // Convert vertex-based call to edge-based call for Phase-1
      const fromVertex = gameState.turnState.placementContext.lastVillageVertex;
      console.log('DEBUG: fromVertex found:', fromVertex);
      
      if (fromVertex) {
        const id = fromVertex < toVertexId ? `${fromVertex}__${toVertexId}` : `${toVertexId}__${fromVertex}`;
        console.log('DEBUG: Generated edge ID:', id);
        console.log('DEBUG: Calling placeRoad_P1_byEdgeId_wrapper');
        placeRoad_P1_byEdgeId_wrapper(playerId, id);
      } else {
        console.log('DEBUG: No fromVertex found - cannot place road');
      }
    },
    startGame: () => {
      // Game is already started in setup phase
      console.log('Game already started');
    },
    onShowBuyMenu: handleShowBuyMenu,
    onBuyItem: handleBuyItem,
    onCancelBuyItem: handleCancelBuyItem,
    onEndTurn: handleEndTurn,
    handlePlaceRoadGameplay,
    handlePlaceVillageGameplay,
    handlePlaceEstateGameplay,
    aiActionLoopActive,
    discardState,
    handleHumanDiscard,
    calculateDiscardAmount,
    selectedCentre,
    setSelectedCentre,
    selectedStealTarget,
    setSelectedStealTarget,
    eligibleStealTargets,
    handleMoveRobber,
    handleStealResource,
    boardCenters,
    handleBuyDevelopmentCard,
    handleSkipPlayDevCards,
    handlePlayDevCard,
    handleBoomingEconomyResourceSelection,
    handleClosedMarketResourceSelection,
    handleResourceSwapPlayerSelection,
    handleFreeUpgradeVillageSelection,
    handleConfirmBoomingEconomy,
    handleConfirmClosedMarket,
    handleConfirmResourceSwap,
    handleCancelCardEffect,
    drawnCardForModal,
    setDrawnCardForModal,
    playedCardForModal,
    setPlayedCardForModal,
    cardValidationError,
    clearCardValidationError: () => setCardValidationError(null),
    handleExecuteBankTrade,
    handleProposePlayerTrade,
    handleHumanAcceptAITrade,
    handleHumanRejectAITrade
  };
};