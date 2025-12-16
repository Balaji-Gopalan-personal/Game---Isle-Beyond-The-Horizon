import React from 'react';
import { Trophy, Minimize2, Home, Route, Shield, Star } from 'lucide-react';
import { PlayerVictoryStats } from '../utils/victoryDetection';
import { CharacterAvatar } from './CharacterAvatar';

interface VictoryModalProps {
  winner: PlayerVictoryStats;
  allPlayerStats: PlayerVictoryStats[];
  isVisible: boolean;
  onMinimize: () => void;
  onNewGame: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  winner,
  allPlayerStats,
  isVisible,
  onMinimize,
  onNewGame
}) => {
  if (!isVisible) return null;

  const assets = useAssets();

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

  const getPlayerInitials = (name: string): string => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div
          className="rounded-t-2xl p-8 text-center relative"
          style={{ backgroundColor: getPlayerColorStyle(winner.playerColor) }}
        >
          <div className="flex items-center justify-center gap-4 mb-4">
            <Trophy className="w-16 h-16 text-yellow-300" />
            <h1 className="text-5xl font-bold text-white">Victory!</h1>
            <Trophy className="w-16 h-16 text-yellow-300" />
          </div>
          <div className="text-3xl font-bold text-white mb-2">
            Player {winner.playerNumber}: {winner.playerName}
          </div>
          <div className="text-xl text-white opacity-90">
            Wins with {winner.totalPoints} points!
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Final Standings</h2>

          <div className="space-y-3">
            {allPlayerStats.map((player, index) => (
              <div
                key={player.playerId}
                className="bg-gray-50 rounded-lg p-4 border-2"
                style={{
                  borderColor: index === 0 ? getPlayerColorStyle(player.playerColor) : '#E5E7EB'
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: getPlayerColorStyle(player.playerColor) }}
                    >
                      {index + 1}
                    </div>
                    {player.isHuman ? (
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold border-2"
                        style={{
                          backgroundColor: getPlayerColorStyle(player.playerColor),
                          borderColor: getPlayerColorStyle(player.playerColor)
                        }}
                      >
                        {getPlayerInitials(player.playerName)}
                      </div>
                    ) : (
                      <div className="relative">
                        <CharacterAvatar
                          character={player.character}
                          color={getPlayerColorStyle(player.playerColor)}
                          size="md"
                        />
                        <div
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-[10px] border border-white"
                          style={{ backgroundColor: getPlayerColorStyle(player.playerColor) }}
                        >
                          P{player.playerNumber}
                        </div>
                      </div>
                    )}
                    <div>
                      <div
                        className="text-lg font-bold"
                        style={{ color: getPlayerColorStyle(player.playerColor) }}
                      >
                        Player {player.playerNumber}: {player.playerName}
                      </div>
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-gray-800">
                    {player.totalPoints}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">Villages:</span>
                    <span className="font-semibold text-gray-800">{player.villageCount}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">Estates:</span>
                    <span className="font-semibold text-gray-800">{player.cityCount}</span>
                  </div>

                  {player.hasLongestRoad && (
                    <div className="flex items-center gap-2">
                      <Route className="w-4 h-4 text-yellow-600" />
                      <span className="text-gray-600">Longest Road:</span>
                      <span className="font-semibold text-gray-800">+{player.longestRoadBonus}</span>
                    </div>
                  )}

                  {player.hasLargestArmy && (
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-red-600" />
                      <span className="text-gray-600">Largest Army:</span>
                      <span className="font-semibold text-gray-800">+{player.largestArmyBonus}</span>
                    </div>
                  )}

                  {player.extraPointCards > 0 && (
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-blue-600" />
                      <span className="text-gray-600">Extra Points:</span>
                      <span className="font-semibold text-gray-800">{player.extraPointCards}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t p-6 flex gap-4 justify-center">
          <button
            onClick={onMinimize}
            className="flex items-center gap-2 px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors"
          >
            <Minimize2 className="w-5 h-5" />
            Minimize
          </button>

          <button
            onClick={onNewGame}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
          >
            <Home className="w-5 h-5" />
            New Game
          </button>
        </div>
      </div>
    </div>
  );
};
