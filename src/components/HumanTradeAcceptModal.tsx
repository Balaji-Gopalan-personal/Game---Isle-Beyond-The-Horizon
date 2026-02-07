import React from 'react';
import { Check, XCircle } from 'lucide-react';
import { TradeProposal, Player } from '../types/game';
import { useAssets } from '../contexts/AssetsContext';
import { getResourceImage } from '../utils/assetHelpers';

interface HumanTradeAcceptModalProps {
  isOpen: boolean;
  tradeProposal: TradeProposal;
  proposingPlayer: Player;
  humanPlayer: Player;
  onAccept: () => void;
  onReject: () => void;
}

export const HumanTradeAcceptModal: React.FC<HumanTradeAcceptModalProps> = ({
  isOpen,
  tradeProposal,
  proposingPlayer,
  humanPlayer,
  onAccept,
  onReject
}) => {
  const { assets } = useAssets();

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

  const canAcceptTrade = Object.entries(tradeProposal.requestedResources).every(
    ([resource, amount]) =>
      humanPlayer.resources[resource as keyof typeof humanPlayer.resources] >= (amount as number)
  );

  const getResourceList = (resources: any) => {
    return Object.entries(resources)
      .filter(([_, amount]) => (amount as number) > 0)
      .map(([resource, amount]) => (
        <div key={resource} className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded border border-gray-300 overflow-hidden flex-shrink-0"
            title={resourceLabels[resource]}
          >
            <img
              src={getResourceImage(assets, resource)}
              alt={resourceLabels[resource]}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-sm font-semibold text-gray-800">
            {amount} {resourceLabels[resource]}
          </span>
        </div>
      ));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={(e) => e.stopPropagation()}
      />

      <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 z-10">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-gray-800">Trade Proposal</h2>
        </div>

        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: getPlayerColorStyle(proposingPlayer.color) }}
            />
            <span className="text-sm font-bold text-gray-800">
              {proposingPlayer.name} (Player {proposingPlayer.order + 1})
            </span>
            <span className="text-xs text-gray-600">wants to trade with you</span>
          </div>
          <div className="text-xs text-blue-700 font-semibold">
            Your turn to respond ({tradeProposal.currentRespondingPlayerIndex + 1} of {tradeProposal.respondingPlayerOrder.length})
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <h3 className="text-sm font-bold text-red-800 mb-2">You Give:</h3>
            <div className="space-y-2">
              {getResourceList(tradeProposal.requestedResources)}
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <h3 className="text-sm font-bold text-green-800 mb-2">You Receive:</h3>
            <div className="space-y-2">
              {getResourceList(tradeProposal.offeredResources)}
            </div>
          </div>
        </div>

        <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
          <h3 className="text-sm font-bold text-gray-700 mb-2">Your Resources:</h3>
          <div className="grid grid-cols-5 gap-2">
            {(['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const).map((resource) => (
              <div key={resource} className="flex flex-col items-center">
                <div
                  className="w-8 h-8 rounded border border-gray-300 overflow-hidden"
                  title={resourceLabels[resource]}
                >
                  <img
                    src={getResourceImage(assets, resource)}
                    alt={resourceLabels[resource]}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-xs font-semibold text-gray-700 mt-1">
                  {humanPlayer.resources[resource]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {!canAcceptTrade && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm text-red-700 font-semibold">
                Insufficient resources to accept this trade
              </span>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onReject}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <XCircle className="w-5 h-5" />
            Reject
          </button>
          <button
            onClick={onAccept}
            disabled={!canAcceptTrade}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600 flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};
