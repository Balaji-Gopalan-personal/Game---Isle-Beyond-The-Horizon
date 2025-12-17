import React from 'react';
import { X } from 'lucide-react';
import { Player } from '../types/game';
import { CharacterAvatar } from './CharacterAvatar';
import { useAssets } from '../contexts/AssetsContext';
import { getPlayerColorHex } from '../utils/playerColors';

interface OpponentSelectorProps {
  opponents: Player[];
  selectedPlayerId?: string | null;
  onSelectPlayer: (playerId: string) => void;
  showResourceCount?: boolean;
  title?: string;
}

export const OpponentSelector: React.FC<OpponentSelectorProps> = ({
  opponents,
  selectedPlayerId,
  onSelectPlayer,
  showResourceCount = true,
  title
}) => {
  const getPlayerInitials = (name: string): string => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-1">
      {title && (
        <div className="text-xs text-gray-600 text-center">
          {title}
        </div>
      )}
      <div className="flex gap-1 justify-center flex-wrap">
        {opponents.map(player => (
          <button
            key={player.id}
            onClick={() => onSelectPlayer(player.id)}
            className={`relative flex flex-col items-center transition-all duration-200 ${
              selectedPlayerId === player.id ? 'opacity-100' : 'opacity-70 hover:opacity-90'
            }`}
            title={showResourceCount ? `${player.name}: ${player.resources.clay}C ${player.resources.lumber}L ${player.resources.grain}G ${player.resources.fabric}F ${player.resources.mineral}M (${player.resources.total} total)` : player.name}
          >
            <div className={`relative w-11 h-11 rounded ${selectedPlayerId === player.id ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}>
              {player.isHuman ? (
                <div
                  className="w-full h-full rounded flex items-center justify-center text-white font-bold text-xs"
                  style={{ backgroundColor: getPlayerColorHex(player.color) }}
                >
                  {getPlayerInitials(player.name)}
                </div>
              ) : (
                <>
                  <CharacterAvatar
                    character={player.character}
                    color={player.color}
                    size="lg"
                    className="w-full h-full"
                  />
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white font-bold text-[8px] border border-white"
                    style={{ backgroundColor: getPlayerColorHex(player.color) }}
                  >
                    P{player.order}
                  </div>
                </>
              )}
            </div>
            {showResourceCount && (
              <div className="text-[8px] font-medium text-gray-700 mt-0.5">
                {player.resources.total}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

interface BoomingEconomyPromptProps {
  resourcesSelected: string[];
  onSelectResource: (resource: 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral') => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const BoomingEconomyPrompt: React.FC<BoomingEconomyPromptProps> = ({
  resourcesSelected,
  onSelectResource,
  onConfirm,
  onCancel
}) => {
  const resources = [
    { type: 'clay' as const, label: 'C', fullName: 'Clay', color: 'bg-red-600 hover:bg-red-700' },
    { type: 'lumber' as const, label: 'L', fullName: 'Lumber', color: 'bg-green-600 hover:bg-green-700' },
    { type: 'grain' as const, label: 'G', fullName: 'Grain', color: 'bg-yellow-600 hover:bg-yellow-700' },
    { type: 'fabric' as const, label: 'F', fullName: 'Fabric', color: 'bg-purple-600 hover:bg-purple-700' },
    { type: 'mineral' as const, label: 'M', fullName: 'Mineral', color: 'bg-gray-600 hover:bg-gray-700' }
  ];

  const canConfirm = resourcesSelected.length === 2;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-700 text-center">
        Booming Economy
      </div>
      <div className="text-xs text-gray-600 text-center mb-2">
        Select {2 - resourcesSelected.length} resource{2 - resourcesSelected.length !== 1 ? 's' : ''}
        {resourcesSelected.length > 0 && ` (Selected: ${resourcesSelected.join(', ')})`}
      </div>
      <div className="flex gap-1 justify-center">
        {resources.map(resource => (
          <button
            key={resource.type}
            onClick={() => onSelectResource(resource.type)}
            disabled={resourcesSelected.includes(resource.fullName)}
            className={`${resource.color} text-white font-bold py-2 px-3 rounded transition-all duration-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed`}
            title={resource.fullName}
          >
            {resource.label}
          </button>
        ))}
      </div>
      {canConfirm && onConfirm && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={onConfirm}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded transition-all duration-200 text-sm"
          >
            Confirm
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-3 rounded transition-all duration-200 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface ClosedMarketPromptProps {
  onSelectResource: (resource: 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral') => void;
  selectedResource?: 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral' | null;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const ClosedMarketPrompt: React.FC<ClosedMarketPromptProps> = ({
  onSelectResource,
  selectedResource,
  onConfirm,
  onCancel
}) => {
  const resources = [
    { type: 'clay' as const, label: 'C', fullName: 'Clay', color: 'bg-red-600 hover:bg-red-700' },
    { type: 'lumber' as const, label: 'L', fullName: 'Lumber', color: 'bg-green-600 hover:bg-green-700' },
    { type: 'grain' as const, label: 'G', fullName: 'Grain', color: 'bg-yellow-600 hover:bg-yellow-700' },
    { type: 'fabric' as const, label: 'F', fullName: 'Fabric', color: 'bg-purple-600 hover:bg-purple-700' },
    { type: 'mineral' as const, label: 'M', fullName: 'Mineral', color: 'bg-gray-600 hover:bg-gray-700' }
  ];

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-700 text-center">
        Closed Market
      </div>
      <div className="text-xs text-gray-600 text-center mb-2">
        Take all of one resource type from all players
        {selectedResource && ` (Selected: ${selectedResource})`}
      </div>
      <div className="flex gap-1 justify-center">
        {resources.map(resource => (
          <button
            key={resource.type}
            onClick={() => onSelectResource(resource.type)}
            className={`${resource.color} text-white font-bold py-2 px-3 rounded transition-all duration-200 text-sm ${selectedResource === resource.type ? 'ring-2 ring-white ring-offset-2' : ''}`}
            title={resource.fullName}
          >
            {resource.label}
          </button>
        ))}
      </div>
      {selectedResource && onConfirm && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={onConfirm}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded transition-all duration-200 text-sm"
          >
            Confirm
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-3 rounded transition-all duration-200 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface ResourceSwapPromptProps {
  players: Player[];
  currentPlayerId: string;
  onSelectPlayer: (playerId: string) => void;
  selectedPlayerId?: string | null;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const ResourceSwapPrompt: React.FC<ResourceSwapPromptProps> = ({
  players,
  currentPlayerId,
  onSelectPlayer,
  selectedPlayerId,
  onConfirm,
  onCancel
}) => {
  const opponents = players.filter(p => p.id !== currentPlayerId);
  const selectedPlayer = selectedPlayerId ? players.find(p => p.id === selectedPlayerId) : null;
  const currentPlayer = players.find(p => p.id === currentPlayerId);

  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium text-gray-700 text-center">
        Resource Swap
      </div>

      {currentPlayer && (
        <div className="bg-gray-50 rounded p-1 border border-gray-200">
          <div className="text-[9px] text-gray-600 text-center">
            Your Hold: <span className="font-semibold">{currentPlayer.resources.clay}C {currentPlayer.resources.lumber}L {currentPlayer.resources.grain}G {currentPlayer.resources.fabric}F {currentPlayer.resources.mineral}M</span>
          </div>
        </div>
      )}

      <OpponentSelector
        opponents={opponents}
        selectedPlayerId={selectedPlayerId}
        onSelectPlayer={onSelectPlayer}
        showResourceCount={true}
        title="Select player to swap resources with"
      />

      {selectedPlayer && (
        <div className="p-1 bg-blue-50 border border-blue-200 rounded">
          <div className="text-[9px] text-blue-800 text-center">
            You get: <span className="font-semibold">{selectedPlayer.resources.clay}C {selectedPlayer.resources.lumber}L {selectedPlayer.resources.grain}G {selectedPlayer.resources.fabric}F {selectedPlayer.resources.mineral}M</span>
          </div>
        </div>
      )}

      <div className="flex gap-1.5">
        {selectedPlayerId && onConfirm && (
          <button
            onClick={onConfirm}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-2 rounded transition-all duration-200 text-xs"
          >
            Confirm
          </button>
        )}
        {onCancel && (
          <button
            onClick={onCancel}
            className={`${selectedPlayerId ? 'flex-1' : 'w-full'} bg-gray-600 hover:bg-gray-700 text-white font-semibold py-1.5 px-2 rounded transition-all duration-200 text-xs`}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};

interface FreeUpgradePromptProps {
  onCancel?: () => void;
}

export const FreeUpgradePrompt: React.FC<FreeUpgradePromptProps> = ({
  onCancel
}) => {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-700 text-center">
        Free Upgrade
      </div>
      <div className="text-xs text-gray-600 text-center mb-2">
        Click on one of your Villages to upgrade to an Estate
      </div>
      {onCancel && (
        <button
          onClick={onCancel}
          className="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-3 rounded transition-all duration-200 flex items-center justify-center gap-2"
        >
          <X className="w-4 h-4" />
          <span className="text-sm">Cancel</span>
        </button>
      )}
    </div>
  );
};
