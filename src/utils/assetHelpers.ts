import { LoadedAssets } from '../contexts/AssetsContext';
import { Assets } from '../assets/assetRegistry';

export function getCharacterImage(assets: LoadedAssets, imagePath: string): string | undefined {
  const filename = imagePath.split('/').pop()?.replace(/\.(png|jpg)$/, '').toLowerCase();
  if (!filename) return undefined;

  const keyMap: Record<string, string> = {
    'astro-boy': 'astroBoy',
    'barbapapa': 'barbapapa',
    'batman': 'batman',
    'bert': 'bert',
    'bravestarr': 'bravestarr',
    'buggy': 'buggy',
    'bunny': 'bunny',
    'casper': 'casper',
    'caveman': 'caveman',
    'chip': 'chip',
    'chipmunk': 'chipmunk',
    'dynomutt': 'dynomutt',
    'flintstone': 'flintstone',
    'gadget': 'gadget',
    'garfield': 'garfield',
    'ghost': 'ghost',
    'gijoe': 'giJoe',
    'gobot': 'gobot',
    'he-man': 'heMan',
    'heathcliff': 'heathcliff',
    'jem': 'jem',
    'jetson': 'jetson',
    'josie': 'josie',
    'kermit': 'kermit',
    'lion-o': 'lionO',
    'mark': 'mark',
    'mouse': 'mouse',
    'optimus': 'optimus',
    'panther': 'panther',
    'puppy': 'puppy',
    'racer': 'racer',
    'rainbow': 'rainbow',
    'ranger': 'ranger',
    'scooby': 'scooby',
    'scrooge': 'scrooge',
    'she-ra': 'sheRa',
    'smurf': 'smurf',
    'snork': 'snork',
    'spidey': 'spidey',
    'teddy': 'teddy',
    'tenderheart': 'tenderheart',
    'thundarr': 'thundarr',
    'tmnt': 'tmnt',
    'tom': 'tom',
    'trakker': 'trakker',
    'voltron': 'voltron',
    'woody': 'woody',
    'wuzzle': 'wuzzle',
    'yogi': 'yogi',
    'zummi': 'zummi'
  };

  const key = keyMap[filename];
  if (!key) return undefined;

  // Try to use loaded data URI first
  const loadedImage = assets.characters[key];
  if (loadedImage && loadedImage.length > 0) {
    return loadedImage;
  }

  // Fallback to original path if data URI failed to load
  return Assets.characters[key as keyof typeof Assets.characters];
}

export function getDevelopmentCardImage(assets: LoadedAssets, imagePath: string): string {
  const filename = imagePath.split('/').pop()?.replace(/\.png$/, '');
  if (!filename) return imagePath;

  const keyMap: Record<string, string> = {
    'Guard': 'guard',
    'ExtraPoint': 'extraPoint',
    'RoadConstruction': 'roadConstruction',
    'BoomingEconomy': 'boomingEconomy',
    'ExpertNegotiator': 'expertNegotiator',
    'ResourceSwap': 'resourceSwap',
    'FreeUpgrade': 'freeUpgrade',
    'ClosedMarket': 'closedMarket'
  };

  const key = keyMap[filename];
  if (!key) return imagePath;

  // Try to use loaded path/URI first
  const loadedImage = assets.developmentCards?.[key];
  if (loadedImage && loadedImage.length > 0) {
    return loadedImage;
  }

  // Fallback to static registry path
  const staticPath = Assets.developmentCards[key as keyof typeof Assets.developmentCards];
  return staticPath || imagePath;
}

export function getResourceImage(assets: LoadedAssets, resourceType: string): string | undefined {
  const keyMap: Record<string, string> = {
    'desert': 'desert',
    'Desert': 'desert',
    'clay': 'clay',
    'Clay': 'clay',
    'lumber': 'lumber',
    'Lumber': 'lumber',
    'grain': 'grain',
    'Grain': 'grain',
    'fabric': 'fabric',
    'Fabric': 'fabric',
    'mineral': 'mineral',
    'Mineral': 'mineral'
  };

  const key = keyMap[resourceType];
  if (!key) return undefined;

  // Try to use loaded data URI first
  const loadedImage = assets.resources?.[key];
  if (loadedImage && loadedImage.length > 0) {
    return loadedImage;
  }

  // Fallback to original path if data URI failed to load
  return Assets.resources[key as keyof typeof Assets.resources];
}

export function getBoardImage(assets: LoadedAssets, imageType: 'ocean' | 'landmass'): string | undefined {
  // Try to use loaded data URI first
  const loadedImage = assets.board?.[imageType];
  if (loadedImage && loadedImage.length > 0) {
    return loadedImage;
  }

  // Fallback to original path if data URI failed to load
  return Assets.board[imageType];
}
