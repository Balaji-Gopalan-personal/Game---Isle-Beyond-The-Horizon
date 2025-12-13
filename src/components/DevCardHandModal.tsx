import React, { useState } from 'react';
import { X } from 'lucide-react';
import { DevelopmentCard } from '../types/game';
import { CardDetailModal } from './CardDetailModal';

interface DevCardHandModalProps {
  cards: DevelopmentCard[];
  isVisible: boolean;
  onClose: () => void;
  onPlayCard?: (card: DevelopmentCard) => void;
  isPlayPhase?: boolean;
  currentTurn?: number;
  guardsPlayedThisTurn?: number;
}

interface CardCount {
  card: DevelopmentCard;
  count: number;
}

export const DevCardHandModal: React.FC<DevCardHandModalProps> = ({
  cards,
  isVisible,
  onClose,
  onPlayCard,
  isPlayPhase = false,
  currentTurn = 0,
  guardsPlayedThisTurn = 0
}) => {
  const [selectedCard, setSelectedCard] = useState<DevelopmentCard | null>(null);

  if (!isVisible) return null;

  // Helper function to determine if a card can be played
  const canPlayCard = (card: DevelopmentCard): { canPlay: boolean; reason?: string } => {
    // Extra Point is automatic and can't be "played"
    if (card.name === 'Extra Point') {
      return { canPlay: false, reason: 'Extra Point is automatic' };
    }

    // Can't play a card drawn this turn
    if (card.turnDrawn === currentTurn) {
      return { canPlay: false, reason: 'Cannot play cards drawn this turn' };
    }

    // Guard can only be played once per turn
    if (card.name === 'Guard' && guardsPlayedThisTurn > 0) {
      return { canPlay: false, reason: 'Only one Guard per turn' };
    }

    // For Free Upgrade, would need to check if player has settlements (handled in game logic)
    // For now, allow it if it passes the above checks
    return { canPlay: true };
  };

  const cardCounts: CardCount[] = [];
  const cardMap = new Map<string, CardCount>();

  for (const card of cards) {
    const existing = cardMap.get(card.name);
    if (existing) {
      existing.count++;
    } else {
      const cardCount: CardCount = { card, count: 1 };
      cardMap.set(card.name, cardCount);
      cardCounts.push(cardCount);
    }
  }

  cardCounts.sort((a, b) => a.card.name.localeCompare(b.card.name));

  const handleCardClick = (card: DevelopmentCard) => {
    setSelectedCard(card);
  };

  const handleCloseDetailModal = () => {
    setSelectedCard(null);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-2xl border-2 border-amber-600 max-w-lg w-full mx-4 p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>

          <div>
            <h2 className="text-2xl font-bold text-amber-500 mb-6 text-center">
              Development Cards
            </h2>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {cardCounts.length === 0 ? (
                <p className="text-gray-400 text-center py-8">
                  No development cards in hand
                </p>
              ) : (
                cardCounts.map(({ card, count }) => (
                  <button
                    key={card.name}
                    onClick={() => handleCardClick(card)}
                    className="w-full flex items-center justify-between bg-slate-700 hover:bg-slate-600 transition-colors rounded-lg p-4 text-left border border-amber-800 hover:border-amber-600"
                  >
                    <span className="text-white font-medium">{card.name}</span>
                    <span className="text-amber-500 font-bold">x {count}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedCard && (() => {
        const playability = canPlayCard(selectedCard);
        return (
          <CardDetailModal
            card={selectedCard}
            isVisible={true}
            onClose={handleCloseDetailModal}
            onPlay={onPlayCard ? () => {
              onPlayCard(selectedCard);
              setSelectedCard(null);
              onClose();
            } : undefined}
            canPlay={playability.canPlay}
            playDisabledReason={playability.reason}
            isPlayPhase={isPlayPhase}
          />
        );
      })()}
    </>
  );
};
