import React, { useState } from 'react';
import { X } from 'lucide-react';
import { DevelopmentCard } from '../types/game';
import { useAssets } from '../contexts/AssetsContext';
import { getDevelopmentCardImage } from '../utils/assetHelpers';

interface DevelopmentCardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: DevelopmentCard[];
  playerName: string;
}

export function DevelopmentCardsModal({ isOpen, onClose, cards, playerName }: DevelopmentCardsModalProps) {
  const { assets } = useAssets();
  const [loadingErrors, setLoadingErrors] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const handleImageError = (cardId: string) => {
    setLoadingErrors(prev => ({ ...prev, [cardId]: true }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-75" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">
            {playerName}'s Development Cards
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {cards.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-xl text-gray-500 mb-2">No development cards yet</p>
              <p className="text-sm text-gray-400">
                Purchase development cards during your turn to collect them
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {cards.map((card, index) => (
                  <div
                    key={`${card.id}-${index}`}
                    className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg shadow-md overflow-hidden border-2 border-amber-200 hover:shadow-lg transition-shadow"
                  >
                    <div className="aspect-[3/4] relative bg-gradient-to-br from-amber-100 to-yellow-200 flex items-center justify-center">
                      {!loadingErrors[card.id] && (
                        <img
                          src={getDevelopmentCardImage(assets, card.imageUrl)}
                          alt={card.name}
                          className="w-full h-full object-contain"
                          onError={() => handleImageError(card.id)}
                        />
                      )}
                      {loadingErrors[card.id] && (
                        <div className="absolute inset-0 flex items-center justify-center p-4">
                          <span className="text-4xl font-bold text-amber-800 text-center">
                            {card.name}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-lg text-gray-900 mb-2">{card.name}</h3>
                      <p className="text-xs text-gray-600 mb-2 italic">{card.playStyle}</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{card.rules}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Card playing functionality is coming soon. For now, you can view and collect cards, but cannot play them yet.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
