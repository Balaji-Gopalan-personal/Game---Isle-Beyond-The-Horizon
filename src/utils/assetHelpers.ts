import { LoadedAssets } from '../contexts/AssetsContext';

export function getCharacterImage(assets: LoadedAssets, imagePath: string): HTMLImageElement | undefined {
  const filename = imagePath.split('/').pop()?.replace(/\.(png|jpg)$/, '');
  if (!filename) return undefined;

  const keyMap: Record<string, string> = {
    'Astro-Boy': 'astroBoy',
    'Barbapapa': 'barbapapa',
    'Batman': 'batman',
    'Bert': 'bert',
    'Bravestarr': 'bravestarr',
    'Buggy': 'buggy',
    'Bunny': 'bunny',
    'Casper': 'casper',
    'Caveman': 'caveman',
    'Chip': 'chip',
    'Chipmunk': 'chipmunk',
    'Dynomutt': 'dynomutt',
    'Flintstone': 'flintstone',
    'Gadget': 'gadget',
    'Garfield': 'garfield',
    'Ghost': 'ghost',
    'GIJoe': 'giJoe',
    'Gobot': 'gobot',
    'He-Man': 'heMan',
    'Heathcliff': 'heathcliff',
    'Jem': 'jem',
    'Jetson': 'jetson',
    'Josie': 'josie',
    'Kermit': 'kermit',
    'Lion-O': 'lionO',
    'Mark': 'mark',
    'Mouse': 'mouse',
    'Optimus': 'optimus',
    'Panther': 'panther',
    'Puppy': 'puppy',
    'Racer': 'racer',
    'Rainbow': 'rainbow',
    'Ranger': 'ranger',
    'Scooby': 'scooby',
    'Scrooge': 'scrooge',
    'She-Ra': 'sheRa',
    'Smurf': 'smurf',
    'Snork': 'snork',
    'Spidey': 'spidey',
    'Teddy': 'teddy',
    'Tenderheart': 'tenderheart',
    'Thundarr': 'thundarr',
    'TMNT': 'tmnt',
    'Tom': 'tom',
    'Trakker': 'trakker',
    'Voltron': 'voltron',
    'Woody': 'woody',
    'Wuzzle': 'wuzzle',
    'Yogi': 'yogi',
    'Zummi': 'zummi'
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
