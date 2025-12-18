import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface QuitGameModalProps {
  isVisible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const QuitGameModal: React.FC<QuitGameModalProps> = ({
  isVisible,
  onConfirm,
  onCancel
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-orange-100 rounded-full p-3">
              <AlertTriangle className="w-8 h-8 text-orange-600" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">
            Quit Game
          </h2>

          <p className="text-gray-600 text-center mb-6">
            Are you sure you want to quit? Your current game progress will be lost.
          </p>

          <div className="flex gap-3 justify-center">
            <button
              onClick={onCancel}
              className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition-colors"
            >
              No, cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
            >
              Yes, quit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
