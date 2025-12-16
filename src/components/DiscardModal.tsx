import React, { useState, useEffect } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import { Resources } from '../types/game';
import { useAssets } from '../contexts/AssetsContext';
import { getResourceImage } from '../utils/assetHelpers';

interface DiscardModalProps {
  isOpen: boolean;
  playerName: string;
  playerColor: string;
  currentResources: Resources;
  discardAmount: number;
  onConfirm: (selection: { clay: number; lumber: number; grain: number; fabric: number; mineral: number }) => void;
  onMinimize: () => void;
}

export const DiscardModal: React.FC<DiscardModalProps> = ({
  isOpen,
  playerName,
  playerColor,
  currentResources,
  discardAmount,
  onConfirm,
  onMinimize
}) => {
  const { assets } = useAssets();
  const [selection, setSelection] = useState({
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

  const totalSelected = selection.clay + selection.lumber + selection.grain + selection.fabric + selection.mineral;

  const handleIncrement = (resource: keyof typeof selection) => {
    if (selection[resource] < currentResources[resource] && totalSelected < discardAmount) {
      setSelection(prev => ({
        ...prev,
        [resource]: prev[resource] + 1
      }));
    }
  };

  const handleDecrement = (resource: keyof typeof selection) => {
    if (selection[resource] > 0) {
      setSelection(prev => ({
        ...prev,
        [resource]: prev[resource] - 1
      }));
    }
  };

  const canConfirm = totalSelected === discardAmount;

  const handleConfirm = () => {
    if (canConfirm) {
      onConfirm(selection);
      setSelection({ clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0 });
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setSelection({ clay: 0, lumber: 0, grain: 0, fabric: 0, mineral: 0 });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={(e) => e.stopPropagation()}
      />

      <div className="relative bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold" style={{ color: getPlayerColorStyle(playerColor) }}>
              {playerName}
            </h2>
            <span className="text-gray-600 text-sm">- Discard Required</span>
          </div>
          <button
            onClick={onMinimize}
            className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
            title="Minimize"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 bg-gray-100 rounded-lg px-4 py-2">
            <span className="text-2xl font-bold text-gray-800">{totalSelected}</span>
            <span className="text-gray-600">/</span>
            <span className="text-2xl font-bold text-gray-800">{discardAmount}</span>
            <span className="text-sm text-gray-600">Resources to Discard</span>
          </div>
        </div>

        <div className="space-y-3 mb-6">
          {(['clay', 'lumber', 'grain', 'fabric', 'mineral'] as const).map((resource) => (
            <div
              key={resource}
              className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-200"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded border-2 border-gray-300 overflow-hidden flex-shrink-0"
                  title={resourceLabels[resource]}
                >
                  <img
                    src={getResourceImage(assets, resource)?.src}
                    alt={resourceLabels[resource]}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="font-semibold text-gray-800">{resourceLabels[resource]}</div>
                  <div className="text-xs text-gray-600">Available: {currentResources[resource]}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDecrement(resource)}
                  disabled={selection[resource] === 0}
                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Remove one"
                >
                  <Minus className="w-4 h-4 text-gray-700" />
                </button>

                <div className="w-8 text-center font-bold text-gray-800">
                  {selection[resource]}
                </div>

                <button
                  onClick={() => handleIncrement(resource)}
                  disabled={selection[resource] >= currentResources[resource] || totalSelected >= discardAmount}
                  className="w-8 h-8 flex items-center justify-center rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Add one"
                >
                  <Plus className="w-4 h-4 text-gray-700" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onMinimize}
            className="flex-1 bg-gray-500 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            Minimize
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
          >
            Confirm Discard
          </button>
        </div>
      </div>
    </div>
  );
};
