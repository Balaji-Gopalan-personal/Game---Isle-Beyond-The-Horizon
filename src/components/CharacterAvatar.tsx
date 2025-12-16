import { useState } from 'react';
import { useAssets } from '../contexts/AssetsContext';
import { getCharacterImage } from '../utils/assetHelpers';
import type { AICharacter } from '../data/aiCharacters';

interface CharacterAvatarProps {
  character?: AICharacter;
  color: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-16 h-16 text-lg',
  xl: 'w-20 h-20 text-xl',
};

export function CharacterAvatar({ character, color, name, size = 'md', className = '' }: CharacterAvatarProps) {
  const { assets } = useAssets();
  const [imageError, setImageError] = useState(false);

  const getInitials = (displayName: string) => {
    const words = displayName.split(' ');
    if (words.length >= 2) {
      return words[0][0] + words[1][0];
    }
    return displayName.slice(0, 2).toUpperCase();
  };

  const sizeClasses = sizeMap[size];
  const displayName = name || character?.name || 'Player';
  const avatarSrc = character ? getCharacterImage(assets, character.imageUrl)?.src : undefined;

  if (imageError || !avatarSrc) {
    return (
      <div
        className={`${sizeClasses} rounded-full flex items-center justify-center font-bold ${className}`}
        style={{ backgroundColor: color }}
      >
        <span className="text-white drop-shadow-md">
          {getInitials(displayName)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-full overflow-hidden border-2 ${className}`}
      style={{ borderColor: color }}
    >
      <img
        src={avatarSrc}
        alt={displayName}
        className="w-full h-full object-contain scale-110"
        onError={() => setImageError(true)}
      />
    </div>
  );
}
