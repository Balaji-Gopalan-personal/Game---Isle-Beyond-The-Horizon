import React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { GameState, Player, GameStep, StepTrigger } from '../types/game';
import { BoardSize, BOARD_STRUCTURES } from '../data/boardStructure';
import { AICharacter } from '../data/aiCharacters';
import { loadBoardGraph, loadBoardForSize } from '../graph/loadBoard';
import { canPlaceVillage, legalRoadEdgesFrom, edgeTouchesVertex, whyNotVillage, initializeValidators } from '../engine/validators';
import { placeVillage_P1, placeRoad_P1_byEdgeId, aiTakeTurn_P1 } from '../engine/phase1';
import { calculateLongestRoadPath, getValidRoadPlacements, getValidVillagePlacements, getPlayerVillages } from '../engine/gameplayActions';
import { makeRandomBuildDecision, selectRandomRoadLocation, selectRandomVillageLocation, selectRandomEstateLocation, getAvailableBuildingTypes } from '../engine/aiBuilding';
import { findDesertCentre, isValidRobberDestination, getPlayersWithAdjacentBuildings, selectRandomRobberDestination, stealRandomResource, selectRandomStealTarget, CentreData } from '../engine/robberActions';
import { createInitialDeck, shuffleDeck } from '../data/developmentCards';
import { checkVictoryCondition } from '../utils/victoryDetection';
import { generateTradingPorts } from '../utils/tradingPortUtils';
import { getPlayerTradingPorts } from '../utils/tradingUtils';
import { getPlayerColorHex } from '../utils/playerColors';

const DEFAULT_GAME_SETTINGS: GameSettings = {
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
  developmentCardDeck: 'standard'
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
  developmentCardDiscard: []
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

  // Helper function to add log messages
  const addToLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setGameState(prev => ({
      ...prev,
      gameLog: [...prev.gameLog, { message, timestamp }]
    }));
  }, []);

  // Helper function to get player color style
  const getPlayerColorStyle = useCallback((color: string) => {
    return getPlayerColorHex(color);
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

    // Clear dice roll state for new turn
    setDiceRoll(null);
    setIsRollingDice(false);
    setWaitingForConfirmation(false);
    setShowDiceResult(false);
    setDiceRollPhaseComplete(false);

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
          lock: false
        };
        console.log('DEBUG: Reset turnState to awaiting_dice_roll for playing phase');
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
          console.log(`DEBUG: Vertex ${vertexId} - village found:`, !!village, village?.playerId);

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
    
    // Store centers for resource collection
    setBoardCenters(boardData.centers);
    
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
    console.log('DEBUG TRADING PORT CHECK:', {
      playerId,
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

    const player = updatedGameState.players.find(p => p.id === playerId);
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
      return port.vertices.includes(vertexId);
    });

    console.log('DEBUG: Found ports for vertex:', { vertexId, newPorts });

    const messages: Array<{message: string, playerId: string}> = [];
    if (newPorts.length > 0) {
      newPorts.forEach(port => {
        let portDescription = '';
        if (port.type === 'generic') {
          portDescription = '3:1 Trading Port (any 3 of the same resource for 1 of any other)';
        } else {
          const resourceName = port.type.charAt(0).toUpperCase() + port.type.slice(1);
          portDescription = `2:1 ${resourceName} Trading Port (2 ${resourceName} for 1 of any other resource)`;
        }

        console.log('DEBUG: Returning trading port message:', portDescription);
        messages.push({
          message: `${player.name} gained access to a ${portDescription}`,
          playerId
        });
      });
    }
    return messages;
  }, [boardSize, boardGraph]);

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

  // Helper: Get playable dev cards for a player
  const getPlayableDevCards = useCallback((player: Player) => {
    return player.developmentCardsInHand.filter(card => {
      // Extra Point is automatic
      if (card.name === 'Extra Point') return false;
      // Can't play cards drawn this turn
      if (card.turnDrawn === player.currentTurn) return false;
      // Guard limit per turn
      if (card.name === 'Guard' && player.guardsPlayedThisTurn > 0) return false;
      // Free Upgrade needs a village
      if (card.name === 'Free Upgrade') {
        const playerVillages = gameState.villages.filter(v => v.playerId === player.id && v.type === 'settlement');
        if (playerVillages.length === 0) return false;
      }
      return true;
    });
  }, [gameState.villages]);

  // Helper: AI decides whether to play a dev card (random)
  const aiDecidePlayDevCard = useCallback((player: Player): DevelopmentCard | null => {
    const playableCards = getPlayableDevCards(player);
    if (playableCards.length === 0) return null;

    // 40% chance to play a card if available
    if (Math.random() < 0.4) {
      const randomIndex = Math.floor(Math.random() * playableCards.length);
      return playableCards[randomIndex];
    }
    return null;
  }, [getPlayableDevCards]);

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
  const checkLongestRoadBonus = useCallback((playerId: string, newLength: number) => {
    const minLength = gameState.gameSettings?.longestRoadSize || 5;
    const bonus = gameState.gameSettings?.longestRoadBonus || 2;

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
        const currentHolderLength = gameState.longestRoadLengths.get(currentHolder.id) || 0;
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
    }
    
    console.log('DEBUG: Updating React state after village placement');

    // Variable to capture trading port messages
    let tradingPortMessages: Array<{message: string, playerId: string}> = [];

    // Update React state
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
                resources: gameState.phase === 'setup-phase-2' ? {
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

      // Check for trading port access with the updated state and capture messages
      tradingPortMessages = checkAndLogTradingPortAccess(playerId, vertexId, newState);

      return newState;
    });

    // Add to activity log
    if (gameState.phase === 'setup-phase-1') {
      addColoredLog(`${playerName} placed their first village and earned 1 point.`, playerId);
    } else if (gameState.phase === 'setup-phase-2') {
      addColoredLog(`${playerName} placed their second village and earned 1 point.`, playerId);
      if (resourceCollection.logMessage) {
        setGameState(prev => ({
          ...prev,
          gameLog: [...prev.gameLog, {
            message: resourceCollection.logMessage,
            timestamp: new Date().toLocaleTimeString()
          }]
        }));
      }
    }

    // Add trading port messages after state update completes
    tradingPortMessages.forEach(msg => {
      addColoredLog(msg.message, msg.playerId);
    });

    console.log('DEBUG: Village placement complete');
  }, [gameState, collectResourcesFromAdjacentCenters, addToLog, addColoredLog, checkAndLogTradingPortAccess]);
  
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
      addToLog(`${playerName} placed a road between vertices ${fromVertex} and ${toVertex}.`);

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
          addToLog(`${nextPlayer.name} begins their turn.`);
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
    
    // Check what changed and update accordingly
    const villageAdded = Object.keys(mutableState.verticesOccupiedBy).find(v => 
      mutableState.verticesOccupiedBy[v] === playerId && !gameState.verticesOccupiedBy[v]
    );
    
    const roadAdded = Object.keys(mutableState.edgesOccupiedBy).find(e => 
      mutableState.edgesOccupiedBy[e] === playerId && !gameState.edgesOccupiedBy[e]
    );
    
    console.log('DEBUG: AI changes detected:', { villageAdded, roadAdded });
    
    // Initialize resource collection for AI
    let aiResourceCollection = { resources: {}, logMessage: '' };

    // Collect resources if AI placed a village in Phase 2
    if (villageAdded && gameState.phase === 'setup-phase-2') {
      const vertexId = parseInt(villageAdded);
      aiResourceCollection = collectResourcesFromAdjacentCenters(vertexId, playerId);
    }

    // Variable to capture trading port messages for AI (declared outside setGameState)
    let aiTradingPortMessages: Array<{message: string, playerId: string}> = [];

    // Enhanced road logging
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
        const fromVertex = edge.v1;
        const toVertex = edge.v2;
        console.log('DEBUG: AI road vertices:', { fromVertex, toVertex, edgeId: roadAdded });
      } else {
        console.error('DEBUG: AI selected invalid edge:', {
          roadAdded,
          edge,
          availableEdges: Object.keys(boardGraph.edges).slice(0, 10),
          boardSize: boardSize
        });
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
    
    // Update React state with any changes made by AI
    setGameState(prev => {
      const newState = {
        ...prev,
        verticesOccupiedBy: mutableState.verticesOccupiedBy,
        edgesOccupiedBy: mutableState.edgesOccupiedBy,
        turnState: mutableState.turnState,
        currentPlayer: mutableState.turnState.currentPlayerId,
        turn: mutableState.turnState.currentPlayerId !== initialPlayerId ? prev.turn + 1 : prev.turn,
        villages: villageAdded ? [...prev.villages, {
          id: `village-${villageAdded}`,
          playerId,
          vertexId: parseInt(villageAdded),
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
          const villageScore = villageAdded ? 1 : 0;
          const longestRoadScore = aiLongestRoadUpdate?.shouldAward ? aiLongestRoadUpdate.bonus : 0;
          return {
            ...p,
            villageCount: villageAdded ? p.villageCount + 1 : p.villageCount,
            roadCount: roadAdded ? p.roadCount + 1 : p.roadCount,
            score: p.score + villageScore + longestRoadScore,
            hasLongestRoad: aiLongestRoadUpdate?.shouldAward ? true : p.hasLongestRoad,
            isActive: mutableState.turnState.currentPlayerId === playerId,
            resources: villageAdded && gameState.phase === 'setup-phase-2' ? {
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

      // Check for trading port access if AI placed a village and capture messages
      if (villageAdded) {
        const vertexId = parseInt(villageAdded);
        aiTradingPortMessages = checkAndLogTradingPortAccess(playerId, vertexId, newState);
      }

      return newState;
    });
    
    // Add appropriate log messages
    if (villageAdded) {
      const vertexNum = parseInt(villageAdded);
      if (gameState.phase === 'setup-phase-1') {
        addColoredLog(`${playerName} placed a village at vertex ${vertexNum} and earned 1 point.`, playerId);
      } else if (gameState.phase === 'setup-phase-2') {
        addColoredLog(`${playerName} placed a village at vertex ${vertexNum} and earned 1 point.`, playerId);
        if (aiResourceCollection.logMessage) {
          setGameState(prev => ({
            ...prev,
            gameLog: [...prev.gameLog, {
              message: aiResourceCollection.logMessage,
              timestamp: new Date().toLocaleTimeString()
            }]
          }));
        }
      }

      // Add trading port messages captured from state update
      aiTradingPortMessages.forEach(msg => {
        addColoredLog(msg.message, msg.playerId);
      });
    }
    
    if (roadAdded) {
      // Parse edge ID to get vertices
      const [v1Str, v2Str] = roadAdded.split('__');
      const fromVertex = parseInt(v1Str);
      const toVertex = parseInt(v2Str);
      
      if (!isNaN(fromVertex) && !isNaN(toVertex)) {
        addColoredLog(`${playerName} placed a road connecting vertex ${fromVertex} to vertex ${toVertex}.`, playerId);
        if (gameState.phase === 'setup-phase-2' && newLongestRoadLength === 2 && !aiLongestRoadUpdate?.shouldAward) {
          addColoredLog(`${playerName}'s roads are now connected (longest road: 2).`, playerId);
        }
      } else {
        console.error("DEBUG: Invalid edge ID format in AI log message:", roadAdded);
        addColoredLog(`${playerName} attempted to place a road (edge data invalid).`, playerId);
      }
    }
    
    // Check if turn advanced to next player
    if (mutableState.turnState.currentPlayerId !== initialPlayerId) {
      const nextPlayer = gameState.players.find(p => p.id === mutableState.turnState.currentPlayerId);
      if (nextPlayer) {
        addColoredLog(`${nextPlayer.name} begins their turn.`, nextPlayer.id);
      }
    }
  }, [gameState, collectResourcesFromAdjacentCenters, areRoadsConnected, addToLog, addColoredLog, boardGraph, checkLongestRoadBonus, checkAndLogTradingPortAccess]);
  
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

      setGameState({
        currentPlayer: firstPlayer.id,
        currentStep: 'place-village',
        turn: 1,
        phase: 'setup-phase-1',
        players,
        gameLog: [
          { message: `Game initialized with ${players.length} players`, timestamp: new Date().toLocaleTimeString() },
          { message: `Setup Phase 1 begins`, timestamp: new Date().toLocaleTimeString() },
          { message: `${firstPlayer.name} goes first`, timestamp: new Date().toLocaleTimeString() }
        ],
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
        addToLog(`${firstPlayer.name} begins Turn 1`);
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
        addToLog(`${firstPlayer.name} begins Turn 2`);
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

    // Validate card can be played
    if (card.name === 'Extra Point') {
      addToLog('Extra Point cards are automatic and cannot be played manually');
      return;
    }

    if (card.name === 'Expert Negotiator') {
      const playerColor = getPlayerColorStyle(currentPlayer.color);
      const playMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> played Expert Negotiator - 2:1 trading available this turn!`;
      addToLog(playMessage);

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

    if (card.turnDrawn === currentPlayer.currentTurn) {
      addToLog('Cannot play a card drawn this turn');
      return;
    }

    // Check if trying to play a Guard when one has already been played this turn
    // This check is now shown on the card itself in DevCardHandModal
    if (card.name === 'Guard' && currentPlayer.guardsPlayedThisTurn > 0) {
      return;
    }

    // For Free Upgrade, check if player has any villages
    if (card.name === 'Free Upgrade') {
      const playerVillages = gameState.villages.filter(v => v.playerId === currentPlayer.id && v.type === 'settlement');
      if (playerVillages.length === 0) {
        addToLog('You must have at least one Village to play Free Upgrade');
        return;
      }
    }

    // For Guard card, handle immediately with card removal
    if (card.name === 'Guard') {
      const playerColor = getPlayerColorStyle(currentPlayer.color);
      const playMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> played ${card.name}`;
      addToLog(playMessage);
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

    if (isInteractive) {
      // Store card ID in placementContext so we can remove it later
      setGameState(prev => ({
        ...prev,
        turnState: {
          ...prev.turnState,
          placementContext: {
            ...prev.turnState.placementContext,
            pendingCardId: card.id
          }
        }
      }));
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

    // Execute card effect based on card type
    switch (card.name) {
      case 'Guard':
        // Already handled above
        break;
      case 'Road Construction':
        handlePlayRoadConstructionCard(currentPlayer);
        break;
      case 'Booming Economy':
        handlePlayBoomingEconomyCard(currentPlayer);
        break;
      case 'Closed Market':
        handlePlayClosedMarketCard(currentPlayer);
        break;
      case 'Resource Swap':
        handlePlayResourceSwapCard(currentPlayer);
        break;
      case 'Free Upgrade':
        handlePlayFreeUpgradeCard(currentPlayer);
        break;
      default:
        console.log('DEBUG: Unknown card type:', card.name);
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
    setGameState(prev => {
      const resourcesSelected = (prev.turnState.placementContext.resourcesSelected || []) as string[];
      const pendingCardId = prev.turnState.placementContext.pendingCardId;

      if (resourcesSelected.length !== 2) return prev;

      const updatedPlayers = prev.players.map(p => {
        if (p.id === prev.currentPlayer) {
          const newResources = { ...p.resources };
          resourcesSelected.forEach(res => {
            newResources[res as keyof typeof newResources]++;
            newResources.total++;
          });

          const playerColor = getPlayerColorStyle(p.color);
          const message = `<span style="color: ${playerColor}; font-weight: bold;">${p.name}</span> gained ${resourcesSelected.join(' and ')} from Booming Economy`;
          setTimeout(() => addToLog(message), 100);

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
      const currentPlayer = prev.players.find(p => p.id === prev.currentPlayer);
      const cardToDiscard = currentPlayer?.developmentCardsInHand.find(c => c.id === pendingCardId);

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
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
    if (!currentPlayer) return;

    const resourceType = gameState.turnState.placementContext.selectedResource as 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral';
    const pendingCardId = gameState.turnState.placementContext.pendingCardId;
    if (!resourceType) return;

    let totalTransferred = 0;
    const transfers: { from: string; amount: number }[] = [];

    const updatedPlayers = gameState.players.map(p => {
      if (p.id === currentPlayer.id) {
        return p;
      }

      const amountToTransfer = p.resources[resourceType];
      if (amountToTransfer > 0) {
        totalTransferred += amountToTransfer;
        transfers.push({ from: p.name, amount: amountToTransfer });

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

    setGameState(prev => ({
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
    }));

    const playerColor = getPlayerColorStyle(currentPlayer.color);
    const message = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> took ${totalTransferred} ${resourceType} from other players`;
    addToLog(message);

    transfers.forEach(transfer => {
      const detailMessage = `${transfer.from} gave up ${transfer.amount} ${resourceType}`;
      setTimeout(() => addToLog(detailMessage), 100);
    });
  }, [gameState, addToLog, getPlayerColorStyle]);

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
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
    const targetPlayerId = gameState.turnState.placementContext.selectedPlayerId;
    const targetPlayer = gameState.players.find(p => p.id === targetPlayerId);
    const pendingCardId = gameState.turnState.placementContext.pendingCardId;

    if (!currentPlayer || !targetPlayer) return;

    const tempResources = { ...currentPlayer.resources };

    const updatedPlayers = gameState.players.map(p => {
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

    setGameState(prev => ({
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
    }));

    const currentPlayerColor = getPlayerColorStyle(currentPlayer.color);
    const targetPlayerColor = getPlayerColorStyle(targetPlayer.color);
    const message = `<span style="color: ${currentPlayerColor}; font-weight: bold;">${currentPlayer.name}</span> swapped all resources with <span style="color: ${targetPlayerColor}; font-weight: bold;">${targetPlayer.name}</span>`;
    addToLog(message);
  }, [gameState, addToLog, getPlayerColorStyle]);

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
    console.log('DEBUG: Free Upgrade village selected:', vertexId);

    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
    const pendingCardId = gameState.turnState.placementContext.pendingCardId;
    if (!currentPlayer) return;

    const village = gameState.villages.find(v => v.vertexId === vertexId && v.playerId === currentPlayer.id && v.type === 'settlement');
    if (!village) {
      addToLog('Invalid village selection');
      return;
    }

    const updatedVillages = gameState.villages.map(v => {
      if (v.id === village.id) {
        return { ...v, type: 'city' as const };
      }
      return v;
    });

    const updatedPlayers = gameState.players.map(p => {
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

    setGameState(prev => ({
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
    }));

    const playerColor = getPlayerColorStyle(currentPlayer.color);
    const message = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> upgraded a Village to an Estate for free`;
    addToLog(message);
  }, [gameState, addToLog, getPlayerColorStyle]);

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

  // Auto-handle Booming Economy selection for AI players
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'booming_economy_selection') {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer && !currentPlayer.isHuman) {
        const timer = setTimeout(() => {
          const resourceTypes: Array<'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral'> = ['clay', 'lumber', 'grain', 'fabric', 'mineral'];
          const resource1 = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
          handleBoomingEconomyResourceSelection(resource1);

          setTimeout(() => {
            const resource2 = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
            handleBoomingEconomyResourceSelection(resource2);

            setTimeout(() => {
              handleConfirmBoomingEconomy();
            }, 400);
          }, 400);
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, gameState.players, handleBoomingEconomyResourceSelection, handleConfirmBoomingEconomy]);

  // Auto-handle Closed Market selection for AI players
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'closed_market_selection') {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer && !currentPlayer.isHuman) {
        const timer = setTimeout(() => {
          const resourceTypes: Array<'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral'> = ['clay', 'lumber', 'grain', 'fabric', 'mineral'];
          const resource = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];
          handleClosedMarketResourceSelection(resource);

          setTimeout(() => {
            handleConfirmClosedMarket();
          }, 400);
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, gameState.players, handleClosedMarketResourceSelection, handleConfirmClosedMarket]);

  // Auto-handle Resource Swap selection for AI players
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'resource_swap_selection') {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer && !currentPlayer.isHuman) {
        const timer = setTimeout(() => {
          const otherPlayers = gameState.players.filter(p => p.id !== currentPlayer.id);
          if (otherPlayers.length > 0) {
            const targetPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
            handleResourceSwapPlayerSelection(targetPlayer.id);

            setTimeout(() => {
              handleConfirmResourceSwap();
            }, 400);
          }
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, gameState.players, handleResourceSwapPlayerSelection, handleConfirmResourceSwap]);

  // Auto-handle Free Upgrade selection for AI players
  useEffect(() => {
    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'free_upgrade_selection') {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer && !currentPlayer.isHuman) {
        const timer = setTimeout(() => {
          const playerVillages = gameState.villages.filter(v => v.playerId === currentPlayer.id && v.type === 'settlement');
          if (playerVillages.length > 0) {
            const village = playerVillages[Math.floor(Math.random() * playerVillages.length)];
            handleFreeUpgradeVillageSelection(village.vertexId);
          }
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, gameState.players, gameState.villages, handleFreeUpgradeVillageSelection]);

  const handleEndTurn = useCallback(() => {
    console.log('DEBUG: handleEndTurn called');

    if (gameState.phase === 'playing') {
      const { hasWinner, winner } = checkVictoryCondition(gameState);

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

        return;
      }
    }

    advanceToNextPlayer(gameState);
  }, [gameState, advanceToNextPlayer, getPlayerColorStyle]);

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
    const longestPath = calculateLongestRoadPath(playerId, updatedRoads, boardGraph.vertices);
    const longestRoadUpdate = checkLongestRoadBonus(playerId, longestPath);

    setGameState(prev => {
      const updatedEdgesOccupiedBy = { ...prev.edgesOccupiedBy, [edgeId]: playerId };
      const updatedRoads = [...prev.roads, newRoad];

      const longestPath = calculateLongestRoadPath(playerId, updatedRoads, boardGraph.vertices);

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
          const roadLocation = selectRandomRoadLocation(currentPlayer.id, gameState, boardSize);

          if (roadLocation) {
            const { fromVertex, toVertex } = roadLocation;
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

    // Variable to capture trading port messages
    let tradingPortMessages: Array<{message: string, playerId: string}> = [];

    setGameState(prev => {
      const newState = {
        ...prev,
        villages: [...prev.villages, newVillage],
        verticesOccupiedBy: { ...prev.verticesOccupiedBy, [vertexId]: currentPlayer.id },
        players: prev.players.map(p =>
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
        ),
        turnState: {
          ...prev.turnState,
          step: 'main',
          placementContext: {
            lastVillageVertex: null,
            buildingType: null
          }
        }
      };

      // Check for trading port access with the updated state and capture messages
      tradingPortMessages = checkAndLogTradingPortAccess(currentPlayer.id, vertexId, newState);

      return newState;
    });

    const playerColor = getPlayerColorStyle(currentPlayer.color);
    const villageMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> built a village at vertex ${vertexId} and earned 1 point`;
    addToLog(villageMessage);

    // Add trading port messages after state update completes
    tradingPortMessages.forEach(msg => {
      addColoredLog(msg.message, msg.playerId);
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

    const roadLocation = selectRandomRoadLocation(playerId, gameState, boardSize);
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
    const longestPath = calculateLongestRoadPath(playerId, updatedRoads, boardGraph.vertices);
    const longestRoadUpdate = checkLongestRoadBonus(playerId, longestPath);

    setGameState(prev => {
      const updatedEdgesOccupiedBy = { ...prev.edgesOccupiedBy, [edgeId]: playerId };
      const updatedRoads = [...prev.roads, newRoad];

      const longestPath = calculateLongestRoadPath(playerId, updatedRoads, boardGraph.vertices);

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

    const vertexId = selectRandomVillageLocation(playerId, gameState, boardSize);
    if (!vertexId) {
      console.log('DEBUG: No valid village location found');
      return false;
    }

    const newVillage: Village = {
      id: `village-${vertexId}-${Date.now()}`,
      playerId,
      vertexId,
      type: 'settlement'
    };

    // Variable to capture trading port messages
    let tradingPortMessages: Array<{message: string, playerId: string}> = [];

    setGameState(prev => {
      const newState = {
        ...prev,
        villages: [...prev.villages, newVillage],
        verticesOccupiedBy: { ...prev.verticesOccupiedBy, [vertexId]: playerId },
        players: prev.players.map(p =>
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
        )
      };

      // Check for trading port access with the updated state and capture messages
      tradingPortMessages = checkAndLogTradingPortAccess(playerId, vertexId, newState);

      return newState;
    });

    const playerColor = getPlayerColorStyle(player.color);
    const villageMessage = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> built a village at vertex ${vertexId} and earned 1 point`;
    addToLog(villageMessage);

    // Add trading port messages after state update completes
    tradingPortMessages.forEach(msg => {
      addColoredLog(msg.message, msg.playerId);
    });

    return true;
  }, [gameState, boardSize, getPlayerColorStyle, addToLog, addColoredLog, checkAndLogTradingPortAccess]);

  const handleAIBuildEstate = useCallback((playerId: string) => {
    console.log('DEBUG: AI building estate for', playerId);
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) return false;

    const vertexId = selectRandomEstateLocation(playerId, gameState);
    if (!vertexId) {
      console.log('DEBUG: No valid estate location found');
      return false;
    }

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

    return true;
  }, [gameState, getPlayerColorStyle, addToLog]);

  useEffect(() => {
    if (!aiActionLoopActive) return;
    if (gameState.phase !== 'playing') return;

    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
    if (!currentPlayer || currentPlayer.isHuman) {
      setAiActionLoopActive(false);
      return;
    }

    if (aiActionLoopIterations > 20) {
      console.log('DEBUG: AI action loop max iterations reached, ending turn');
      setAiActionLoopActive(false);
      setTimeout(() => advanceToNextPlayer(gameState), 500);
      return;
    }

    const timer = setTimeout(() => {
      // First, check if AI wants to buy a development card
      const canAffordDevCard = currentPlayer.resources.grain >= 1 &&
                                currentPlayer.resources.fabric >= 1 &&
                                currentPlayer.resources.mineral >= 1;
      const hasCardsAvailable = gameState.developmentCardDeck.length > 0;

      // 30% chance to buy a dev card if affordable and available
      if (canAffordDevCard && hasCardsAvailable && Math.random() < 0.3) {
        console.log('DEBUG: AI decided to buy a development card');
        const success = handleBuyDevelopmentCard(currentPlayer.id);
        if (success) {
          console.log('DEBUG: AI bought development card successfully');
          setAiActionLoopIterations(prev => prev + 1);
          return;
        }
      }

      const availableTypes = getAvailableBuildingTypes(currentPlayer.id, gameState, boardSize);

      if (availableTypes.length === 0) {
        console.log('DEBUG: AI cannot build anything, ending turn');
        setAiActionLoopActive(false);
        setTimeout(() => advanceToNextPlayer(gameState), 500);
        return;
      }

      const decision = makeRandomBuildDecision(currentPlayer.id, gameState, boardSize, aiActionLoopIterations);

      if (!decision.shouldBuild) {
        console.log('DEBUG: AI decided to end turn');
        setAiActionLoopActive(false);
        setTimeout(() => advanceToNextPlayer(gameState), 500);
        return;
      }

      console.log('DEBUG: AI decided to build', decision.buildingType);

      let buildSuccess = false;
      switch (decision.buildingType) {
        case 'road':
          buildSuccess = handleAIBuildRoad(currentPlayer.id);
          break;
        case 'village':
          buildSuccess = handleAIBuildVillage(currentPlayer.id);
          break;
        case 'estate':
          buildSuccess = handleAIBuildEstate(currentPlayer.id);
          break;
      }

      if (buildSuccess) {
        console.log('DEBUG: AI build successful, continuing loop');
      } else {
        console.log('DEBUG: AI build failed, retrying');
      }

      setAiActionLoopIterations(prev => prev + 1);
    }, 1500);

    return () => clearTimeout(timer);
  }, [aiActionLoopActive, aiActionLoopIterations, gameState, boardSize, handleAIBuildRoad, handleAIBuildVillage, handleAIBuildEstate, handleBuyDevelopmentCard, advanceToNextPlayer]);

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

    // Select random resources and apply discard
    const selection = selectRandomResourcesForDiscard(player, discardAmount);
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

    if (gameState.phase === 'playing' &&
        gameState.turnState.step === 'move_robber' &&
        !robberMovementInitiated) {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);

      if (currentPlayer && !currentPlayer.isHuman) {
        console.log('DEBUG: AI player moving robber:', currentPlayer.name);
        console.log('DEBUG: Setting robberMovementInitiated to true');
        setRobberMovementInitiated(true);

        setTimeout(() => {
          const robberCanReturnToDesert = gameState.gameSettings?.robberCanReturnToDesert || false;
          const newCentreId = selectRandomRobberDestination(
            boardCenters as CentreData[],
            gameState.robberPosition,
            robberCanReturnToDesert
          );

          if (newCentreId !== null) {
            // Move robber
            const oldPosition = gameState.robberPosition;
            setGameState(prev => ({
              ...prev,
              robberPosition: newCentreId
            }));

            // Log robber movement
            const playerColor = getPlayerColorStyle(currentPlayer.color);
            const moveMessage = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> moved the robber from centre ${oldPosition} to centre ${newCentreId}`;
            addToLog(moveMessage);

            // Check for steal targets
            const eligibleTargets = getPlayersWithAdjacentBuildings(
              newCentreId,
              boardCenters as CentreData[],
              gameState,
              currentPlayer.id
            );

            if (eligibleTargets.length > 0) {
              // AI steals from random target
              setTimeout(() => {
                const targetPlayer = selectRandomStealTarget(eligibleTargets);

                if (targetPlayer) {
                  const stealResult = stealRandomResource(targetPlayer, currentPlayer);

                  if (stealResult.resource && stealResult.amount > 0) {
                    // Transfer resource
                    setGameState(prev => ({
                      ...prev,
                      players: prev.players.map(p => {
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
                      }),
                      turnState: {
                        ...prev.turnState,
                        step: 'play_dev_cards'
                      }
                    }));
                    console.log('DEBUG: Resetting robberMovementInitiated to false (after successful steal)');
                    setRobberMovementInitiated(false);

                    // Log the theft
                    const currentPlayerColor = getPlayerColorStyle(currentPlayer.color);
                    const targetPlayerColor = getPlayerColorStyle(targetPlayer.color);

                    const isHumanInvolved = targetPlayer.isHuman;
                    const stealMessage = isHumanInvolved
                      ? `<span style="color: ${currentPlayerColor}; font-weight: bold;">${currentPlayer.name}</span> stole 1 ${stealResult.resource} from <span style="color: ${targetPlayerColor}; font-weight: bold;">${targetPlayer.name}</span>`
                      : `<span style="color: ${currentPlayerColor}; font-weight: bold;">${currentPlayer.name}</span> stole a resource from <span style="color: ${targetPlayerColor}; font-weight: bold;">${targetPlayer.name}</span>`;

                    addToLog(stealMessage);
                  } else {
                    // Target has no resources
                    addToLog(`${targetPlayer.name} has no resources to steal`);
                    setGameState(prev => ({
                      ...prev,
                      turnState: {
                        ...prev.turnState,
                        step: 'play_dev_cards'
                      }
                    }));
                    console.log('DEBUG: Resetting robberMovementInitiated to false (target has no resources)');
                    setRobberMovementInitiated(false);
                  }
                }
              }, 1000);
            } else {
              // No one to steal from
              addToLog('No players to steal from');
              setGameState(prev => ({
                ...prev,
                turnState: {
                  ...prev.turnState,
                  step: 'play_dev_cards'
                }
              }));
              console.log('DEBUG: Resetting robberMovementInitiated to false (no one to steal from)');
              setRobberMovementInitiated(false);
            }
          } else {
            console.error('DEBUG: No valid robber destination found');
            // Fallback: proceed to main phase
            setGameState(prev => ({
              ...prev,
              turnState: {
                ...prev.turnState,
                step: 'play_dev_cards'
              }
            }));
            console.log('DEBUG: Resetting robberMovementInitiated to false (no valid destination)');
            setRobberMovementInitiated(false);
          }
        }, 1500);
      }
    }
  }, [gameState.phase, gameState.turnState.step, gameState.players, gameState.currentPlayer, gameState.robberPosition, gameState.gameSettings, boardCenters, addToLog, getPlayerColorStyle]);

  // Trading handlers
  const handleExecuteBankTrade = useCallback((offeringResource: 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral', offeringAmount: number, requestedResource: 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral') => {
    const currentPlayer = getCurrentPlayer();
    if (!currentPlayer) return;

    const playerColor = getPlayerColorStyle(currentPlayer.color);
    const message = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> traded ${offeringAmount} ${offeringResource} for 1 ${requestedResource} with the bank`;
    addToLog(message);

    setGameState(prev => {
      const newPlayers = prev.players.map(p => {
        if (p.id === currentPlayer.id) {
          const newResources = {
            ...p.resources,
            [offeringResource]: p.resources[offeringResource] - offeringAmount,
            [requestedResource]: p.resources[requestedResource] + 1
          };
          newResources.total = newResources.clay + newResources.lumber + newResources.grain + newResources.fabric + newResources.mineral;
          return { ...p, resources: newResources };
        }
        return p;
      });

      return { ...prev, players: newPlayers };
    });
  }, [getCurrentPlayer, getPlayerColorStyle, addToLog]);

  const handleProposePlayerTrade = useCallback((offeredResources: any, requestedResources: any) => {
    const currentPlayer = getCurrentPlayer();
    if (!currentPlayer) return;

    const otherPlayers = gameState.players.filter(p => p.id !== currentPlayer.id);

    const tradeProposal = {
      proposingPlayerId: currentPlayer.id,
      offeredResources,
      requestedResources,
      respondingPlayers: otherPlayers.map(p => p.id),
      responses: {} as Record<string, 'accepted' | 'rejected' | 'pending'>
    };

    otherPlayers.forEach(player => {
      tradeProposal.responses[player.id] = 'pending';
    });

    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        tradeProposal
      }
    }));

    const playerColor = getPlayerColorStyle(currentPlayer.color);
    const offeredList = Object.entries(offeredResources)
      .filter(([_, amount]) => (amount as number) > 0)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(', ');
    const requestedList = Object.entries(requestedResources)
      .filter(([_, amount]) => (amount as number) > 0)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(', ');

    const message = `<span style="color: ${playerColor}; font-weight: bold;">${currentPlayer.name}</span> proposed trade: offering ${offeredList} for ${requestedList}`;
    addToLog(message);

    setTimeout(() => {
      processAITradeResponses(tradeProposal, currentPlayer);
    }, 1500);
  }, [gameState.players, getCurrentPlayer, getPlayerColorStyle, addToLog]);

  const processAITradeResponses = useCallback((tradeProposal: any, proposingPlayer: any) => {
    const aiPlayers = gameState.players.filter(p => p.id !== proposingPlayer.id && !p.isHuman);

    let acceptingPlayerId: string | null = null;

    aiPlayers.forEach(aiPlayer => {
      const hasEnoughResources = Object.entries(tradeProposal.requestedResources).every(
        ([resource, amount]) => aiPlayer.resources[resource as keyof typeof aiPlayer.resources] >= (amount as number)
      );

      if (hasEnoughResources && Math.random() < 0.35) {
        if (!acceptingPlayerId) {
          acceptingPlayerId = aiPlayer.id;
        }
      }
    });

    setGameState(prev => {
      const newResponses = { ...tradeProposal.responses };

      if (acceptingPlayerId) {
        newResponses[acceptingPlayerId] = 'accepted';

        aiPlayers.forEach(p => {
          if (p.id !== acceptingPlayerId) {
            newResponses[p.id] = 'rejected';
          }
        });

        const acceptingPlayer = gameState.players.find(p => p.id === acceptingPlayerId);
        if (acceptingPlayer) {
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

            if (p.id === acceptingPlayerId) {
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

          const proposingColor = getPlayerColorStyle(proposingPlayer.color);
          const acceptingColor = getPlayerColorStyle(acceptingPlayer.color);

          const offeredList = Object.entries(tradeProposal.offeredResources)
            .filter(([_, amount]) => (amount as number) > 0)
            .map(([resource, amount]) => `${amount} ${resource}`)
            .join(', ');
          const requestedList = Object.entries(tradeProposal.requestedResources)
            .filter(([_, amount]) => (amount as number) > 0)
            .map(([resource, amount]) => `${amount} ${resource}`)
            .join(', ');

          const message = `<span style="color: ${proposingColor}; font-weight: bold;">${proposingPlayer.name}</span> traded ${offeredList} with <span style="color: ${acceptingColor}; font-weight: bold;">${acceptingPlayer.name}</span> for ${requestedList}`;

          return {
            ...prev,
            players: newPlayers,
            gameLog: [...prev.gameLog, {
              message,
              timestamp: new Date().toLocaleTimeString()
            }],
            turnState: {
              ...prev.turnState,
              tradeProposal: undefined
            }
          };
        }
      } else {
        aiPlayers.forEach(p => {
          newResponses[p.id] = 'rejected';
        });

        const proposingColor = getPlayerColorStyle(proposingPlayer.color);
        const message = `<span style="color: ${proposingColor}; font-weight: bold;">${proposingPlayer.name}</span>'s trade was rejected by all players`;
        addToLog(message);

        return {
          ...prev,
          turnState: {
            ...prev.turnState,
            tradeProposal: {
              ...tradeProposal,
              responses: newResponses
            }
          }
        };
      }

      return prev;
    });
  }, [gameState.players, getPlayerColorStyle, addToLog]);

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
    handleExecuteBankTrade,
    handleProposePlayerTrade
  };
};