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

// Per-character scale adjustments - images are circular badges with faces in center
// Need aggressive scaling (2.5-4x) to zoom past badge borders and show just faces
const characterScaleMap: Record<string, number> = {
  'astro-boy': 3.2,
  'barbapapa': 2.8,
  'batman': 3.0,
  'bert': 3.5,
  'bravestarr': 3.0,
  'buggy': 3.2,
  'bunny': 3.2,
  'casper': 3.0,
  'caveman': 3.0,
  'chip': 3.2,
  'chipmunk': 3.2,
  'dynomutt': 3.0,
  'flintstone': 3.0,
  'gadget': 3.0,
  'garfield': 3.2,
  'ghost': 3.0,
  'gijoe': 3.0,
  'gobot': 2.8,
  'he-man': 3.0,
  'heathcliff': 3.2,
  'jem': 3.0,
  'jetson': 3.0,
  'josie': 3.0,
  'kermit': 3.2,
  'lion-o': 3.0,
  'mark': 3.0,
  'mouse': 3.5,
  'optimus': 2.8,
  'panther': 3.0,
  'puppy': 3.2,
  'racer': 3.0,
  'rainbow': 3.0,
  'ranger': 3.0,
  'scooby': 3.0,
  'scrooge': 3.2,
  'she-ra': 3.0,
  'smurf': 3.2,
  'snork': 3.2,
  'spidey': 3.0,
  'teddy': 3.2,
  'tenderheart': 3.0,
  'thundarr': 3.0,
  'tmnt': 3.0,
  'tom': 3.2,
  'trakker': 3.0,
  'voltron': 2.8,
  'woody': 3.2,
  'wuzzle': 3.2,
  'yogi': 3.0,
  'zummi': 3.2,
};

export function CharacterAvatar({ character, color, name, size = 'md', className = '' }: CharacterAvatarProps) {
  const { assets } = useAssets();
  const [imageError, setImageError] = useState(false);
  const [imageScale, setImageScale] = useState(3.0);
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
      const scale = characterScaleMap[filename] || 3.0;
      setImageScale(scale);
    } else {
      setImageScale(3.0);
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
      let baseScale = characterScaleMap[filename] || 3.0;

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
