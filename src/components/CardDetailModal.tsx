import React, { useState } from 'react';
import { X } from 'lucide-react';
import { DevelopmentCard } from '../types/game';
import { useAssets } from '../contexts/AssetsContext';
import { getDevelopmentCardImage } from '../utils/assetHelpers';

interface CardDetailModalProps {
  card: DevelopmentCard;
  isVisible: boolean;
  onClose: () => void;
  onPlay?: () => void;
  canPlay?: boolean;
  playDisabledReason?: string;
  isPlayPhase?: boolean;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  card,
  isVisible,
  onClose,
  onPlay,
  canPlay = false,
  playDisabledReason,
  isPlayPhase = false
}) => {
  const { assets } = useAssets();
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  if (!isVisible) return null;

  const handleImageError = () => {
    setImageError(true);
    setImageLoading(false);
  };

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-2xl border-2 border-amber-600 max-w-md w-full mx-4 p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={24} />
        </button>

        <div className="text-center mt-4">
          <h2 className="text-2xl font-bold text-amber-500 mb-4">
            {card.name}
          </h2>

          <div className="mb-4 flex justify-center">
            <div className="border-4 border-amber-700 rounded-lg overflow-hidden shadow-lg bg-gradient-to-br from-amber-100 to-yellow-200">
              {!imageError ? (
                <>
                  {imageLoading && (
                    <div className="w-56 h-72 flex items-center justify-center">
                      <div className="animate-pulse text-amber-800">Loading...</div>
                    </div>
                  )}
                  <img
                    src={getDevelopmentCardImage(assets, card.imageUrl)?.src}
                    alt={card.name}
                    className={`w-56 h-auto ${imageLoading ? 'hidden' : 'block'}`}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                  />
                </>
              ) : (
                <div className="w-56 h-72 flex items-center justify-center p-4">
                  <span className="text-3xl font-bold text-amber-800 text-center">
                    {card.name}
                  </span>
                </div>
              )}
            </div>
          </div>

          <p className="text-gray-300 text-base leading-relaxed">
            {card.description}
          </p>

          {isPlayPhase && onPlay && (
            <div className="mt-6">
              {canPlay ? (
                <button
                  onClick={onPlay}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  Play Card
                </button>
              ) : (
                <div className="w-full bg-gray-600 text-gray-300 font-bold py-3 px-4 rounded-lg cursor-not-allowed">
                  {playDisabledReason || 'Cannot play this card'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
