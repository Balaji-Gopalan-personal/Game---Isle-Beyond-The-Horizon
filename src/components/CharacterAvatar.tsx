import { useState, useRef, useEffect } from 'react';
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

// Per-character scale adjustments based on how centered the face is in the original image
const characterScaleMap: Record<string, number> = {
  'astro-boy': 1.5,
  'barbapapa': 1.3,
  'batman': 1.4,
  'bert': 1.6,
  'bravestarr': 1.4,
  'buggy': 1.5,
  'bunny': 1.5,
  'casper': 1.4,
  'caveman': 1.4,
  'chip': 1.5,
  'chipmunk': 1.5,
  'dynomutt': 1.4,
  'flintstone': 1.4,
  'gadget': 1.4,
  'garfield': 1.5,
  'ghost': 1.4,
  'gijoe': 1.4,
  'gobot': 1.3,
  'he-man': 1.4,
  'heathcliff': 1.5,
  'jem': 1.4,
  'jetson': 1.4,
  'josie': 1.4,
  'kermit': 1.5,
  'lion-o': 1.4,
  'mark': 1.4,
  'mouse': 1.6,
  'optimus': 1.3,
  'panther': 1.4,
  'puppy': 1.5,
  'racer': 1.4,
  'rainbow': 1.4,
  'ranger': 1.4,
  'scooby': 1.4,
  'scrooge': 1.5,
  'she-ra': 1.4,
  'smurf': 1.5,
  'snork': 1.5,
  'spidey': 1.4,
  'teddy': 1.5,
  'tenderheart': 1.4,
  'thundarr': 1.4,
  'tmnt': 1.4,
  'tom': 1.5,
  'trakker': 1.4,
  'voltron': 1.3,
  'woody': 1.5,
  'wuzzle': 1.5,
  'yogi': 1.4,
  'zummi': 1.5,
};

export function CharacterAvatar({ character, color, name, size = 'md', className = '' }: CharacterAvatarProps) {
  const { assets } = useAssets();
  const [imageError, setImageError] = useState(false);
  const [imageScale, setImageScale] = useState(1.4);
  const imgRef = useRef<HTMLImageElement>(null);

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

  // Detect optimal scale for each character
  useEffect(() => {
    if (character?.filename) {
      const filename = character.filename.toLowerCase();
      const scale = characterScaleMap[filename] || 1.4;
      setImageScale(scale);
    } else {
      setImageScale(1.4);
    }
  }, [character]);

  // Additional dynamic scaling based on image load
  const handleImageLoad = () => {
    if (!imgRef.current) return;

    const img = imgRef.current;
    const width = img.naturalWidth;
    const height = img.naturalHeight;

    // If image is significantly wider than tall, it might need more zoom
    const aspectRatio = width / height;

    if (character?.filename) {
      const filename = character.filename.toLowerCase();
      let baseScale = characterScaleMap[filename] || 1.4;

      // Adjust based on aspect ratio if needed
      if (aspectRatio > 1.2) {
        baseScale *= 1.1;
      } else if (aspectRatio < 0.8) {
        baseScale *= 1.05;
      }

      setImageScale(baseScale);
    }
  };

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
      className={`${sizeClasses} rounded-full overflow-hidden border-2 shadow-md ${className}`}
      style={{ borderColor: color }}
    >
      <div className="w-full h-full flex items-center justify-center">
        <img
          ref={imgRef}
          src={avatarSrc}
          alt={displayName}
          className="w-full h-full object-cover object-center"
          style={{
            transform: `scale(${imageScale})`,
            transformOrigin: 'center center',
            willChange: 'transform'
          }}
          onLoad={handleImageLoad}
          onError={() => setImageError(true)}
        />
      </div>
    </div>
  );
}
