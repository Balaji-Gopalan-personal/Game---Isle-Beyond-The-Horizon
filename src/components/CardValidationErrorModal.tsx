import React from 'react';
import { AlertCircle } from 'lucide-react';

interface CardValidationErrorModalProps {
  isVisible: boolean;
  errorMessage: string;
  onClose: () => void;
}

export const CardValidationErrorModal: React.FC<CardValidationErrorModalProps> = ({
  isVisible,
  errorMessage,
  onClose
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60]">
      <div className="bg-gradient-to-br from-red-900 to-red-800 rounded-xl shadow-2xl border-2 border-red-600 max-w-md w-full mx-4 p-6 relative">
        <div className="flex items-center justify-center mb-4">
          <div className="bg-red-700 rounded-full p-3">
            <AlertCircle size={48} className="text-white" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white mb-4 text-center">
          Cannot Play Card
        </h2>

        <p className="text-red-100 text-center mb-6 leading-relaxed">
          {errorMessage}
        </p>

        <button
          onClick={onClose}
          className="w-full bg-white hover:bg-red-50 text-red-900 font-bold py-3 px-4 rounded-lg transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );
};
