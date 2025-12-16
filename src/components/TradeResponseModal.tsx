import React from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { TradeProposal, Player } from '../types/game';

interface TradeResponseModalProps {
  isOpen: boolean;
  tradeProposal: TradeProposal;
  players: Player[];
  onClose: () => void;
  onTryAgain: () => void;
}

export const TradeResponseModal: React.FC<TradeResponseModalProps> = ({
  isOpen,
  tradeProposal,
  players,
  onClose,
  onTryAgain
}) => {
  const resourceLabels: Record<string, string> = {
    clay: 'Clay',
    lumber: 'Lumber',
    grain: 'Grain',
    fabric: 'Fabric',
    mineral: 'Mineral',
  };

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

  if (!isOpen) return null;

  const allRejected = tradeProposal.respondingPlayers.every(
    playerId => tradeProposal.responses[playerId] === 'rejected'
  );

  const acceptingPlayer = tradeProposal.respondingPlayers.find(
    playerId => tradeProposal.responses[playerId] === 'accepted'
  );

  const getResourceList = (resources: any) => {
    return Object.entries(resources)
      .filter(([_, amount]) => (amount as number) > 0)
      .map(([resource, amount]) => `${amount} ${resourceLabels[resource]}`)
      .join(', ');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={(e) => e.stopPropagation()}
      />

      <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">
            {allRejected ? 'Trade Rejected' : 'Trade in Progress'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {allRejected && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-sm font-semibold text-red-800">
                All players rejected your trade proposal
              </span>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="text-sm font-semibold text-gray-700 mb-2">Your Proposal:</div>
              <div className="text-sm text-gray-600">
                <div className="mb-1">
                  <span className="font-semibold">Offered:</span> {getResourceList(tradeProposal.offeredResources)}
                </div>
                <div>
                  <span className="font-semibold">Requested:</span> {getResourceList(tradeProposal.requestedResources)}
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="text-sm font-semibold text-gray-700">Responses:</div>
              {tradeProposal.respondingPlayers.map(playerId => {
                const player = players.find(p => p.id === playerId);
                if (!player) return null;

                return (
                  <div
                    key={playerId}
                    className="flex items-center justify-between bg-white rounded-lg p-2 border border-gray-200"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: getPlayerColorStyle(player.color) }}
                      />
                      <span className="text-sm font-semibold text-gray-800">{player.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <X className="w-4 h-4 text-red-600" />
                      <span className="text-sm text-red-600 font-semibold">Rejected</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={onTryAgain}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {!allRejected && (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <div className="animate-spin">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
              </div>
            </div>
            <div className="text-lg font-semibold text-gray-800 mb-2">
              Waiting for responses...
            </div>
            <div className="text-sm text-gray-600">
              Players are considering your trade proposal
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
