import React from 'react';
import { Trophy, Minimize2, Home, Route, Shield, Star } from 'lucide-react';
import { PlayerVictoryStats } from '../utils/victoryDetection';
import { CharacterAvatar } from './CharacterAvatar';
import { useAssets } from '../contexts/AssetsContext';

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
  const { assets } = useAssets();

  if (!isVisible) return null;

  const areAssetsLoaded = assets.characters && Object.keys(assets.characters).length > 0;

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

  const getRankingBadgeStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return {
          backgroundColor: '#FFD700',
          color: '#000000',
          borderColor: '#B8860B'
        };
      case 2:
        return {
          backgroundColor: '#C0C0C0',
          color: '#000000',
          borderColor: '#A0A0A0'
        };
      case 3:
        return {
          backgroundColor: '#CD7F32',
          color: '#FFFFFF',
          borderColor: '#8B4513'
        };
      default:
        return {
          backgroundColor: '#FFFFFF',
          color: '#000000',
          borderColor: '#000000'
        };
    }
  };

  if (!areAssetsLoaded) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border-8 border-double" style={{ borderColor: '#FFD700', boxShadow: '0 0 40px rgba(255, 215, 0, 0.6), 0 0 80px rgba(255, 215, 0, 0.3), inset 0 0 20px rgba(255, 215, 0, 0.2)' }}>
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

          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-600 mb-4"></div>
              <p className="text-gray-600">Loading assets...</p>
            </div>
          </div>

          <div className="border-t p-6">
            <div className="flex justify-center mb-4">
              <img
                src="/images/logo.png"
                alt="Settle Island"
                className="h-16 w-auto"
              />
            </div>
            <div className="flex gap-4 justify-center">
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
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border-8 border-double" style={{ borderColor: '#FFD700', boxShadow: '0 0 40px rgba(255, 215, 0, 0.6), 0 0 80px rgba(255, 215, 0, 0.3), inset 0 0 20px rgba(255, 215, 0, 0.2)' }}>
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
          <div className="mb-4 text-center">
            <h2 className="text-2xl font-bold text-gray-800">Final Standings</h2>
            {(() => {
              const aiPlayer = allPlayerStats.find(p => !p.isHuman);
              const difficultyLevel = aiPlayer?.difficulty
                ? aiPlayer.difficulty.charAt(0).toUpperCase() + aiPlayer.difficulty.slice(1)
                : null;
              return difficultyLevel ? (
                <p className="text-sm text-gray-600 mt-1">{difficultyLevel} Difficulty</p>
              ) : null;
            })()}
          </div>

          <div className="space-y-3">
            {allPlayerStats.map((player, index) => {
              const rankBadgeStyle = getRankingBadgeStyle(index + 1);
              return (
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
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg border-2"
                        style={{
                          backgroundColor: rankBadgeStyle.backgroundColor,
                          color: rankBadgeStyle.color,
                          borderColor: rankBadgeStyle.borderColor
                        }}
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
                        <CharacterAvatar
                          character={player.character}
                          color={getPlayerColorStyle(player.playerColor)}
                          size="md"
                        />
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

                  <div className="flex items-center justify-start gap-6 text-sm flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-blue-600 text-lg">⌂</span>
                      <span className="text-gray-600">Villages:</span>
                      <span className="font-semibold text-gray-800">{player.villageCount}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-purple-600 text-lg">⛫</span>
                      <span className="text-gray-600">Estates (x2):</span>
                      <span className="font-semibold text-gray-800">{player.cityCount}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Route className="w-4 h-4 text-amber-600" />
                      <span className="text-gray-600">Longest Road:</span>
                      <span className="font-semibold text-gray-800">
                        +{player.hasLongestRoad ? player.longestRoadBonus : 0}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-red-600" />
                      <span className="text-gray-600">Largest Army:</span>
                      <span className="font-semibold text-gray-800">
                        +{player.hasLargestArmy ? player.largestArmyBonus : 0}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Star className="w-4 h-4 text-yellow-500" />
                      <span className="text-gray-600">Extra Points:</span>
                      <span className="font-semibold text-gray-800">{player.extraPointCards}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t p-6">
          <div className="flex justify-center mb-4">
            <img
              src="/images/logo.png"
              alt="Settle Island"
              className="h-16 w-auto"
            />
          </div>
          <div className="flex gap-4 justify-center">
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
    </div>
  );
};
