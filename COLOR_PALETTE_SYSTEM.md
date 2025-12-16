# Player Color Palette System

## Overview
The game uses a standardized 7-color palette for all player-related visual elements. This ensures consistency across:
- Player Dashboards
- Villages, Estates, and Roads on the Board
- Dice borders and backgrounds in the Action Box
- Player names in the Events Log
- Setup Screen color selection

## The 7 Standard Colors

| Color Name | Hex Value | RGB Value | Display Label |
|------------|-----------|-----------|---------------|
| Red        | #EF4444   | rgb(239, 68, 68) | Red |
| Green      | #10B981   | rgb(16, 185, 129) | Green |
| Blue       | #3B82F6   | rgb(59, 130, 246) | Blue |
| Yellow     | #F59E0B   | rgb(245, 158, 11) | Yellow |
| Purple     | #8B5CF6   | rgb(139, 92, 246) | Purple |
| Orange     | #F97316   | rgb(249, 115, 22) | Orange |
| Black      | #374151   | rgb(55, 65, 81) | Black |

## Implementation

### Centralized Color Palette
All player colors are defined in a single source file:
```typescript
// src/utils/playerColors.ts
```

This file exports:
- `PLAYER_COLORS`: Record of all 7 colors with their hex and RGB values
- `PLAYER_COLOR_ARRAY`: Array of colors for iteration
- `getPlayerColorHex(colorName)`: Utility function to get hex value
- `getPlayerColorRgb(colorName)`: Utility function to get RGB value
- `getPlayerColor(colorName)`: Utility function to get full color object
- `isValidPlayerColor(colorName)`: Type guard for validation

### Usage Across Components

#### 1. GameSetup Component
The setup screen uses `PLAYER_COLOR_ARRAY` to populate the color selection dropdown:
```typescript
import { PLAYER_COLOR_ARRAY } from '../utils/playerColors';

const availableColors = PLAYER_COLOR_ARRAY.map(color => ({
  value: color.name,
  label: color.label,
  color: color.hex
}));
```

#### 2. PlayerDashboard Component
Player cards display with consistent colors:
```typescript
import { getPlayerColorHex } from '../utils/playerColors';

const getPlayerColorStyle = (color: string) => {
  return getPlayerColorHex(color);
};
```

#### 3. GameBoard Component (SVG Elements)
Villages, estates, and roads render with precise hex colors:
```typescript
import { getPlayerColorHex } from '../utils/playerColors';

// For villages/estates
<text
  fill={getPlayerColorHex(villagePlayer.color)}
  stroke={getPlayerColorHex(villagePlayer.color)}
>
  {village.type === 'city' ? '⛫' : '⌂'}
</text>

// For roads
<line
  stroke={getPlayerColorHex(roadPlayer.color)}
  strokeWidth="18"
/>

// For vertex highlights
<circle
  stroke={getPlayerColorHex(currentPlayer.color)}
  strokeDasharray="8,4"
/>
```

#### 4. ActionPrompt Component (Dice)
Dice display with player-colored borders and light backgrounds:
```typescript
import { getPlayerColorHex } from '../utils/playerColors';

const getPlayerColorStyle = (color: string) => {
  return getPlayerColorHex(color);
};

const getPlayerLightColor = (color: string) => {
  const lightColorMap: Record<string, string> = {
    red: '#FEE2E2',
    green: '#D1FAE5',
    blue: '#DBEAFE',
    yellow: '#FEF3C7',
    purple: '#F3E8FF',
    orange: '#FFEDD5',
    black: '#F3F4F6'
  };
  return lightColorMap[color] || '#FFFFFF';
};

// Applied to dice
<div style={{
  backgroundColor: getPlayerLightColor(currentPlayer.color),
  borderColor: getPlayerColorStyle(currentPlayer.color)
}}>
  {renderDiceDots(diceValue)}
</div>
```

#### 5. useGameEngine Hook (Events Log)
Player names in log messages use colored HTML:
```typescript
import { getPlayerColorHex } from '../utils/playerColors';

const getPlayerColorStyle = useCallback((color: string) => {
  return getPlayerColorHex(color);
}, []);

// Applied in log messages
const playerColor = getPlayerColorStyle(player.color);
const message = `<span style="color: ${playerColor}; font-weight: bold;">${player.name}</span> ...`;
addToLog(message);
```

## Light Color Variants

For dice backgrounds and other UI elements requiring subtle tints:

| Color | Light Variant Hex |
|-------|-------------------|
| Red   | #FEE2E2 |
| Green | #D1FAE5 |
| Blue  | #DBEAFE |
| Yellow | #FEF3C7 |
| Purple | #F3E8FF |
| Orange | #FFEDD5 |
| Black  | #F3F4F6 |

These light variants provide sufficient contrast while maintaining visual connection to the main player color.

## Color Selection in Setup

Players choose their color from the full palette of 7 colors. The system automatically:
1. Shows all 7 colors as options
2. Assigns different colors to AI players
3. Prevents color conflicts between players
4. Displays color previews in the setup UI

## Benefits of Centralized System

1. **Consistency**: All components use identical color values
2. **Maintainability**: Single source of truth for all player colors
3. **Type Safety**: TypeScript types ensure valid color names
4. **Scalability**: Easy to add or modify colors in one place
5. **Accessibility**: Standardized colors ensure readability across all contexts

## Technical Notes

### SVG Color Rendering
SVG elements require hex color values for proper rendering. The `getPlayerColorHex()` function ensures:
- Color names (e.g., "red") are converted to hex (#EF4444)
- Consistent rendering across browsers
- Proper stroke and fill operations

### HTML Color Rendering
For HTML elements and inline styles:
- Use `style={{ color: getPlayerColorHex(playerColor) }}`
- Or use Tailwind classes where appropriate
- Dice and other bordered elements use both border and background colors

### Log Message Colors
Events feed uses inline styles for colored player names:
```html
<span style="color: #EF4444; font-weight: bold;">Alice</span> built a village
```

## Future Enhancements

Potential improvements to the color system:
1. Add accessibility mode with high-contrast colors
2. Support custom color themes
3. Add colorblind-friendly palette options
4. Implement color validation at runtime
5. Add visual color picker in setup

## Migration Notes

This system replaced multiple separate color definitions:
- **Before**: Each component had its own color map with different shades
- **After**: Single centralized palette with consistent hex values
- **Breaking Changes**: None - all color names remain the same

The previous system used darker shades for text readability, but the new system uses the same bright colors throughout, ensuring visual consistency between board elements, dashboards, and dice.
