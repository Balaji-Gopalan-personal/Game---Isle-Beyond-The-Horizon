import React, { useState, useEffect } from 'react';
import { useGameEngine } from './hooks/useGameEngine';
import { GameBoard } from './components/GameBoard';
import { PlayerDashboard } from './components/PlayerDashboard';
import { ActionPrompt } from './components/ActionPrompt';
import { EventsFeed } from './components/EventsFeed';
import { GameSetup } from './components/GameSetup';
import { GameStatus } from './components/GameStatus';
import { BuildingPriceGuide } from './components/BuildingPriceGuide';
import { GameTimer } from './components/GameTimer';
import { DiscardModal } from './components/DiscardModal';
import { DevelopmentCardsModal } from './components/DevelopmentCardsModal';
import { CardDrawnModal } from './components/CardDrawnModal';
import { DevCardHandModal } from './components/DevCardHandModal';
import { CardValidationErrorModal } from './components/CardValidationErrorModal';
import { VictoryModal } from './components/VictoryModal';
import { TradingModal } from './components/TradingModal';
import { TradeResponseModal } from './components/TradeResponseModal';
import { LoadingScreen } from './components/LoadingScreen';
import { Gamepad2 } from 'lucide-react';
import { BoardSize } from './data/boardConfigs';
import { AICharacter } from './data/aiCharacters';
import { loadBoardForSize } from './graph/loadBoard';
import { getAllPlayerStats } from './utils/victoryDetection';
import { useAssets } from './contexts/AssetsContext';
import { preloadCharacterAssets, preloadGameAssets } from './assets/assetLoader';

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

type AppPhase = 'loading-characters' | 'setup' | 'loading-game' | 'playing';

function App() {
  const [appPhase, setAppPhase] = useState<AppPhase>('loading-characters');
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [firstRoadVertex, setFirstRoadVertex] = useState<number | null>(null);
  const [roadPlacementError, setRoadPlacementError] = useState<string | null>(null);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);
  const [isDiscardModalMinimized, setIsDiscardModalMinimized] = useState(false);
  const [isDevCardsModalOpen, setIsDevCardsModalOpen] = useState(false);
  const [isVictoryModalMinimized, setIsVictoryModalMinimized] = useState(false);
  const [isTradingModalOpen, setIsTradingModalOpen] = useState(false);
  const [isTradeResponseModalOpen, setIsTradeResponseModalOpen] = useState(false);
  const [lastTradeMode, setLastTradeMode] = useState<'bank' | 'player'>('bank');
  const [lastPlayerName, setLastPlayerName] = useState<string>('');
  const [gameConfig, setGameConfig] = useState<{
    aiCount: number;
    selectedBoardSize: BoardSize;
    playerName: string;
    playerColor: string;
    aiCharacters: AICharacter[];
    playerOrder: number[];
    aiDifficulty: 'easy' | 'normal' | 'hard';
    aiColors: string[];
    gameSettings: GameSettings;
  } | null>(null);

  const { assets, setAssets, updateGameAssets } = useAssets();
  
  // Always call useGameEngine unconditionally to follow Rules of Hooks
  const gameEngine = useGameEngine(
    gameConfig?.aiCount || 2, 
    gameConfig?.selectedBoardSize || 'standard', 
    gameConfig ? {
      playerName: gameConfig.playerName,
      playerColor: gameConfig.playerColor,
      aiCharacters: gameConfig.aiCharacters,
      playerOrder: gameConfig.playerOrder,
      aiDifficulty: gameConfig.aiDifficulty,
      aiColors: gameConfig.aiColors,
      gameSettings: gameConfig.gameSettings,
      boardSize: gameConfig.selectedBoardSize
    } : undefined
  );
  
  const {
    gameState,
    getCurrentStep,
    triggerStep,
    startGame,
    rollDice,
    diceRoll,
    isRollingDice,
    showDiceResult,
    waitingForConfirmation,
    confirmDiceRoll,
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
    handleSkipPlayDevCards,
    handlePlayDevCard,
    handleBoomingEconomyResourceSelection,
    handleClosedMarketResourceSelection,
    handleResourceSwapPlayerSelection,
    handleFreeUpgradeVillageSelection,
    drawnCardForModal,
    setDrawnCardForModal,
    playedCardForModal,
    setPlayedCardForModal,
    cardValidationError,
    clearCardValidationError
  } = gameEngine;

  const handleStartWithConfig = async (
    aiPlayerCount: number,
    playerName: string,
    playerColor: string,
    boardSize: BoardSize,
    characters: AICharacter[],
    order: number[],
    difficulty: 'easy' | 'normal' | 'hard',
    aiColorsParam: string[],
    settings: GameSettings
  ) => {
    setLastPlayerName(playerName);
    setGameConfig({
      aiCount: aiPlayerCount,
      selectedBoardSize: boardSize,
      playerName,
      playerColor,
      aiCharacters: characters,
      playerOrder: order,
      aiDifficulty: difficulty,
      aiColors: aiColorsParam,
      gameSettings: settings
    });

    setAppPhase('loading-game');

    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Asset loading timeout')), 3000)
      );

      const gameAssets = await Promise.race([
        preloadGameAssets(settings.developmentCardDeck),
        timeout
      ]) as Awaited<ReturnType<typeof preloadGameAssets>>;

      updateGameAssets(gameAssets);
      setAppPhase('playing');
    } catch (error) {
      console.error('Failed to load game assets:', error);
      alert('Failed to load some game assets. The game may not display correctly. Check the console for details.');
      setAppPhase('playing');
    }
  };

  const handleNewGame = () => {
    setAppPhase('setup');
    setGameConfig(null);
    setIsVictoryModalMinimized(false);
    setSelectedVertex(null);
    setFirstRoadVertex(null);
    setRoadPlacementError(null);
    setIsDiscardModalOpen(false);
    setIsDiscardModalMinimized(false);
    setIsDevCardsModalOpen(false);
  };

  useEffect(() => {
    const loadCharacters = async () => {
      try {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Asset loading timeout')), 3000)
        );

        const characters = await Promise.race([
          preloadCharacterAssets(),
          timeout
        ]) as Awaited<ReturnType<typeof preloadCharacterAssets>>;

        setAssets({ characters });
        setAppPhase('setup');
      } catch (error) {
        console.error('Failed to load character assets:', error);
        alert('Failed to load some character assets. Character images may not display correctly. Check the console for details.');
        setAppPhase('setup');
      }
    };

    loadCharacters();
  }, [setAssets]);

  // Auto-open discard modal when human player needs to discard
  useEffect(() => {
    if (!gameState) return;

    console.log('DEBUG: Discard modal check - step:', gameState.turnState.step);
    console.log('DEBUG: Discard state:', discardState);
    console.log('DEBUG: Modal open state:', isDiscardModalOpen);

    // Check if we're in the discard phase
    if (gameState.turnState.step === 'awaiting_discard' &&
        discardState.playersNeedingDiscard.length > 0 &&
        discardState.currentDiscardIndex < discardState.playersNeedingDiscard.length) {

      const currentDiscardPlayerId = discardState.playersNeedingDiscard[discardState.currentDiscardIndex];
      const currentDiscardPlayer = gameState.players.find(p => p.id === currentDiscardPlayerId);

      console.log('DEBUG: Current discard player:', currentDiscardPlayer?.name, 'isHuman:', currentDiscardPlayer?.isHuman);

      // If the current player in discard queue is human and modal is not open and not minimized, open it
      if (currentDiscardPlayer && currentDiscardPlayer.isHuman && !isDiscardModalOpen && !isDiscardModalMinimized) {
        console.log('DEBUG: Auto-opening discard modal for human player:', currentDiscardPlayer.name);
        setIsDiscardModalOpen(true);
      }
    } else {
      // Reset minimized state when discard phase ends
      setIsDiscardModalMinimized(false);
    }
  }, [gameState?.turnState.step, discardState.playersNeedingDiscard, discardState.currentDiscardIndex, isDiscardModalOpen, isDiscardModalMinimized, gameState?.players]);

  if (appPhase === 'loading-characters') {
    return <LoadingScreen message="Loading..." />;
  }

  if (appPhase === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="w-full max-w-none mx-auto">
          <GameSetup
            onStartWithConfig={handleStartWithConfig}
            defaultPlayerName={lastPlayerName}
          />
        </div>
      </div>
    );
  }

  if (appPhase === 'loading-game') {
    return <LoadingScreen message="Loading..." />;
  }

  if (!gameConfig) {
    return <LoadingScreen message="Loading..." />;
  }

  const handleTriggerStep = (stepId: string) => {
    if (triggerStep) {
      triggerStep({
        stepId,
        playerId: gameState.currentPlayer
      });
    }
  };

  const handleVertexClick = (vertexId: number) => {
    if (gameState?.phase === 'ended') return;

    console.log('DEBUG: handleVertexClick called with vertexId:', vertexId);
    console.log('DEBUG: Current selectedVertex:', selectedVertex);
    console.log('DEBUG: Current game phase:', gameState?.phase);
    console.log('DEBUG: Current turn step:', gameState?.turnState?.step);
    console.log('DEBUG: Current player:', gameState?.currentPlayer);
    console.log('Vertex clicked:', vertexId);

    // Clear any previous errors
    setRoadPlacementError(null);

    // For gameplay phase road placement, require two vertices
    if (gameState?.turnState?.step === 'place_road_gameplay') {
      if (!firstRoadVertex) {
        // First vertex selected - must be owned by player
        const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
        if (!currentPlayer) return;

        // Get all player-owned vertices
        const playerRoads = gameState.roads.filter(r => r.playerId === currentPlayer.id);
        const playerVillages = gameState.villages.filter(v => v.playerId === currentPlayer.id);
        const allPlayerVertices = new Set<number>();

        playerRoads.forEach(r => {
          allPlayerVertices.add(r.from);
          allPlayerVertices.add(r.to);
        });
        playerVillages.forEach(v => allPlayerVertices.add(v.vertexId));

        // Validate that the clicked vertex is owned by player
        if (!allPlayerVertices.has(vertexId)) {
          console.log('DEBUG: Invalid first vertex - not owned by player:', vertexId);
          return;
        }

        // Check if this vertex has any valid adjacent empty vertices
        const boardData = loadBoardForSize(gameConfig?.selectedBoardSize || 'standard');
        const neighbors = boardData.adjacencyMap[vertexId] || [];
        const hasValidNeighbor = neighbors.some(neighborId => {
          const edgeId = vertexId < neighborId ? `${vertexId}__${neighborId}` : `${neighborId}__${vertexId}`;
          return !gameState.edgesOccupiedBy[edgeId];
        });

        if (!hasValidNeighbor) {
          console.log('DEBUG: Selected vertex has no valid adjacent vertices:', vertexId);
          setRoadPlacementError(`Vertex ${vertexId} has no available adjacent vertices. Please select a different vertex.`);
          setFirstRoadVertex(null);
          return;
        }

        setFirstRoadVertex(vertexId);
        console.log('DEBUG: First road vertex set to:', vertexId);
      } else {
        // Second vertex selected - must be empty and adjacent to first
        const boardData = loadBoardForSize(gameConfig?.selectedBoardSize || 'standard');
        const neighbors = boardData.adjacencyMap[firstRoadVertex] || [];

        // Validate that clicked vertex is adjacent to first vertex
        if (!neighbors.includes(vertexId)) {
          console.log('DEBUG: Invalid second vertex - not adjacent to first:', vertexId);
          return;
        }

        // Validate that edge is not already occupied
        const edgeId = firstRoadVertex < vertexId ? `${firstRoadVertex}__${vertexId}` : `${vertexId}__${firstRoadVertex}`;
        if (gameState.edgesOccupiedBy[edgeId]) {
          console.log('DEBUG: Invalid second vertex - edge already occupied:', vertexId);
          return;
        }

        setSelectedVertex(vertexId);
        console.log('DEBUG: Second road vertex set to:', vertexId);
      }
    } else if (gameState?.turnState?.step === 'free_upgrade_selection') {
      // For free upgrade, directly call the handler
      handleConfirmFreeUpgrade(vertexId);
    } else {
      // For all other cases, use single vertex selection
      setSelectedVertex(vertexId);
      console.log('DEBUG: selectedVertex set to:', vertexId);
    }
  };

  const handleConfirmVillage = () => {
    if (selectedVertex && gameEngine.placeVillageAtVertex) {
      console.log('DEBUG: Confirming village placement at vertex:', selectedVertex);
      console.log('DEBUG: gameEngine.placeVillageAtVertex exists:', !!gameEngine.placeVillageAtVertex);
      console.log('DEBUG: Current game state phase:', gameState.phase);
      console.log('DEBUG: Current turn state:', gameState.turnState);
      console.log('DEBUG: Current player:', gameState.currentPlayer);
      gameEngine.placeVillageAtVertex(String(selectedVertex));
      setSelectedVertex(null);
    }
    else {
      console.log('DEBUG: Cannot confirm village - selectedVertex:', selectedVertex, 'placeVillageAtVertex:', !!gameEngine.placeVillageAtVertex);
    }
  };

  const handleConfirmRoad = () => {
    console.log('DEBUG: handleConfirmRoad called');
    console.log('DEBUG: selectedVertex:', selectedVertex);
    console.log('DEBUG: gameEngine.placeRoadByEdgeId exists:', !!gameEngine.placeRoadByEdgeId);
    console.log('DEBUG: Current game state turn:', gameState?.turnState);
    console.log('DEBUG: Last village vertex:', gameState?.turnState?.placementContext?.lastVillageVertex);
    
    if (selectedVertex && gameEngine.placeRoadByEdgeId) {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      console.log('DEBUG: Current player found:', !!currentPlayer, currentPlayer?.name);
      if (currentPlayer) {
        console.log('DEBUG: Calling placeRoadByEdgeId with:', currentPlayer.id, selectedVertex);
        gameEngine.placeRoadByEdgeId(currentPlayer.id, selectedVertex);
        setSelectedVertex(null);
      }
    }
    else {
      console.log('DEBUG: Cannot confirm road - selectedVertex:', selectedVertex, 'placeRoadByEdgeId:', !!gameEngine.placeRoadByEdgeId);
    }
  };

  const handleCancelSelection = () => {
    setSelectedVertex(null);
    setFirstRoadVertex(null);
    setRoadPlacementError(null);
  };

  const handleConfirmRoadGameplay = () => {
    if (firstRoadVertex && selectedVertex && gameEngine.handlePlaceRoadGameplay) {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (currentPlayer) {
        gameEngine.handlePlaceRoadGameplay(currentPlayer.id, firstRoadVertex, selectedVertex);
        setSelectedVertex(null);
        setFirstRoadVertex(null);
      }
    }
  };

  const handleConfirmVillageGameplay = () => {
    if (selectedVertex && gameEngine.handlePlaceVillageGameplay) {
      gameEngine.handlePlaceVillageGameplay(selectedVertex);
      setSelectedVertex(null);
    }
  };

  const handleConfirmEstateGameplay = (vertexId: number) => {
    if (gameEngine.handlePlaceEstateGameplay) {
      gameEngine.handlePlaceEstateGameplay(vertexId);
      setSelectedVertex(null);
    }
  };

  const handleConfirmFreeUpgrade = (vertexId: number) => {
    if (handleFreeUpgradeVillageSelection) {
      handleFreeUpgradeVillageSelection(vertexId);
      setSelectedVertex(null);
    }
  };

  // Robber movement handlers
  const handleCentreClick = (centreId: number) => {
    if (gameState?.phase === 'ended') return;

    console.log('DEBUG: Centre clicked:', centreId);
    if (gameState.turnState.step === 'move_robber') {
      setSelectedCentre(centreId);
    }
  };

  const handleConfirmRobberMove = () => {
    if (selectedCentre !== null) {
      handleMoveRobber(selectedCentre);
      setSelectedCentre(null);
    }
  };

  const handleCancelRobberSelection = () => {
    setSelectedCentre(null);
  };

  const handleSelectStealTarget = (playerId: string) => {
    setSelectedStealTarget(playerId);
  };

  const handleConfirmSteal = () => {
    if (selectedStealTarget) {
      handleStealResource(selectedStealTarget);
    }
  };

  // Get valid road vertices for highlighting
  const getValidRoadVertices = () => {
    console.log('DEBUG: getValidRoadVertices called');
    console.log('DEBUG: Current turn step:', gameState?.turnState?.step);

    if (gameState.turnState.step === 'init_place_road' && gameState.turnState.placementContext.lastVillageVertex) {
      const boardData = loadBoardForSize(gameConfig?.selectedBoardSize || 'standard');
      const lastVillage = gameState.turnState.placementContext.lastVillageVertex;
      const adjacentVertices = boardData.adjacencyMap[lastVillage] || [];

      return adjacentVertices.filter(vertexId => {
        const edgeId = lastVillage < vertexId ? `${lastVillage}__${vertexId}` : `${vertexId}__${lastVillage}`;
        return !gameState.edgesOccupiedBy[edgeId];
      });
    }

    if (gameState.turnState.step === 'place_road_gameplay') {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (!currentPlayer) return [];

      // Step 1: If no first vertex selected yet, show all player-owned vertices
      if (!firstRoadVertex) {
        const playerRoads = gameState.roads.filter(r => r.playerId === currentPlayer.id);
        const playerVillages = gameState.villages.filter(v => v.playerId === currentPlayer.id);
        const allPlayerVertices = new Set<number>();

        playerRoads.forEach(r => {
          allPlayerVertices.add(r.from);
          allPlayerVertices.add(r.to);
        });
        playerVillages.forEach(v => allPlayerVertices.add(v.vertexId));

        // Filter to only show vertices that have at least one valid adjacent empty vertex
        const boardData = loadBoardForSize(gameConfig?.selectedBoardSize || 'standard');
        const validStartVertices: number[] = [];

        for (const vertexId of Array.from(allPlayerVertices)) {
          const neighbors = boardData.adjacencyMap[vertexId] || [];
          const hasValidNeighbor = neighbors.some(neighborId => {
            const edgeId = vertexId < neighborId ? `${vertexId}__${neighborId}` : `${neighborId}__${vertexId}`;
            return !gameState.edgesOccupiedBy[edgeId];
          });

          if (hasValidNeighbor) {
            validStartVertices.push(vertexId);
          }
        }

        return validStartVertices;
      }

      // Step 2: If first vertex is selected, show only empty adjacent vertices
      const boardData = loadBoardForSize(gameConfig?.selectedBoardSize || 'standard');
      const neighbors = boardData.adjacencyMap[firstRoadVertex] || [];
      const validEndVertices: number[] = [];

      for (const neighborId of neighbors) {
        const edgeId = firstRoadVertex < neighborId ? `${firstRoadVertex}__${neighborId}` : `${neighborId}__${firstRoadVertex}`;
        if (!gameState.edgesOccupiedBy[edgeId]) {
          validEndVertices.push(neighborId);
        }
      }

      return validEndVertices;
    }

    if (gameState.turnState.step === 'place_village_gameplay') {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (!currentPlayer) return [];

      const playerRoads = gameState.roads.filter(r => r.playerId === currentPlayer.id);
      const allPlayerVertices = new Set<number>();

      playerRoads.forEach(r => {
        allPlayerVertices.add(r.from);
        allPlayerVertices.add(r.to);
      });

      const validVertices: number[] = [];
      for (const vertexId of Array.from(allPlayerVertices)) {
        if (!gameState.verticesOccupiedBy[vertexId]) {
          const boardData = loadBoardForSize(gameConfig?.selectedBoardSize || 'standard');
          const neighbors = boardData.adjacencyMap[vertexId] || [];
          const hasAdjacentVillage = neighbors.some(n => gameState.verticesOccupiedBy[n]);
          if (!hasAdjacentVillage) {
            validVertices.push(vertexId);
          }
        }
      }

      return validVertices;
    }

    if (gameState.turnState.step === 'place_estate_gameplay') {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (!currentPlayer) return [];

      return gameState.villages
        .filter(v => v.playerId === currentPlayer.id && v.type === 'settlement')
        .map(v => v.vertexId);
    }

    if (gameState.turnState.step === 'free_upgrade_selection') {
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (!currentPlayer) return [];

      return gameState.villages
        .filter(v => v.playerId === currentPlayer.id && v.type === 'settlement')
        .map(v => v.vertexId);
    }

    return [];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full">
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="text-2xl">⌂</span>
            <h1 className="text-3xl font-bold text-gray-800">Settle the Island</h1>
            <span className="text-2xl">⛫</span>
          </div>
        </header>

        <div className="grid grid-cols-4 gap-6" style={{ height: 'calc(100vh - 200px)' }}>
          {/* Left Column - Player Dashboard (expanded width) */}
          <div className="col-span-1 order-1 px-1 flex flex-col" style={{ height: '100%' }}>
            <PlayerDashboard
              players={gameState.players}
              currentPlayerId={gameState.currentPlayer}
              gameState={gameState}
              onOpenDevCardInventory={() => setIsDevCardsModalOpen(true)}
            />
          </div>

          {/* Center Columns - Game Board and Action */}
          <div className="col-span-2 flex flex-col gap-4 order-2 px-2" style={{ width: '100%', margin: '0 auto', height: '100%' }}>
            {/* Game Board - Increased height */}
            <div className="h-[600px] flex-shrink-0">
              <GameBoard
                gameState={gameState}
                boardSize={gameConfig.selectedBoardSize}
                onVertexClick={handleVertexClick}
                selectedVertex={selectedVertex}
                validRoadVertices={getValidRoadVertices()}
                firstRoadVertex={firstRoadVertex}
                onCentreClick={handleCentreClick}
                selectedCentre={selectedCentre}
              />
            </div>

            {/* Building Price Guide and Timer - Fills remaining space */}
            <div className="flex-1 min-h-0 flex gap-4">
              <div className="flex-1">
                <BuildingPriceGuide />
              </div>
              <div style={{ width: '200px' }}>
                <GameTimer
                  isGameStarted={gameState.phase !== 'setup'}
                  isGameEnded={gameState.phase === 'ended'}
                />
              </div>
            </div>
          </div>

          {/* Right Column - Action, Game Status and Events */}
          <div className="col-span-1 order-3 flex flex-col px-1 right-column" style={{ justifyContent: 'flex-start', gap: '0.5rem', height: '100%' }}>
            {/* Action Prompt - Fixed height */}
            <div style={{ height: '200px', flexShrink: 0 }}>
              {gameEngine && (
                <ActionPrompt
                  gameState={gameState}
                  currentStep={gameEngine.getCurrentStep()}
                  onTriggerStep={handleTriggerStep}
                  onStartGame={gameEngine.startGame}
                  onPlaceVillage={gameEngine.placeVillageAtVertex}
                  onPlaceRoad={gameEngine.placeRoadByEdgeId}
                  boardSize={gameConfig.selectedBoardSize}
                  selectedVertex={selectedVertex}
                  firstRoadVertex={firstRoadVertex}
                  onConfirmVillage={gameState.turnState.step === 'place_village_gameplay' ? handleConfirmVillageGameplay : handleConfirmVillage}
                  onConfirmRoad={gameState.turnState.step === 'place_road_gameplay' ? handleConfirmRoadGameplay : handleConfirmRoad}
                  onCancelSelection={handleCancelSelection}
                  validRoadVertices={getValidRoadVertices()}
                  rollDice={rollDice}
                  diceRoll={diceRoll}
                  isRollingDice={isRollingDice}
                  showDiceResult={showDiceResult}
                  waitingForConfirmation={waitingForConfirmation}
                  confirmDiceRoll={confirmDiceRoll}
                  onShowBuyMenu={gameEngine.onShowBuyMenu}
                  onBuyItem={gameEngine.onBuyItem}
                  onEndTurn={gameEngine.onEndTurn}
                  onCancelBuyItem={gameEngine.onCancelBuyItem}
                  onConfirmEstate={handleConfirmEstateGameplay}
                  aiActionLoopActive={aiActionLoopActive}
                  roadPlacementError={roadPlacementError}
                  onOpenDiscardModal={() => {
                    setIsDiscardModalOpen(true);
                    setIsDiscardModalMinimized(false);
                  }}
                  isDiscardPhase={gameState.turnState.step === 'awaiting_discard' && discardState.playersNeedingDiscard.length > 0}
                  selectedCentre={selectedCentre}
                  onConfirmRobberMove={handleConfirmRobberMove}
                  onCancelRobberSelection={handleCancelRobberSelection}
                  selectedStealTarget={selectedStealTarget}
                  eligibleStealTargets={eligibleStealTargets}
                  onSelectStealTarget={handleSelectStealTarget}
                  onConfirmSteal={handleConfirmSteal}
                  onOpenDevCardHand={() => setIsDevCardsModalOpen(true)}
                  onSkipPlayDevCards={handleSkipPlayDevCards}
                  onSelectBoomingEconomyResource={handleBoomingEconomyResourceSelection}
                  onSelectClosedMarketResource={handleClosedMarketResourceSelection}
                  onSelectResourceSwapPlayer={handleResourceSwapPlayerSelection}
                  onConfirmBoomingEconomy={gameEngine.handleConfirmBoomingEconomy}
                  onConfirmClosedMarket={gameEngine.handleConfirmClosedMarket}
                  onConfirmResourceSwap={gameEngine.handleConfirmResourceSwap}
                  onCancelCardEffect={gameEngine.handleCancelCardEffect}
                  isVictoryModalMinimized={isVictoryModalMinimized}
                  onShowVictoryModal={() => setIsVictoryModalMinimized(false)}
                  onOpenTradeModal={() => setIsTradingModalOpen(true)}
                />
              )}
            </div>

            {/* Game Status - Fixed height */}
            <div style={{ height: '200px', flexShrink: 0 }}>
              <GameStatus gameState={gameState} />
            </div>

            {/* Events Feed - Fills remaining space to bottom */}
            <div style={{ flex: '1 1 0', minHeight: 0 }}>
              <EventsFeed events={gameState.gameLog} />
            </div>
          </div>
        </div>
      </div>

      {/* Discard Modal */}
      {isDiscardModalOpen && discardState.playersNeedingDiscard.length > 0 && (() => {
        const currentPlayerId = discardState.playersNeedingDiscard[discardState.currentDiscardIndex];
        const currentPlayer = gameState.players.find(p => p.id === currentPlayerId);

        if (!currentPlayer || !currentPlayer.isHuman) return null;

        const discardAmount = calculateDiscardAmount(currentPlayer.resources.total);

        return (
          <DiscardModal
            isOpen={isDiscardModalOpen}
            playerName={currentPlayer.name}
            playerColor={currentPlayer.color}
            currentResources={currentPlayer.resources}
            discardAmount={discardAmount}
            onConfirm={(selection) => {
              handleHumanDiscard(selection);
              setIsDiscardModalOpen(false);
              setIsDiscardModalMinimized(false);
            }}
            onMinimize={() => {
              setIsDiscardModalOpen(false);
              setIsDiscardModalMinimized(true);
            }}
          />
        );
      })()}

      {/* Card Drawn Modal */}
      {drawnCardForModal && (
        <CardDrawnModal
          card={drawnCardForModal}
          isVisible={true}
          onClose={() => setDrawnCardForModal(null)}
        />
      )}

      {/* AI Played Card Modal */}
      {playedCardForModal && (
        <CardDrawnModal
          card={playedCardForModal.card}
          isVisible={true}
          onClose={() => setPlayedCardForModal(null)}
          mode="played"
          playerName={playedCardForModal.playerName}
          playerNumber={playedCardForModal.playerNumber}
          playerColor={playedCardForModal.playerColor}
        />
      )}

      {/* Dev Card Hand Modal */}
      {isDevCardsModalOpen && (() => {
        const humanPlayer = gameState.players.find(p => p.isHuman);
        if (!humanPlayer) return null;

        const isInPlayPhase = gameState.turnState.step === 'play_dev_cards' &&
                             gameState.currentPlayer === humanPlayer.id;

        return (
          <DevCardHandModal
            cards={humanPlayer.developmentCardsInHand}
            isVisible={true}
            onClose={() => setIsDevCardsModalOpen(false)}
            onPlayCard={handlePlayDevCard}
            isPlayPhase={isInPlayPhase}
            currentTurn={humanPlayer.currentTurn}
            guardsPlayedThisTurn={humanPlayer.guardsPlayedThisTurn}
          />
        );
      })()}

      {/* Card Validation Error Modal */}
      <CardValidationErrorModal
        isVisible={!!cardValidationError}
        errorMessage={cardValidationError || ''}
        onClose={clearCardValidationError}
      />

      {/* Victory Modal */}
      {gameState.phase === 'ended' && !isVictoryModalMinimized && (() => {
        const allPlayerStats = getAllPlayerStats(gameState);
        const winner = allPlayerStats[0];

        return (
          <VictoryModal
            winner={winner}
            allPlayerStats={allPlayerStats}
            isVisible={true}
            onMinimize={() => setIsVictoryModalMinimized(true)}
            onNewGame={handleNewGame}
          />
        );
      })()}

      {/* Trading Modals */}
      {appPhase === 'playing' && gameState.currentPlayer && (
        <>
          <TradingModal
            isOpen={isTradingModalOpen}
            gameState={gameState}
            currentPlayer={gameState.players.find(p => p.id === gameState.currentPlayer)!}
            onClose={() => setIsTradingModalOpen(false)}
            onExecuteBankTrade={(offeringResource, offeringAmount, requestedResource) => {
              gameEngine.handleExecuteBankTrade(offeringResource, offeringAmount, requestedResource);
              setLastTradeMode('bank');
              setIsTradingModalOpen(false);
            }}
            onProposePlayerTrade={(offeredResources, requestedResources) => {
              gameEngine.handleProposePlayerTrade(offeredResources, requestedResources);
              setLastTradeMode('player');
              setIsTradingModalOpen(false);
              setIsTradeResponseModalOpen(true);
            }}
            activeTradeProposal={gameState.turnState.tradeProposal}
            initialMode={lastTradeMode}
          />

          {gameState.turnState.tradeProposal && (
            <TradeResponseModal
              isOpen={isTradeResponseModalOpen}
              tradeProposal={gameState.turnState.tradeProposal}
              players={gameState.players}
              onClose={() => {
                setIsTradeResponseModalOpen(false);
              }}
              onTryAgain={() => {
                setIsTradeResponseModalOpen(false);
                setIsTradingModalOpen(true);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;