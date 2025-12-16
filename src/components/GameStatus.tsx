import React from 'react';
import { GameState } from '../types/game';
import { Clock, Users, Target, Route, Shield, MapPin, Coins, Package } from 'lucide-react';

interface GameStatusProps {
  gameState: GameState;
}

export const GameStatus: React.FC<GameStatusProps> = ({ gameState }) => {
  const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
  const settings = gameState.gameSettings;

  // Calculate dev card deck status
  const deckSize = gameState.developmentCardDeck.length;
  const discardSize = gameState.developmentCardDiscard.length;
  const deckType = settings?.developmentCardDeck === 'expanded' ? 'Expanded' : 'Standard';

  const getPlayerColorStyle = (color: string) => {
    const colorMap: Record<string, string> = {
      black: '#000000',
      red: '#E52600',
      orange: '#E5983D',
      yellow: '#D3D521',
      green: '#009500',
      blue: '#0433FF'
    };
    return colorMap[color] || color;
  };

  return (
    <div className="card text-xs h-full flex flex-col overflow-hidden">
      <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
        <span className="text-lg">⌂</span>
        <span className="text-lg">⛫</span>
        Game Configuration
      </h3>

      <div className="space-y-1 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between">
          <span className="text-gray-600 flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Phase:
          </span>
          <span className="font-semibold capitalize" style={{ color: getPlayerColorStyle(currentPlayer?.color || 'black') }}>
            {gameState.phase === 'setup-phase-1' ? `Setup Phase 1 – ${currentPlayer?.name}'s T${currentPlayer?.currentTurn || 1}` :
             gameState.phase === 'setup-phase-2' ? `Setup Phase 2 – ${currentPlayer?.name}'s T${currentPlayer?.currentTurn || 2}` :
             gameState.phase === 'playing' ? `Gameplay Phase – ${currentPlayer?.name}'s T${currentPlayer?.currentTurn || 3}` :
             gameState.phase === 'ended' ? 'Game Ended' : 'Setup'}
          </span>
        </div>
        
        
        <div className="pt-1 border-t border-gray-200 space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="text-gray-600 flex items-center gap-1">
              <Target className="w-4 h-4" />
              Points to Win:
            </span>
            <span className="font-semibold text-gray-800">{settings?.pointsToWin || 10}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-600 flex items-center gap-1">
              <Route className="w-4 h-4" />
              Min Longest Road:
            </span>
            <span className="font-semibold text-gray-800">
              {settings?.longestRoadSize || 5}+ (+{settings?.longestRoadBonus || 2}pts)
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-600 flex items-center gap-1">
              <Shield className="w-4 h-4" />
              Min Largest Army:
            </span>
            <span className="font-semibold text-gray-800">
              {settings?.largestArmySize || 3}+ (+{settings?.largestArmyBonus || 2}pts)
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-600 flex items-center gap-1">
              <Package className="w-4 h-4" />
              Max Resource Hold:
            </span>
            <span className="font-semibold text-gray-800">
              {settings?.maxResourceHold === 0 ? 'No limit' : `${settings?.maxResourceHold || 7} resources`}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-600 flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              Trading Ports:
            </span>
            <span className="font-semibold text-gray-800">
              {settings?.tradingPortsEnabled ? `${settings?.numberOfTradingPorts || 5} ports` : 'Disabled'}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-gray-600 flex items-center gap-1">
              <Coins className="w-4 h-4" />
              Dev Card Deck:
            </span>
            <span className="font-semibold text-gray-800">
              {deckType} ({deckSize}{discardSize > 0 ? ` | ${discardSize} discarded` : ''})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};