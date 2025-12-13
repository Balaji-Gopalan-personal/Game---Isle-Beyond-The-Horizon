import React from 'react';
import { GameState, Player } from '../types/game';
import { Coins, Package, Shield, Route, Wheat, Hammer, TreePine, Shirt, Mountain } from 'lucide-react';

interface PlayerDashboardProps {
  players: Player[];
  currentPlayerId: string;
  gameState: GameState;
  onOpenDevCardInventory?: () => void;
}

export const PlayerDashboard: React.FC<PlayerDashboardProps> = ({
  players,
  currentPlayerId,
  gameState,
  onOpenDevCardInventory
}) => {
  console.log('=== PLAYER DASHBOARD DEBUG ===');
  console.log('Players received:', players.map(p => ({ 
    name: p.name, 
    color: p.color, 
    order: p.order,
    isHuman: p.isHuman 
  })));
  
  // Sort players by their order instead of separating human/AI
  const sortedPlayers = [...players].sort((a, b) => a.order - b.order);
  console.log('Sorted players by order:', sortedPlayers.map(p => ({ 
    name: p.name, 
    order: p.order,
    isHuman: p.isHuman 
  })));

  const getResourceIcon = (resource: string) => {
    switch (resource) {
      case 'clay': return <Mountain className="w-3 h-3 text-orange-600" />;
      case 'lumber': return <TreePine className="w-3 h-3 text-green-600" />;
      case 'grain': return <Wheat className="w-3 h-3 text-yellow-600" />;
      case 'fabric': return <Shirt className="w-3 h-3 text-purple-600" />;
      case 'mineral': return <Hammer className="w-3 h-3 text-gray-600" />;
      default: return null;
    }
  };

  const truncateName = (name: string, maxLength: number = 12) => {
    return name.length > maxLength ? name.substring(0, maxLength - 1) + '…' : name;
  };

  const getPlayerColorStyle = (color: string) => {
    const colorMap: Record<string, string> = {
      red: '#EF4444',
      green: '#10B981', 
      blue: '#3B82F6',
      yellow: '#F59E0B',
      purple: '#8B5CF6',
      orange: '#F97316',
      black: '#374151'
    };
    return colorMap[color] || color;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-2 h-[calc(100vh-120px)] overflow-y-auto w-full">
      <h2 className="text-lg font-bold text-gray-800 mb-3 text-center">Players</h2>
      
      <div className="grid grid-cols-2 gap-2">
        {/* All Players in Order */}
        {sortedPlayers.map((player) => (
          <div
            key={player.id}
            className={`bg-white rounded-lg p-2 shadow-md border-2 relative ${
              currentPlayerId === player.id ? 'border-blue-500 font-bold' : 'border-gray-200'
            }`}
            style={{ minHeight: '140px' }}
          >
            {/* Longest Road Badge - positioned at top-left corner overlapping border */}
            {player.hasLongestRoad && (
              <div
                className="absolute bg-yellow-400 rounded-full p-1 shadow-md border-2 border-white"
                style={{
                  top: '-8px',
                  left: '-8px',
                  zIndex: 10
                }}
              >
                <Route className="w-3.5 h-3.5" style={{ color: '#854D0E' }} />
              </div>
            )}

            {/* Largest Army Badge - positioned at top-right corner overlapping border */}
            {player.hasLargestArmy && (
              <div
                className="absolute bg-red-500 rounded-full p-1 shadow-md border-2 border-white"
                style={{
                  top: '-8px',
                  right: '-8px',
                  zIndex: 10
                }}
              >
                <Shield className="w-3.5 h-3.5 text-white" />
              </div>
            )}

            {/* Line 1: Player number, name, score (human only), and turn */}
            <div className="flex justify-between items-center mb-2">
              <div
                className="font-semibold text-sm truncate"
                style={{ color: getPlayerColorStyle(player.color), maxWidth: '50%' }}
              >
                P{player.order} {truncateName(player.name, 8)}
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                {player.isHuman && (
                  <div className="font-semibold text-gray-800 flex items-center gap-1">
                    <span>{player.score}/{gameState.gameSettings?.pointsToWin || 10}</span>
                    {player.secretPoints > 0 && (
                      <span
                        className="text-amber-600 text-[10px]"
                        title={`${player.secretPoints} secret point${player.secretPoints !== 1 ? 's' : ''} from Extra Point cards`}
                      >
                        ({player.secretPoints}★)
                      </span>
                    )}
                  </div>
                )}
                <div className="text-gray-600">
                  T{player.currentTurn}
                </div>
              </div>
            </div>
            
            {/* Line 2: Different content for Human vs AI */}
            <div className="mb-2 h-8 flex items-center">
              {player.isHuman ? (
                /* Human Player: Resource counts spread across */
                <div className="flex items-center justify-between w-full text-xs font-medium">
                  <span style={{ color: '#EF4444' }}>C{player.resources?.clay || 0}</span>
                  <span style={{ color: '#10B981' }}>L{player.resources?.lumber || 0}</span>
                  <span style={{ color: '#F59E0B' }}>G{player.resources?.grain || 0}</span>
                  <span style={{ color: '#8B5CF6' }}>F{player.resources?.fabric || 0}</span>
                  <span style={{ color: '#6B7280' }}>M{player.resources?.mineral || 0}</span>
                </div>
              ) : (
                /* AI Player: Character image */
                <div className="flex justify-center w-full">
                  {player.character?.imageUrl && (
                    <img 
                      src={player.character.imageUrl} 
                      alt={player.character.name}
                      className="w-8 h-8 rounded-full object-cover border border-gray-300"
                    />
                  )}
                </div>
              )}
            </div>
            
            {/* Line 3: Icons in player color */}
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center justify-center" style={{ color: getPlayerColorStyle(player.color) }}>
                <Package className="w-3 h-3" />
              </div>
              <div className="flex items-center justify-center" style={{ color: getPlayerColorStyle(player.color) }}>
                <span className="text-xs">⌂</span>
              </div>
              <div className="flex items-center justify-center" style={{ color: getPlayerColorStyle(player.color) }}>
                <span className="text-xs">⛫</span>
              </div>
              <div className="flex items-center justify-center" style={{ color: getPlayerColorStyle(player.color) }}>
                <Route className="w-3 h-3" />
              </div>
              <div className="flex items-center justify-center" style={{ color: getPlayerColorStyle(player.color) }}>
                <Shield className="w-3 h-3" />
              </div>
              <div className="flex items-center justify-center" style={{ color: getPlayerColorStyle(player.color) }}>
                <Coins className="w-3 h-3" />
              </div>
            </div>

            {/* Line 4: Amounts under icons */}
            <div className="flex justify-between items-center text-xs text-gray-700">
              <div className="flex items-center justify-center">
                {(player.resources?.clay || 0) + (player.resources?.lumber || 0) + (player.resources?.grain || 0) + (player.resources?.fabric || 0) + (player.resources?.mineral || 0)}
              </div>
              <div className="flex items-center justify-center">
                {player.villageCount || 0}
              </div>
              <div className="flex items-center justify-center">
                {player.cityCount || 0}
              </div>
              <div className="flex items-center justify-center">
                {gameState.longestRoadLengths?.get(player.id) || 0}
              </div>
              <div className="flex items-center justify-center">
                {player.armyCount || 0}
              </div>
              <div
                className={`flex items-center justify-center ${
                  player.isHuman && (player.developmentCards || 0) > 0
                    ? 'cursor-pointer border border-amber-600 rounded px-1 hover:bg-amber-50 transition-colors'
                    : ''
                }`}
                onClick={() => {
                  if (player.isHuman && (player.developmentCards || 0) > 0 && onOpenDevCardInventory) {
                    onOpenDevCardInventory();
                  }
                }}
                title={player.isHuman && (player.developmentCards || 0) > 0 ? 'View development cards' : ''}
              >
                {player.developmentCards || 0}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};