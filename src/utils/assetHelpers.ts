import { LoadedAssets } from '../contexts/AssetsContext';

export function getCharacterImage(assets: LoadedAssets, imagePath: string): HTMLImageElement | undefined {
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
  return key ? assets.characters[key] : undefined;
}

export function getDevelopmentCardImage(assets: LoadedAssets, imagePath: string): HTMLImageElement | undefined {
  if (!assets.developmentCards) return undefined;

  const filename = imagePath.split('/').pop()?.replace(/\.png$/, '');
  if (!filename) return undefined;

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
  return key ? assets.developmentCards[key] : undefined;
}

export function getResourceImage(assets: LoadedAssets, resourceType: string): HTMLImageElement | undefined {
  if (!assets.resources) return undefined;

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
  return key ? assets.resources[key] : undefined;
}

export function getBoardImage(assets: LoadedAssets, imageType: 'ocean' | 'landmass'): HTMLImageElement | undefined {
  if (!assets.board) return undefined;
  return assets.board[imageType];
}
