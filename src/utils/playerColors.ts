export type PlayerColorName = 'red' | 'green' | 'blue' | 'yellow' | 'purple' | 'orange' | 'black';

export interface PlayerColor {
  name: PlayerColorName;
  label: string;
  hex: string;
  rgbText: string;
}

export const PLAYER_COLORS: Record<PlayerColorName, PlayerColor> = {
  red: {
    name: 'red',
    label: 'Red',
    hex: '#EF4444',
    rgbText: 'rgb(239, 68, 68)'
  },
  green: {
    name: 'green',
    label: 'Green',
    hex: '#10B981',
    rgbText: 'rgb(16, 185, 129)'
  },
  blue: {
    name: 'blue',
    label: 'Blue',
    hex: '#3B82F6',
    rgbText: 'rgb(59, 130, 246)'
  },
  yellow: {
    name: 'yellow',
    label: 'Yellow',
    hex: '#F59E0B',
    rgbText: 'rgb(245, 158, 11)'
  },
  purple: {
    name: 'purple',
    label: 'Purple',
    hex: '#8B5CF6',
    rgbText: 'rgb(139, 92, 246)'
  },
  orange: {
    name: 'orange',
    label: 'Orange',
    hex: '#F97316',
    rgbText: 'rgb(249, 115, 22)'
  },
  black: {
    name: 'black',
    label: 'Black',
    hex: '#374151',
    rgbText: 'rgb(55, 65, 81)'
  }
};

export const PLAYER_COLOR_ARRAY: PlayerColor[] = [
  PLAYER_COLORS.red,
  PLAYER_COLORS.green,
  PLAYER_COLORS.blue,
  PLAYER_COLORS.yellow,
  PLAYER_COLORS.purple,
  PLAYER_COLORS.orange,
  PLAYER_COLORS.black
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
