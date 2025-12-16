import React, { useState } from 'react';
import { X } from 'lucide-react';
import { DevelopmentCard } from '../types/game';
import { useAssets } from '../contexts/AssetsContext';
import { getDevelopmentCardImage } from '../utils/assetHelpers';

interface CardDrawnModalProps {
  card: DevelopmentCard;
  isVisible: boolean;
  onClose: () => void;
  mode?: 'drawn' | 'played';
  playerName?: string;
  playerNumber?: number;
  playerColor?: string;
}

export const CardDrawnModal: React.FC<CardDrawnModalProps> = ({
  card,
  isVisible,
  onClose,
  mode = 'drawn',
  playerName,
  playerNumber,
  playerColor
}) => {
  const { assets } = useAssets();
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  if (!isVisible) return null;

  const isExtraPoint = card.name === 'Extra Point';
  const isPlayedMode = mode === 'played';

  const handleImageError = () => {
    setImageError(true);
    setImageLoading(false);
  };

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-2xl border-2 border-amber-600 max-w-md w-full mx-4 p-6 relative">
        {!isPlayedMode && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
        )}

        <div className="text-center">
          {isPlayedMode && playerName && (
            <div className="mb-4">
              <h3
                className="text-2xl font-bold mb-1"
                style={{ color: playerColor ? getPlayerColorStyle(playerColor) : '#F59E0B' }}
              >
                Player {playerNumber}: {playerName}
              </h3>
              <p className="text-gray-400 text-sm">is playing</p>
            </div>
          )}

          <h2 className="text-3xl font-bold text-amber-500 mb-6">
            {card.name}
          </h2>

          <div className="mb-6 flex justify-center">
            <div className="border-4 border-amber-700 rounded-lg overflow-hidden shadow-lg bg-gradient-to-br from-amber-100 to-yellow-200">
              {!imageError ? (
                <>
                  {imageLoading && (
                    <div className="w-64 h-80 flex items-center justify-center">
                      <div className="animate-pulse text-amber-800 text-lg">Loading...</div>
                    </div>
                  )}
                  <img
                    src={getDevelopmentCardImage(assets, card.imageUrl)?.src}
                    alt={card.name}
                    className={`w-64 h-auto ${imageLoading ? 'hidden' : 'block'}`}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                  />
                </>
              ) : (
                <div className="w-64 h-80 flex items-center justify-center p-6">
                  <span className="text-4xl font-bold text-amber-800 text-center">
                    {card.name}
                  </span>
                </div>
              )}
            </div>
          </div>

          <p className="text-gray-300 text-lg leading-relaxed mb-4">
            {card.description}
          </p>

          {isExtraPoint && (
            <div className="bg-green-900 bg-opacity-40 border border-green-600 rounded-lg p-3 mt-4">
              <p className="text-green-300 font-semibold">
                +1 Secret Point (hidden from other players)
              </p>
            </div>
          )}

          {isPlayedMode && (
            <button
              onClick={onClose}
              className="mt-6 w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
