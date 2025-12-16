export type PlayerColorName = 'black' | 'red' | 'orange' | 'yellow' | 'green' | 'blue';

export interface PlayerColor {
  name: PlayerColorName;
  label: string;
  hex: string;
  rgbText: string;
}

export const PLAYER_COLORS: Record<PlayerColorName, PlayerColor> = {
  black: {
    name: 'black',
    label: 'Black',
    hex: '#000000',
    rgbText: 'rgb(0, 0, 0)'
  },
  red: {
    name: 'red',
    label: 'Red',
    hex: '#E52600',
    rgbText: 'rgb(229, 38, 0)'
  },
  orange: {
    name: 'orange',
    label: 'Orange',
    hex: '#E5983D',
    rgbText: 'rgb(229, 152, 61)'
  },
  yellow: {
    name: 'yellow',
    label: 'Yellow',
    hex: '#D3D521',
    rgbText: 'rgb(211, 213, 33)'
  },
  green: {
    name: 'green',
    label: 'Green',
    hex: '#009500',
    rgbText: 'rgb(0, 149, 0)'
  },
  blue: {
    name: 'blue',
    label: 'Blue',
    hex: '#0433FF',
    rgbText: 'rgb(4, 51, 255)'
  }
};

export const PLAYER_COLOR_ARRAY: PlayerColor[] = [
  PLAYER_COLORS.black,
  PLAYER_COLORS.red,
  PLAYER_COLORS.orange,
  PLAYER_COLORS.yellow,
  PLAYER_COLORS.green,
  PLAYER_COLORS.blue
];

export function getPlayerColorHex(colorName: string): string {
  const color = PLAYER_COLORS[colorName as PlayerColorName];
  return color ? color.hex : colorName;
}

export function getPlayerColorRgb(colorName: string): string {
  const color = PLAYER_COLORS[colorName as PlayerColorName];
  return color ? color.rgbText : colorName;
}

export function getPlayerColor(colorName: string): PlayerColor | null {
  return PLAYER_COLORS[colorName as PlayerColorName] || null;
}

export function isValidPlayerColor(colorName: string): colorName is PlayerColorName {
  return colorName in PLAYER_COLORS;
}
