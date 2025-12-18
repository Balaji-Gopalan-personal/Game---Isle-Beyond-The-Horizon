import React from 'react';
import { Play, SkipForward, Clock, ShoppingCart, ArrowLeft, Route, Repeat, Coins, X, CreditCard, Check } from 'lucide-react';
import { GameState, GameStep } from '../types/game';
import { loadBoardGraph } from '../graph/loadBoard';
import { canPlaceVillage, legalRoadEdgesFrom, whyNotVillage, initializeValidators } from '../engine/validators';
import { BoardSize } from '../data/boardConfigs';
import { BoomingEconomyPrompt, ClosedMarketPrompt, ResourceSwapPrompt, FreeUpgradePrompt, OpponentSelector } from './CardEffectPrompts';
import { CharacterAvatar } from './CharacterAvatar';
import { getPlayerColorHex } from '../utils/playerColors';

interface ActionPromptProps {
  gameState: GameState;
  currentStep: GameStep | undefined;
  onTriggerStep: (stepId: string) => void;
  onStartGame: () => void;
  onPlaceVillage?: (vertexId: string) => void;
  onPlaceRoad?: (playerId: string, vertexId: string) => void;
  boardSize?: BoardSize;
  selectedVertex?: number | null;
  firstRoadVertex?: number | null;
  onConfirmVillage?: () => void;
  onConfirmRoad?: () => void;
  onCancelSelection?: () => void;
  validRoadVertices?: number[];
  rollDice?: () => void;
  diceRoll?: { die1: number; die2: number; total: number } | null;
  isRollingDice?: boolean;
  showDiceResult?: boolean;
  waitingForConfirmation?: boolean;
  confirmDiceRoll?: () => void;
  onBuyItem?: (itemType: 'road' | 'village' | 'estate' | 'developmentCard') => void;
  onShowBuyMenu?: () => void;
  onEndTurn?: () => void;
  onCancelBuyItem?: () => void;
  onConfirmEstate?: (villageVertexId: number) => void;
  aiActionLoopActive?: boolean;
  roadPlacementError?: string | null;
  onOpenDiscardModal?: () => void;
  isDiscardPhase?: boolean;
  selectedCentre?: number | null;
  onConfirmRobberMove?: () => void;
  onCancelRobberSelection?: () => void;
  selectedStealTarget?: string | null;
  eligibleStealTargets?: any[];
  onSelectStealTarget?: (playerId: string) => void;
  onConfirmSteal?: () => void;
  onOpenDevCardHand?: () => void;
  onSkipPlayDevCards?: () => void;
  onSelectBoomingEconomyResource?: (resource: 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral') => void;
  onSelectClosedMarketResource?: (resource: 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral') => void;
  onSelectResourceSwapPlayer?: (playerId: string) => void;
  onConfirmBoomingEconomy?: () => void;
  onConfirmClosedMarket?: () => void;
  onConfirmResourceSwap?: () => void;
  onCancelCardEffect?: () => void;
  isVictoryModalMinimized?: boolean;
  onShowVictoryModal?: () => void;
  onOpenTradeModal?: () => void;
}

export const ActionPrompt: React.FC<ActionPromptProps> = ({
  gameState,
  currentStep,
  onTriggerStep,
  onStartGame,
  onPlaceVillage,
  onPlaceRoad,
  boardSize = 'standard',
  selectedVertex,
  firstRoadVertex,
  onConfirmVillage,
  onConfirmRoad,
  onCancelSelection,
  validRoadVertices = [],
  rollDice,
  diceRoll,
  isRollingDice = false,
  showDiceResult = false,
  waitingForConfirmation = false,
  confirmDiceRoll,
  onBuyItem,
  onShowBuyMenu,
  onEndTurn,
  onCancelBuyItem,
  onConfirmEstate,
  aiActionLoopActive = false,
  roadPlacementError = null,
  onOpenDiscardModal,
  isDiscardPhase = false,
  selectedCentre,
  onConfirmRobberMove,
  onCancelRobberSelection,
  selectedStealTarget,
  eligibleStealTargets = [],
  onSelectStealTarget,
  onConfirmSteal,
  onOpenDevCardHand,
  onSkipPlayDevCards,
  onSelectBoomingEconomyResource,
  onSelectClosedMarketResource,
  onSelectResourceSwapPlayer,
  onConfirmBoomingEconomy,
  onConfirmClosedMarket,
  onConfirmResourceSwap,
  onCancelCardEffect,
  isVictoryModalMinimized = false,
  onShowVictoryModal,
  onOpenTradeModal
}) => {
  const G = loadBoardGraph(boardSize);
  const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
  const canPlayerAct = currentPlayer?.isHuman && gameState.turnState.currentPlayerId === currentPlayer.id;
  const [selectedEdge, setSelectedEdge] = React.useState<string | null>(null);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const renderDiceDots = (value: number) => {
    const dotPositions: Record<number, string[]> = {
      1: ['center'],
      2: ['top-left', 'bottom-right'],
      3: ['top-left', 'center', 'bottom-right'],
      4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
      6: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right']
    };

    const positions = dotPositions[value] || [];

    return (
      <div className="relative w-full h-full">
        {positions.map((pos, idx) => {
          let positionClasses = '';
          switch(pos) {
            case 'top-left': positionClasses = 'top-1 left-1'; break;
            case 'top-right': positionClasses = 'top-1 right-1'; break;
            case 'middle-left': positionClasses = 'top-1/2 left-1 -translate-y-1/2'; break;
            case 'middle-right': positionClasses = 'top-1/2 right-1 -translate-y-1/2'; break;
            case 'center': positionClasses = 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'; break;
            case 'bottom-left': positionClasses = 'bottom-1 left-1'; break;
            case 'bottom-right': positionClasses = 'bottom-1 right-1'; break;
          }
          return (
            <div
              key={idx}
              className={`absolute w-1.5 h-1.5 bg-gray-800 rounded-full ${positionClasses}`}
            />
          );
        })}
      </div>
    );
  };

  const getPlayerColorStyle = (color: string) => {
    return getPlayerColorHex(color);
  };

  const getPlayerLightColor = (color: string) => {
    const lightColorMap: Record<string, string> = {
      black: '#F3F4F6',
      red: '#FFE5DD',
      orange: '#FFF0E0',
      yellow: '#FFFDE0',
      green: '#E0F8E0',
      blue: '#E0E8FF'
    };
    return lightColorMap[color] || '#FFFFFF';
  };

  const canAffordRoad = () => {
    if (!currentPlayer) return false;
    return currentPlayer.resources.clay >= 1 && currentPlayer.resources.lumber >= 1;
  };

  const canAffordVillage = () => {
    if (!currentPlayer) return false;
    return currentPlayer.resources.clay >= 1 &&
           currentPlayer.resources.lumber >= 1 &&
           currentPlayer.resources.grain >= 1 &&
           currentPlayer.resources.fabric >= 1;
  };

  const canAffordEstate = () => {
    if (!currentPlayer) return false;
    return currentPlayer.resources.grain >= 2 && currentPlayer.resources.mineral >= 3;
  };

  const canAffordDevelopmentCard = () => {
    if (!currentPlayer) return false;
    return currentPlayer.resources.grain >= 1 && currentPlayer.resources.fabric >= 1 && currentPlayer.resources.mineral >= 1;
  };

  const canAffordAnything = () => {
    return canAffordRoad() || canAffordVillage() || canAffordEstate() || canAffordDevelopmentCard();
  };

  const hasVillageToUpgrade = () => {
    if (!currentPlayer) return false;
    return gameState.villages.some(v => v.playerId === currentPlayer.id && v.type === 'settlement');
  };

  const hasAdjacentRoadEndpoint = () => {
    if (!currentPlayer) return false;
    const playerRoads = gameState.roads.filter(r => r.playerId === currentPlayer.id);
    const playerVillages = gameState.villages.filter(v => v.playerId === currentPlayer.id);

    const allPlayerVertices = new Set<number>();
    playerRoads.forEach(r => {
      allPlayerVertices.add(r.from);
      allPlayerVertices.add(r.to);
    });
    playerVillages.forEach(v => allPlayerVertices.add(v.vertexId));

    for (const vertexId of Array.from(allPlayerVertices)) {
      if (canPlaceVillage(vertexId, gameState.verticesOccupiedBy || {}, boardSize)) {
        return true;
      }
    }
    return false;
  };

  const hasPlayableDevelopmentCards = () => {
    if (!currentPlayer) return false;
    return currentPlayer.developmentCardsInHand.some(card => {
      if (card.name === 'Extra Point') return false;
      if (card.turnDrawn === currentPlayer.currentTurn) return false;
      if (card.name === 'Free Upgrade') {
        return gameState.villages.some(v => v.playerId === currentPlayer.id && v.type === 'settlement');
      }
      return true;
    });
  };

  React.useEffect(() => {
    if (validationError) {
      setValidationError(null);
    }
  }, [selectedVertex, selectedEdge]);

  return (
    <div className="card h-full flex flex-col overflow-hidden">
      <h2 className="text-lg font-bold text-gray-800 mb-2">Action Required</h2>

      <div className="flex-1">
      {gameState.phase === 'ended' && isVictoryModalMinimized && onShowVictoryModal && (
        <div className="text-center">
          <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <span className="text-2xl">🏆</span>
          </div>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">
            Game Over
          </h3>
          <p className="text-xs text-gray-600 mb-2">
            The game has ended. View the final results.
          </p>
          <button
            onClick={onShowVictoryModal}
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-3 rounded text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="text-lg">🏆</span>
            Show Final Game Results
          </button>
        </div>
      )}

      {gameState.phase === 'playing' && (
        <div className="text-center">
          {!diceRoll && !isRollingDice && !waitingForConfirmation && gameState.turnState.step === 'awaiting_dice_roll' && canPlayerAct && (
            <div className="mb-3">
              <div className="flex gap-2 justify-center mx-auto mb-2">
                <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                  <span className="text-2xl">🎲</span>
                </div>
                <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                  <span className="text-2xl">🎲</span>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">
                Roll Dice
              </h3>
              <p className="text-xs text-gray-600 mb-2">
                Click to roll two dice for resources
              </p>
              {rollDice && (
                <button
                  onClick={rollDice}
                  disabled={!rollDice}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-3 rounded text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-lg">🎲</span>
                  <span className="text-lg">🎲</span>
                  Roll Dice
                </button>
              )}
            </div>
          )}

          {!diceRoll && !isRollingDice && !waitingForConfirmation && gameState.turnState.step === 'awaiting_dice_roll' && !canPlayerAct && currentPlayer && !currentPlayer.isHuman && (
            <div className="mb-3">
              <div className="flex items-center justify-center gap-2 mb-2">
                {currentPlayer.character && (
                  <CharacterAvatar
                    character={currentPlayer.character}
                    color={currentPlayer.color}
                    size="sm"
                  />
                )}
                <div className="flex gap-2">
                  <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                    <span className="text-2xl">🎲</span>
                  </div>
                  <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                    <span className="text-2xl">🎲</span>
                  </div>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-800 mb-1">
                {currentPlayer.name} - Rolling Dice
              </h3>
              <p className="text-xs text-gray-600 mb-2">
                AI will roll automatically
              </p>
            </div>
          )}

          {isRollingDice && (
            <div className="flex items-center justify-center" style={{ minHeight: '200px' }}>
              <div className="flex flex-col items-center">
              <div className="flex justify-center gap-2 mb-2">
                <div className="w-10 h-10 border-2 rounded flex items-center justify-center font-bold text-xl" style={{
                  animation: 'bounce 0.5s ease-in-out infinite',
                  animationTimingFunction: 'cubic-bezier(0.4, 0, 0.6, 1)',
                  backgroundColor: currentPlayer ? getPlayerLightColor(currentPlayer.color) : '#ffffff',
                  borderColor: currentPlayer ? getPlayerColorStyle(currentPlayer.color) : '#1f2937'
                }}>
                  ?
                </div>
                <div className="w-10 h-10 border-2 rounded flex items-center justify-center font-bold text-xl" style={{
                  animation: 'bounce 0.5s ease-in-out infinite',
                  animationDelay: '0.1s',
                  animationTimingFunction: 'cubic-bezier(0.4, 0, 0.6, 1)',
                  backgroundColor: currentPlayer ? getPlayerLightColor(currentPlayer.color) : '#ffffff',
                  borderColor: currentPlayer ? getPlayerColorStyle(currentPlayer.color) : '#1f2937'
                }}>
                  ?
                </div>
              </div>
              <div className="text-sm font-semibold text-gray-800">
                Rolling dice...
              </div>
              </div>
            </div>
          )}

          {showDiceResult && diceRoll && (waitingForConfirmation || !currentPlayer?.isHuman) && (
            <div className="flex items-center justify-center" style={{ minHeight: '200px' }}>
              <div className="flex flex-col items-center">
              <div className="flex items-center justify-center gap-3">
                <div className="flex gap-2">
                  <div className="w-10 h-10 border-2 rounded flex items-center justify-center relative" style={{
                    backgroundColor: currentPlayer ? getPlayerLightColor(currentPlayer.color) : '#ffffff',
                    borderColor: currentPlayer ? getPlayerColorStyle(currentPlayer.color) : '#1f2937'
                  }}>
                    {renderDiceDots(diceRoll.die1)}
                  </div>
                  <div className="w-10 h-10 border-2 rounded flex items-center justify-center relative" style={{
                    backgroundColor: currentPlayer ? getPlayerLightColor(currentPlayer.color) : '#ffffff',
                    borderColor: currentPlayer ? getPlayerColorStyle(currentPlayer.color) : '#1f2937'
                  }}>
                    {renderDiceDots(diceRoll.die2)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-lg font-bold text-gray-800">
                    {diceRoll.total}
                  </div>
                  {currentPlayer?.isHuman && (
                    <button
                      onClick={confirmDiceRoll}
                      className={`${diceRoll.total === 7 ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-500 hover:bg-green-600'} text-white font-semibold p-2 rounded transition-all duration-200 flex items-center justify-center`}
                      title="Continue"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              </div>
            </div>
          )}

          {gameState.turnState.step === 'awaiting_discard' && canPlayerAct && isDiscardPhase && (
            <div className="flex items-center justify-center" style={{ minHeight: '100px' }}>
              <div className="flex flex-col items-center gap-3">
                <div className="text-sm font-semibold text-orange-600">
                  Discard required!
                </div>
                <button
                  onClick={onOpenDiscardModal}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded transition-all duration-200 flex items-center gap-2"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {gameState.turnState.step === 'awaiting_discard' && !canPlayerAct && (
            <div className="flex items-center justify-center" style={{ minHeight: '100px' }}>
              <div className="flex flex-col items-center gap-2">
                <div className="text-sm font-semibold text-gray-700">
                  Processing discards...
                </div>
                <div className="text-xs text-gray-600">
                  Please wait
                </div>
              </div>
            </div>
          )}

          {gameState.turnState.step === 'move_robber' && canPlayerAct && eligibleStealTargets.length === 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">
                Move the Robber
              </div>
              {selectedCentre ? (
                <div className="space-y-1">
                  <div className="text-xs text-gray-700">
                    Move robber to Centre {selectedCentre}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={onConfirmRobberMove}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={onCancelRobberSelection}
                      className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-600">
                  Click on a centre to move the robber
                </div>
              )}
            </div>
          )}

          {gameState.turnState.step === 'move_robber' && canPlayerAct && eligibleStealTargets.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-xs font-medium text-gray-700 text-center mb-0.5">
                Steal from a Player
              </div>

              <OpponentSelector
                opponents={eligibleStealTargets}
                selectedPlayerId={selectedStealTarget}
                onSelectPlayer={(playerId) => onSelectStealTarget?.(playerId)}
                showResourceCount={true}
              />

              {selectedStealTarget && (
                <div className="pt-0.5">
                  <button
                    onClick={onConfirmSteal}
                    className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-1.5 px-2 rounded text-xs transition-all duration-200"
                  >
                    Confirm
                  </button>
                </div>
              )}
            </div>
          )}

          {gameState.turnState.step === 'move_robber' && !canPlayerAct && (
            <div className="flex items-center justify-center" style={{ minHeight: '100px' }}>
              <div className="flex flex-col items-center gap-2">
                <div className="text-sm font-semibold text-gray-700">
                  {currentPlayer?.name} is moving the robber...
                </div>
                <div className="text-xs text-gray-600">
                  Please wait
                </div>
              </div>
            </div>
          )}

          {gameState.turnState.step === 'play_dev_cards' && canPlayerAct && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700 text-center">
                Play Development Card Phase
              </div>
              <div className="text-xs text-gray-600 text-center mb-2">
                Play a card or skip to continue
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onOpenDevCardHand}
                  disabled={!hasPlayableDevelopmentCards()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-3 rounded transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={hasPlayableDevelopmentCards() ? 'Open hand to play a card' : 'No playable cards available'}
                >
                  <Coins className="w-4 h-4" />
                  <span className="text-sm">Play Card</span>
                </button>
                <button
                  onClick={onSkipPlayDevCards}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-3 rounded transition-all duration-200 flex items-center justify-center gap-2"
                  title="Skip to Buy phase"
                >
                  <SkipForward className="w-4 h-4" />
                  <span className="text-sm">Skip</span>
                </button>
              </div>
            </div>
          )}

          {gameState.turnState.step === 'play_dev_cards' && !canPlayerAct && (
            <div className="flex items-center justify-center" style={{ minHeight: '100px' }}>
              <div className="flex flex-col items-center gap-2">
                <div className="text-sm font-semibold text-gray-700">
                  {currentPlayer?.name} - Play Card Phase
                </div>
                <div className="text-xs text-gray-600">
                  AI deciding...
                </div>
              </div>
            </div>
          )}

          {gameState.turnState.step === 'booming_economy_selection' && canPlayerAct && onSelectBoomingEconomyResource && (
            <BoomingEconomyPrompt
              resourcesSelected={(gameState.turnState.placementContext.resourcesSelected as string[]) || []}
              onSelectResource={onSelectBoomingEconomyResource}
              onConfirm={onConfirmBoomingEconomy}
              onCancel={onCancelCardEffect}
            />
          )}

          {gameState.turnState.step === 'closed_market_selection' && canPlayerAct && onSelectClosedMarketResource && (
            <ClosedMarketPrompt
              onSelectResource={onSelectClosedMarketResource}
              selectedResource={gameState.turnState.placementContext.selectedResource as 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral' | null}
              onConfirm={onConfirmClosedMarket}
              onCancel={onCancelCardEffect}
            />
          )}

          {gameState.turnState.step === 'resource_swap_selection' && canPlayerAct && onSelectResourceSwapPlayer && (
            <ResourceSwapPrompt
              players={gameState.players}
              currentPlayerId={gameState.currentPlayer}
              onSelectPlayer={onSelectResourceSwapPlayer}
              selectedPlayerId={gameState.turnState.placementContext.selectedPlayerId}
              onConfirm={onConfirmResourceSwap}
              onCancel={onCancelCardEffect}
            />
          )}

          {gameState.turnState.step === 'free_upgrade_selection' && canPlayerAct && (
            <FreeUpgradePrompt
              onCancel={onCancelCardEffect}
            />
          )}

          {!waitingForConfirmation && !isRollingDice && !aiActionLoopActive && gameState.turnState.step === 'main' && canPlayerAct && (
            <div>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <button
                  onClick={onShowBuyMenu}
                  disabled={!canAffordAnything()}
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-2 rounded transition-all duration-200 flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Buy Item"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span className="text-xs">Buy</span>
                </button>

                <button
                  onClick={onOpenTradeModal}
                  disabled={!currentPlayer || currentPlayer.resources.total === 0}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-2 rounded transition-all duration-200 flex flex-col items-center justify-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Trade"
                >
                  <Repeat className="w-4 h-4" />
                  <span className="text-xs">Trade</span>
                </button>

                <button
                  onClick={onEndTurn}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-2 rounded transition-all duration-200 flex flex-col items-center justify-center gap-0.5"
                  title="End Turn"
                >
                  <SkipForward className="w-4 h-4" />
                  <span className="text-xs">End</span>
                </button>
              </div>
            </div>
          )}

          {gameState.turnState.step === 'buy_item' && canPlayerAct && (
            <div>
              <div className="flex items-center justify-end mb-1">
                <button
                  onClick={onCancelBuyItem}
                  className="text-gray-600 hover:text-gray-800 p-1 rounded hover:bg-gray-100 transition-colors"
                  title="Back"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onBuyItem?.('road')}
                  disabled={!canAffordRoad()}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-1.5 px-2 rounded transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-0.5"
                  title={!canAffordRoad() ? 'Need 1 Clay + 1 Lumber' : 'Road: 1 Clay + 1 Lumber'}
                >
                  <Route className="w-3.5 h-3.5" />
                  <span className="text-xs">Road</span>
                </button>

                <button
                  onClick={() => onBuyItem?.('village')}
                  disabled={!canAffordVillage() || !hasAdjacentRoadEndpoint()}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-2 rounded transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-0.5"
                  title={!canAffordVillage() ? 'Need 1 Clay + 1 Lumber + 1 Grain + 1 Fabric' : !hasAdjacentRoadEndpoint() ? 'No valid placement locations' : 'Village: 1 Clay + 1 Lumber + 1 Grain + 1 Fabric'}
                >
                  <span className="text-sm leading-none">⌂</span>
                  <span className="text-xs">Village</span>
                </button>

                <button
                  onClick={() => onBuyItem?.('estate')}
                  disabled={!canAffordEstate() || !hasVillageToUpgrade()}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-1.5 px-2 rounded transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-0.5"
                  title={!canAffordEstate() ? 'Need 2 Grain + 3 Mineral' : !hasVillageToUpgrade() ? 'No villages to upgrade' : 'Estate: 2 Grain + 3 Mineral'}
                >
                  <span className="text-sm leading-none">⛫</span>
                  <span className="text-xs">Estate</span>
                </button>

                <button
                  onClick={() => onBuyItem?.('developmentCard')}
                  disabled={!canAffordDevelopmentCard()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-1.5 px-2 rounded transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-0.5"
                  title={!canAffordDevelopmentCard() ? 'Need 1 Grain + 1 Fabric + 1 Mineral' : 'Dev Card: 1 Grain + 1 Fabric + 1 Mineral'}
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span className="text-xs">Dev Card</span>
                </button>
              </div>
            </div>
          )}

          {gameState.turnState.step === 'place_road_gameplay' && canPlayerAct && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">
                Place Road
              </div>
              {roadPlacementError && (
                <div className="text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded p-2">
                  {roadPlacementError}
                </div>
              )}
              {!firstRoadVertex ? (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-gray-700">
                    Step 1: Select Starting Vertex
                  </div>
                  <div className="text-xs text-gray-600">
                    Click on a vertex you own (road endpoint or village)
                  </div>
                </div>
              ) : !selectedVertex ? (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-gray-700">
                    Step 2: Select Ending Vertex
                  </div>
                  <div className="text-xs text-gray-700">
                    From Vertex {firstRoadVertex}
                  </div>
                  <div className="text-xs text-gray-600">
                    Click on an empty adjacent vertex
                  </div>
                  <button
                    onClick={onCancelSelection}
                    className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200 w-full"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-xs text-gray-700">
                    From Vertex {firstRoadVertex} to Vertex {selectedVertex}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={onConfirmRoad}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={onCancelSelection}
                      className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {gameState.turnState.step === 'place_village_gameplay' && canPlayerAct && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">
                Place Village
              </div>
              {selectedVertex ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">
                    Vertex {selectedVertex}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={onConfirmVillage}
                      className="bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200"
                    >
                      ✓
                    </button>
                    <button
                      onClick={onCancelSelection}
                      className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-600">
                  Click on a highlighted vertex to place village
                </div>
              )}
            </div>
          )}

          {gameState.turnState.step === 'place_estate_gameplay' && canPlayerAct && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">
                Upgrade Village to Estate
              </div>
              {selectedVertex ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">
                    Vertex {selectedVertex}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => onConfirmEstate?.(selectedVertex)}
                      className="bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200"
                    >
                      ✓
                    </button>
                    <button
                      onClick={onCancelSelection}
                      className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-600">
                  Click on one of your villages to upgrade it
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {gameState.phase === 'setup' && (
        <div className="text-center">
          <div className="mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <Play className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Ready to Start</h3>
            <p className="text-xs text-gray-600 mb-2">
              All players are configured. Click below to begin the game.
            </p>
          </div>

          <button
            onClick={onStartGame}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-2 rounded text-sm transition-all duration-200 flex items-center justify-center gap-1"
          >
            <Play className="w-4 h-4" />
            Start Game
          </button>
        </div>
      )}

      {(gameState.phase === 'setup-phase-1' || gameState.phase === 'setup-phase-2') && (
        <div className="flex flex-col space-y-2">
          {canPlayerAct && (
            <div className="flex flex-col space-y-2">
              {gameState.turnState.step === 'init_place_village' && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-gray-700">
                    Place a Village
                  </div>

                  {selectedVertex ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">
                        Vertex {selectedVertex}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={onConfirmVillage}
                          className="bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200"
                        >
                          ✓
                        </button>
                        <button
                          onClick={onCancelSelection}
                          className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600">
                      Click on a highlighted vertex on the board
                    </div>
                  )}
                </div>
              )}

              {gameState.turnState.step === 'init_place_road' && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-gray-700">
                    Place a Road
                  </div>

                  {selectedVertex ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">
                        To Vertex {selectedVertex}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={onConfirmRoad}
                          className="bg-green-500 hover:bg-green-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200"
                        >
                          ✓
                        </button>
                        <button
                          onClick={onCancelSelection}
                          className="bg-gray-500 hover:bg-gray-600 text-white font-semibold py-1 px-2 rounded text-xs transition-all duration-200"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600">
                      Click on a highlighted vertex to connect road
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!canPlayerAct && currentPlayer && !currentPlayer.isHuman && (
            <div className="flex flex-col space-y-1">
              <div
                className="text-sm font-medium"
                style={{ color: getPlayerColorStyle(currentPlayer.color) }}
              >
                P{currentPlayer.order} {currentPlayer.name}
              </div>
              <div className="text-xs text-gray-600">
                - {gameState.phase === 'setup-phase-1' ? 'Setup Phase 1' : 'Setup Phase 2'}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
};
