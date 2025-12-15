import React, { createContext, useContext, useState, ReactNode } from 'react';

export type LoadedAssets = {
  characters: Record<string, HTMLImageElement>;
  resources?: Record<string, HTMLImageElement>;
  board?: Record<string, HTMLImageElement>;
  developmentCards?: Record<string, HTMLImageElement>;
};

interface AssetsContextType {
  assets: LoadedAssets;
  setAssets: (assets: LoadedAssets) => void;
  updateGameAssets: (gameAssets: Partial<LoadedAssets>) => void;
}

const AssetsContext = createContext<AssetsContextType | undefined>(undefined);

export const AssetsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [assets, setAssets] = useState<LoadedAssets>({
    characters: {},
  });

  const updateGameAssets = (gameAssets: Partial<LoadedAssets>) => {
    setAssets(prev => ({
      ...prev,
      ...gameAssets,
    }));
  };

  return (
    <AssetsContext.Provider value={{ assets, setAssets, updateGameAssets }}>
      {children}
    </AssetsContext.Provider>
  );
};

export const useAssets = () => {
  const context = useContext(AssetsContext);
  if (context === undefined) {
    throw new Error('useAssets must be used within an AssetsProvider');
  }
  return context;
};
