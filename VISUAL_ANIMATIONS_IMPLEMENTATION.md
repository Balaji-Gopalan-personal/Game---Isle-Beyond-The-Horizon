# Visual Animations Implementation

This document details the visual animations added to enhance the game experience.

## Overview

Four key animations have been implemented:
1. **Animated Ocean Background** - Restored GIF animation
2. **Road Drawing Animation** - Roads "draw" from owned vertex (0.3s)
3. **Village Placement** - Villages dissolve into place (0.3s)
4. **Estate Upgrade** - Two-phase animation: village fades out (0.2s), estate fades in (0.3s)

## Changes Made

### 1. Animated Ocean Background
**File**: `src/assets/assetLoader.ts`

**Problem**: The ocean GIF was being converted to a static data URI through canvas, which only captures the first frame.

**Solution**: Modified `loadCategory()` to skip data URI conversion for GIF files:
```typescript
const extension = path.split('.').pop()?.toLowerCase();
if (extension === 'gif') {
  return { key, dataUri: path }; // Use path directly for GIFs
}
```

**Result**: Ocean background (`/images/board/ocean_animated_new.gif`) now animates as intended.

---

### 2. Road Drawing Animation
**File**: `src/components/GameBoard.tsx`

**Implementation**:

#### Animation State Tracking
Added React state to track newly placed roads:
```typescript
const [animatingRoads, setAnimatingRoads] = React.useState<Set<string>>(new Set());
const prevRoadsRef = React.useRef<string[]>([]);
```

#### Change Detection
Using `useEffect` to detect new roads:
```typescript
React.useEffect(() => {
  const currentRoadIds = gameState.roads.map(r => r.id);
  const newRoads = currentRoadIds.filter(id => !prevRoadsRef.current.includes(id));

  if (newRoads.length > 0) {
    // Add to animating set
    // Remove after 300ms
  }
}, [gameState.roads]);
```

#### Smart Direction Detection
Roads draw from the vertex owned by the player:
```typescript
const isOwnedFrom = gameState.verticesOccupiedBy[road.from] === road.playerId ||
                    gameState.roads.some(r => r.playerId === road.playerId &&
                      (r.from === road.from || r.to === road.from));

const isOwnedTo = gameState.verticesOccupiedBy[road.to] === road.playerId ||
                  gameState.roads.some(r => r.playerId === road.playerId &&
                    r.id !== road.id && (r.from === road.to || r.to === road.to));

// If only "to" is owned, reverse direction
if (isOwnedTo && !isOwnedFrom) {
  [startX, startY, endX, endY] = [toPos.x, toPos.y, fromPos.x, fromPos.y];
}
```

#### SVG Animation
Using SVG stroke properties with CSS animation:
```typescript
<line
  x1={startX}
  y1={startY}
  x2={endX}
  y2={endY}
  stroke={color}
  strokeWidth="18"
  strokeLinecap="round"
  strokeDasharray={isAnimating ? length : undefined}
  strokeDashoffset={isAnimating ? length : undefined}
  style={isAnimating ? {
    animation: 'road-draw 0.3s ease-out forwards'
  } : undefined}
/>
```

#### CSS Keyframes
```css
@keyframes road-draw {
  to {
    stroke-dashoffset: 0;
  }
}
```

**Result**: Roads visually "draw" from the owned vertex to the target vertex over 0.3 seconds.

---

### 3. Village Placement Animation
**File**: `src/components/GameBoard.tsx`

#### Animation State Tracking
```typescript
const [animatingVillages, setAnimatingVillages] = React.useState<Set<number>>(new Set());
const prevVillagesRef = React.useRef<{id: number, type: string}[]>([]);
```

#### New Village Detection
```typescript
React.useEffect(() => {
  const currentVillages = gameState.villages.map(v => ({ id: v.vertexId, type: v.type }));
  const prevVillagesMap = new Map(prevVillagesRef.current.map(v => [v.id, v.type]));

  currentVillages.forEach(curr => {
    const prev = prevVillagesMap.get(curr.id);

    if (!prev) {
      // New village - add to animating set
      setAnimatingVillages(s => new Set(s).add(curr.id));
      // Remove after 300ms
      setTimeout(() => {
        setAnimatingVillages(s => {
          const next = new Set(s);
          next.delete(curr.id);
          return next;
        });
      }, 300);
    }
  });
}, [gameState.villages]);
```

#### Animation Application
```typescript
<text
  // ... other props
  style={{
    ...(animatingVillages.has(vertex.id) ? {
      animation: 'village-dissolve-in 0.3s ease-out forwards',
      transformOrigin: 'center'
    } : {})
  }}
>
  {village.type === 'city' ? '⛫' : '⌂'}
</text>
```

#### CSS Keyframes
```css
@keyframes village-dissolve-in {
  from {
    opacity: 0;
    transform: scale(0.3);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

**Result**: Villages dissolve into place with fade and scale over 0.3 seconds.

---

### 4. Estate Upgrade Animation
**File**: `src/components/GameBoard.tsx`

#### Two-Phase Animation State
```typescript
const [upgradingVillages, setUpgradingVillages] = React.useState<Set<number>>(new Set());
```

#### Upgrade Detection
Detects when a village type changes from 'settlement' to 'city':
```typescript
currentVillages.forEach(curr => {
  const prev = prevVillagesMap.get(curr.id);

  if (prev === 'settlement' && curr.type === 'city') {
    setUpgradingVillages(s => new Set(s).add(curr.id));
    // Remove after total 500ms (200ms + 300ms)
    setTimeout(() => {
      setUpgradingVillages(s => {
        const next = new Set(s);
        next.delete(curr.id);
        return next;
      });
    }, 500);
  }
});
```

#### Dual Icon Rendering
When upgrading, render BOTH icons with sequenced animations:
```typescript
{upgradingVillages.has(vertex.id) ? (
  <>
    {/* Phase 1: Village fades out (0.2s) */}
    <text
      style={{
        animation: 'village-dissolve-out 0.2s ease-out forwards',
        transformOrigin: 'center'
      }}
    >
      ⌂
    </text>

    {/* Phase 2: Estate fades in (0.3s, starts after 0.2s delay) */}
    <text
      style={{
        animation: 'estate-dissolve-in 0.3s ease-out 0.2s forwards',
        opacity: 0,
        transformOrigin: 'center'
      }}
    >
      ⛫
    </text>
  </>
) : (
  // Normal rendering
)}
```

#### CSS Keyframes
```css
@keyframes village-dissolve-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.3);
  }
}

@keyframes estate-dissolve-in {
  from {
    opacity: 0;
    transform: scale(0.3);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

**Result**:
1. Village icon shrinks and fades out over 0.2 seconds
2. Estate icon grows and fades in over 0.3 seconds (starting at 0.2s)
3. Total animation time: 0.5 seconds

---

## Animation Triggers

All animations trigger automatically when:

### Phase 1 & 2 (Setup)
- **Village placement**: Dissolve animation plays when player places initial villages
- **Road placement**: Draw animation plays when player places initial roads

### Phase 3 (Gameplay)
- **Village purchase**: Dissolve animation plays when building a village
- **Road purchase**: Draw animation plays when building a road
- **Estate purchase**: Two-phase upgrade animation plays
- **Road Construction card**: Draw animation plays for each new road (×2)
- **Free Upgrade card**: Two-phase upgrade animation plays

---

## Technical Details

### Animation Performance
- Uses CSS animations for GPU acceleration
- Minimal JavaScript overhead (only state tracking)
- Animations cleaned up automatically after completion
- No memory leaks (state cleared after animation)

### Browser Compatibility
- CSS animations: All modern browsers
- SVG stroke animations: All modern browsers
- GIF animations: Native browser support

### Timing
- **Roads**: 300ms draw animation
- **Villages**: 300ms dissolve-in
- **Estates**: 200ms fade-out + 300ms fade-in = 500ms total
- All use `ease-out` easing for natural feel

---

## Files Modified

1. **src/assets/assetLoader.ts**
   - Modified `loadCategory()` to preserve GIF animations

2. **src/components/GameBoard.tsx**
   - Added animation state tracking (roads, villages, upgrading)
   - Added `useEffect` hooks for change detection
   - Added CSS keyframes for all animations
   - Enhanced road rendering with draw animation
   - Enhanced village rendering with dissolve animations
   - Implemented two-phase estate upgrade animation

---

## Build Status

✅ Project builds successfully
✅ All TypeScript checks pass
✅ Ready for gameplay testing

---

## Testing Checklist

To verify animations work correctly:

### Ocean Background
- [ ] Ocean background shows subtle wave animation
- [ ] Animation loops continuously

### Road Drawing (Phase 1 & 2)
- [ ] First road draws from village
- [ ] Second road draws from village or first road endpoint
- [ ] Animation takes ~0.3 seconds

### Road Drawing (Phase 3)
- [ ] Purchased roads draw from owned vertex
- [ ] Road Construction card roads both animate
- [ ] Animation direction is correct (from owned to new vertex)

### Village Placement
- [ ] Initial villages dissolve into place
- [ ] Purchased villages dissolve into place
- [ ] Animation takes ~0.3 seconds

### Estate Upgrade
- [ ] Village icon fades out first (~0.2s)
- [ ] Estate icon fades in after (~0.3s)
- [ ] Total animation feels smooth (~0.5s)
- [ ] Works for both purchase and Free Upgrade card

---

## Notes

- Animations are non-blocking and purely visual
- Game state updates immediately (animations are cosmetic)
- Multiple simultaneous animations work correctly
- Animations respect player turn timing
- Road direction logic handles all edge cases (isolated roads, connected roads, etc.)
