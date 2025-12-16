import React, { useState, useEffect } from 'react';
import { X, Minus, Plus, Users, Building2, Sparkles } from 'lucide-react';
import { GameState, Player, Resources, TradeProposal } from '../types/game';
import { getAllAvailableTradeRates, canExecuteBankTrade, canProposePlayerTrade, getTradeRateDisplay, ResourceType } from '../utils/tradingUtils';
import { useAssets } from '../contexts/AssetsContext';
import { getResourceImage } from '../utils/assetHelpers';

interface TradingModalProps {
  isOpen: boolean;
  gameState: GameState;
  currentPlayer: Player;
  onClose: () => void;
  onExecuteBankTrade: (offeringResource: ResourceType, offeringAmount: number, requestedResource: ResourceType) => void;
  onProposePlayerTrade: (offeredResources: any, requestedResources: any) => void;
  activeTradeProposal?: TradeProposal;
}

type TradeMode = 'bank' | 'player';

interface ResourceSelection {
  clay: number;
  lumber: number;
  grain: number;
  fabric: number;
  mineral: number;
}

export const TradingModal: React.FC<TradingModalProps> = ({
  isOpen,
  gameState,
  currentPlayer,
  onClose,
  onExecuteBankTrade,
  onProposePlayerTrade,
  activeTradeProposal
}) => {
  const { assets } = useAssets();
  const [tradeMode, setTradeMode] = useState<TradeMode>('bank');
  const [offeredResources, setOfferedResources] = useState<ResourceSelection>({
    clay: 0,
    lumber: 0,
    grain: 0,
    fabric: 0,
    mineral: 0
  });
  const [requestedResources, setRequestedResources] = useState<ResourceSelection>({
    clay: 0,
    lumber: 0,
    grain: 0,
    fabric: 0,
    mineral: 0
  });

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

  useEffect(() => {
    if (!isOpen) {
      setOfferedResources({ clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0 });
      setRequestedResources({ clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0 });
      setTradeMode('bank');
    }
  }, [isOpen]);

  const handleIncrement = (resource: keyof ResourceSelection, isOffering: boolean) => {
    if (isOffering) {
      if (offeredResources[resource] < currentPlayer.resources[resource]) {
        setOfferedResources(prev => ({
          ...prev,
          [resource]: prev[resource] + 1
        }));
      }
    } else {
      setRequestedResources(prev => ({
        ...prev,
        [resource]: prev[resource] + 1
      }));
    }
  };

  const handleDecrement = (resource: keyof ResourceSelection, isOffering: boolean) => {
    if (isOffering) {
      if (offeredResources[resource] > 0) {
        setOfferedResources(prev => ({
          ...prev,
          [resource]: prev[resource] - 1
        }));
      }
    } else {
      if (requestedResources[resource] > 0) {
        setRequestedResources(prev => ({
          ...prev,
          [resource]: prev[resource] - 1
        }));
      }
    }
  };

  const totalOffered = offeredResources.clay + offeredResources.lumber + offeredResources.grain +
                       offeredResources.fabric + offeredResources.mineral;
  const totalRequested = requestedResources.clay + requestedResources.lumber + requestedResources.grain +
                         requestedResources.fabric + requestedResources.mineral;

  const tradeRates = getAllAvailableTradeRates(currentPlayer.id, gameState);
  const expertNegotiatorActive = gameState.turnState.expertNegotiatorActive === true;

  const getBankTradeValidation = () => {
    if (tradeMode !== 'bank') return null;

    if (totalOffered === 0) {
      return 'Select resources to offer';
    }

    if (totalRequested === 0) {
      return 'Select resources to request';
    }

    if (totalRequested !== 1) {
      return 'Bank trades must request exactly 1 resource';
    }

    const offeredResourceType = (Object.keys(offeredResources) as ResourceType[]).find(
      key => offeredResources[key] > 0
    );
    const requestedResourceType = (Object.keys(requestedResources) as ResourceType[]).find(
      key => requestedResources[key] > 0
    );

    if (!offeredResourceType || !requestedResourceType) {
      return 'Select both offered and requested resources';
    }

    const validation = canExecuteBankTrade(
      currentPlayer.id,
      offeredResourceType,
      offeredResources[offeredResourceType],
      requestedResourceType,
      requestedResources[requestedResourceType],
      gameState
    );

    if (!validation.valid) {
      return validation.reason || 'Invalid trade';
    }

    return null;
  };

  const getPlayerTradeValidation = () => {
    if (tradeMode !== 'player') return null;

    const validation = canProposePlayerTrade(
      currentPlayer.id,
      offeredResources,
      requestedResources,
      gameState
    );

    if (!validation.valid) {
      return validation.reason || 'Invalid trade proposal';
    }

    return null;
  };

  const handleConfirmTrade = () => {
    if (tradeMode === 'bank') {
      const offeredResourceType = (Object.keys(offeredResources) as ResourceType[]).find(
        key => offeredResources[key] > 0
      );
      const requestedResourceType = (Object.keys(requestedResources) as ResourceType[]).find(
        key => requestedResources[key] > 0
      );

      if (offeredResourceType && requestedResourceType) {
        onExecuteBankTrade(
          offeredResourceType,
          offeredResources[offeredResourceType],
          requestedResourceType
        );
      }
    } else {
      onProposePlayerTrade(offeredResources, requestedResources);
    }
  };

  const bankValidationError = getBankTradeValidation();
  const playerValidationError = getPlayerTradeValidation();
  const canConfirm = tradeMode === 'bank'
    ? bankValidationError === null
    : playerValidationError === null;

  const opponentPlayers = gameState.players.filter(p => p.id !== currentPlayer.id);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={(e) => e.stopPropagation()}
      />

      <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl mx-4 z-10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-800">Trading</h2>
            {expertNegotiatorActive && (
              <div className="flex items-center gap-1 bg-gradient-to-r from-yellow-400 to-amber-500 text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg">
                <Sparkles className="w-4 h-4" />
                <span>Expert Negotiator Active - 2:1 Trades!</span>
                <Sparkles className="w-4 h-4" />
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTradeMode('bank')}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
              tradeMode === 'bank'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Building2 className="w-5 h-5" />
            Trade with Bank
          </button>
          <button
            onClick={() => setTradeMode('player')}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
              tradeMode === 'player'
                ? 'bg-green-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Users className="w-5 h-5" />
            Trade with Players
          </button>
        </div>

        {tradeMode === 'player' && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="text-sm font-semibold text-blue-800 mb-2">Opponent Players:</div>
            <div className="grid grid-cols-2 gap-2">
              {opponentPlayers.map(player => (
                <div
                  key={player.id}
                  className="flex items-center justify-between bg-white rounded px-3 py-2 border border-gray-200"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getPlayerColorStyle(player.color) }}
                    />
                    <span className="text-sm font-semibold text-gray-800">{player.name}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {player.resources.total} resources
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
            <h3 className="text-sm font-bold text-gray-800 mb-3">You Offer:</h3>
            <div className="space-y-2">
              {(['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const).map((resource) => (
                <div
                  key={resource}
                  className="flex items-center justify-between bg-white rounded-lg p-2 border border-gray-200"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded border border-gray-300 overflow-hidden flex-shrink-0"
                      title={resourceLabels[resource]}
                    >
                      <img
                        src={getResourceImage(assets, resource)?.src}
                        alt={resourceLabels[resource]}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-xs">
                      <div className="font-semibold text-gray-800">{resourceLabels[resource]}</div>
                      <div className="text-gray-600">Have: {currentPlayer.resources[resource]}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDecrement(resource, true)}
                      disabled={offeredResources[resource] === 0}
                      className="px-2 h-6 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Decrease"
                    >
                      <Minus className="w-3 h-3 text-gray-700" />
                    </button>

                    <div className="w-8 text-center font-bold text-gray-800 text-sm">
                      {offeredResources[resource]}
                    </div>

                    <button
                      onClick={() => handleIncrement(resource, true)}
                      disabled={offeredResources[resource] >= currentPlayer.resources[resource]}
                      className="px-2 h-6 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Increase"
                    >
                      <Plus className="w-3 h-3 text-gray-700" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-center">
              <span className="text-sm font-semibold text-gray-700">Total: {totalOffered}</span>
            </div>
          </div>

          <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
            <h3 className="text-sm font-bold text-gray-800 mb-3">You Request:</h3>
            <div className="space-y-2">
              {(['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const).map((resource) => (
                <div
                  key={resource}
                  className="flex items-center justify-between bg-white rounded-lg p-2 border border-gray-200"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded border border-gray-300 overflow-hidden flex-shrink-0"
                      title={resourceLabels[resource]}
                    >
                      <img
                        src={getResourceImage(assets, resource)?.src}
                        alt={resourceLabels[resource]}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-xs">
                      <div className="font-semibold text-gray-800">{resourceLabels[resource]}</div>
                      {tradeMode === 'bank' && tradeRates[resource] && (
                        <div className="text-gray-600 text-[10px]">
                          {getTradeRateDisplay(tradeRates[resource])}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDecrement(resource, false)}
                      disabled={requestedResources[resource] === 0}
                      className="px-2 h-6 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Decrease"
                    >
                      <Minus className="w-3 h-3 text-gray-700" />
                    </button>

                    <div className="w-8 text-center font-bold text-gray-800 text-sm">
                      {requestedResources[resource]}
                    </div>

                    <button
                      onClick={() => handleIncrement(resource, false)}
                      className="px-2 h-6 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Increase"
                    >
                      <Plus className="w-3 h-3 text-gray-700" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-center">
              <span className="text-sm font-semibold text-gray-700">Total: {totalRequested}</span>
            </div>
          </div>
        </div>

        {(bankValidationError || playerValidationError) && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-sm text-red-700 font-semibold">
              {tradeMode === 'bank' ? bankValidationError : playerValidationError}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmTrade}
            disabled={!canConfirm}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
          >
            {tradeMode === 'bank' ? 'Trade with Bank' : 'Propose Trade'}
          </button>
        </div>
      </div>
    </div>
  );
};
