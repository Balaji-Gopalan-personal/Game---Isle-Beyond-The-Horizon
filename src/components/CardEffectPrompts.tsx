import React from 'react';
import { X } from 'lucide-react';
import { Player } from '../types/game';
import { CharacterAvatar } from './CharacterAvatar';
import { useAssets } from '../contexts/AssetsContext';
import { getPlayerColorHex } from '../utils/playerColors';
import { getResourceImage } from '../utils/assetHelpers';

interface OpponentSelectorProps {
  opponents: Player[];
  selectedPlayerId?: string | null;
  onSelectPlayer: (playerId: string) => void;
  showResourceCount?: boolean;
  title?: string;
  compact?: boolean;
  hideDetailedResources?: boolean;
}

export const OpponentSelector: React.FC<OpponentSelectorProps> = ({
  opponents,
  selectedPlayerId,
  onSelectPlayer,
  showResourceCount = true,
  title,
  compact = false,
  hideDetailedResources = false
}) => {
  const getPlayerInitials = (name: string): string => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (compact) {
    return (
      <div className="space-y-0.5">
        {title && (
          <div className="text-xs text-gray-600 text-center">
            {title}
          </div>
        )}
        <div className="flex gap-1.5 justify-center">
          {opponents.map(player => (
            <button
              key={player.id}
              onClick={() => onSelectPlayer(player.id)}
              className={`relative flex flex-col items-center transition-all duration-200 ${
                selectedPlayerId === player.id ? 'opacity-100' : 'opacity-70 hover:opacity-90'
              }`}
              title={showResourceCount ? (hideDetailedResources ? `${player.name}: ${player.resources.total} total` : `${player.name}: ${player.resources.clay}C ${player.resources.lumber}L ${player.resources.grain}G ${player.resources.fabric}F ${player.resources.mineral}M (${player.resources.total} total)`) : player.name}
            >
              <div className={`relative w-8 h-12 rounded-full overflow-hidden ${selectedPlayerId === player.id ? 'ring-2 ring-blue-500' : ''}`}>
                {player.isHuman ? (
                  <div
                    className="w-full h-full flex items-center justify-center text-white font-bold text-[10px]"
                    style={{ backgroundColor: getPlayerColorHex(player.color) }}
                  >
                    {getPlayerInitials(player.name)}
                  </div>
                ) : (
                  <>
                    <div className="w-full h-full flex items-center justify-center overflow-hidden">
                      <CharacterAvatar
                        character={player.character}
                        color={player.color}
                        size="lg"
                        className="w-10 h-10 scale-125"
                      />
                    </div>
                    <div
                      className="absolute bottom-0.5 right-0 w-3 h-3 rounded-full flex items-center justify-center text-white font-bold text-[6px] border border-white"
                      style={{ backgroundColor: getPlayerColorHex(player.color) }}
                    >
                      P{player.order}
                    </div>
                  </>
                )}
              </div>
              {showResourceCount && (
                <div className="text-[9px] font-medium text-gray-700 mt-0.5">
                  {player.resources.total}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

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
            title={showResourceCount ? (hideDetailedResources ? `${player.name}: ${player.resources.total} total` : `${player.name}: ${player.resources.clay}C ${player.resources.lumber}L ${player.resources.grain}G ${player.resources.fabric}F ${player.resources.mineral}M (${player.resources.total} total)`) : player.name}
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
  const { assets } = useAssets();
  const resources = [
    { type: 'clay' as const, label: 'C', fullName: 'Clay', color: '#B7410E' },
    { type: 'lumber' as const, label: 'L', fullName: 'Lumber', color: '#228B22' },
    { type: 'grain' as const, label: 'G', fullName: 'Grain', color: '#FFD700' },
    { type: 'fabric' as const, label: 'F', fullName: 'Fabric', color: '#87CEEB' },
    { type: 'mineral' as const, label: 'M', fullName: 'Mineral', color: '#696969' }
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
      <div className="flex gap-2 justify-center">
        {resources.map(resource => {
          const selectionCount = resourcesSelected.filter(r => r === resource.fullName).length;
          const hasSelections = selectionCount > 0;
          const imageSrc = getResourceImage(assets, resource.type);
          return (
            <button
              key={resource.type}
              onClick={() => onSelectResource(resource.type)}
              disabled={canConfirm}
              className={`relative w-8 h-8 rounded border-2 overflow-hidden flex-shrink-0 transition-all duration-200 ${
                canConfirm
                  ? 'opacity-50 cursor-not-allowed border-gray-300'
                  : hasSelections
                  ? 'border-blue-500 cursor-pointer hover:border-blue-600'
                  : 'border-gray-300 hover:border-gray-400 cursor-pointer'
              }`}
              title={resource.fullName}
              style={!imageSrc ? { backgroundColor: resource.color } : undefined}
            >
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={resource.fullName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.style.backgroundColor = resource.color;
                  }}
                />
              ) : null}
              <div className="absolute top-0 left-0 right-0 flex justify-center">
                <span className="text-xs font-bold text-white bg-black bg-opacity-60 px-1 leading-tight">
                  {resource.label}
                </span>
              </div>
              {selectionCount > 0 && (
                <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-600 rounded-tl flex items-center justify-center">
                  <span className="text-[10px] font-bold text-white">
                    {selectionCount}
                  </span>
                </div>
              )}
            </button>
          );
        })}
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
  const { assets } = useAssets();
  const resources = [
    { type: 'clay' as const, label: 'C', fullName: 'Clay', color: '#B7410E' },
    { type: 'lumber' as const, label: 'L', fullName: 'Lumber', color: '#228B22' },
    { type: 'grain' as const, label: 'G', fullName: 'Grain', color: '#FFD700' },
    { type: 'fabric' as const, label: 'F', fullName: 'Fabric', color: '#87CEEB' },
    { type: 'mineral' as const, label: 'M', fullName: 'Mineral', color: '#696969' }
  ];

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-gray-700 text-center">
        Closed Market
      </div>
      <div className="text-xs text-gray-600 text-center mb-2">
        Take all of one resource type from all players
        {selectedResource && ` (Selected: ${selectedResource.charAt(0).toUpperCase() + selectedResource.slice(1)})`}
      </div>
      <div className="flex gap-2 justify-center">
        {resources.map(resource => {
          const isSelected = selectedResource === resource.type;
          const imageSrc = getResourceImage(assets, resource.type);
          return (
            <button
              key={resource.type}
              onClick={() => onSelectResource(resource.type)}
              className={`relative w-8 h-8 rounded border-2 overflow-hidden flex-shrink-0 transition-all duration-200 ${
                isSelected
                  ? 'border-blue-500 ring-2 ring-blue-400 cursor-pointer'
                  : 'border-gray-300 hover:border-gray-400 cursor-pointer'
              }`}
              title={resource.fullName}
              style={!imageSrc ? { backgroundColor: resource.color } : undefined}
            >
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt={resource.fullName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.style.backgroundColor = resource.color;
                  }}
                />
              ) : null}
              <div className="absolute top-0 left-0 right-0 flex justify-center">
                <span className="text-xs font-bold text-white bg-black bg-opacity-60 px-1 leading-tight">
                  {resource.label}
                </span>
              </div>
            </button>
          );
        })}
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
    <div className="space-y-0.5">
      {currentPlayer && (
        <div className="text-[10px] text-gray-700 text-center mb-1">
          You have <span className="font-bold">{currentPlayer.resources.total}</span> resources. Select Resource Swap target
        </div>
      )}

      <OpponentSelector
        opponents={opponents}
        selectedPlayerId={selectedPlayerId}
        onSelectPlayer={onSelectPlayer}
        showResourceCount={true}
        compact={true}
        hideDetailedResources={true}
      />

      <div className="flex gap-1.5 pt-1">
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
