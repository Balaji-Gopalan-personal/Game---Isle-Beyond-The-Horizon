# React Cleanup Race Condition Fix

## Problem
The game was getting stuck when AI players played Booming Economy (and potentially other dev cards). No errors appeared in the console, but the game would not progress after the card was played.

## Root Cause
The issue was a React useEffect cleanup race condition caused by including state values that the effect itself modifies in the dependency array:

1. Effect triggers with `resourcesSelected = []`
2. Sets up timer chain: `timer1 (600ms) → timer2 (200ms) → timer3 (300ms)`
3. After 600ms, `timer1` fires and calls `handleBoomingEconomyResourceSelection(resource1)`
4. This updates state to `resourcesSelected = [resource1]`
5. **React detects the dependency change and re-runs the effect**
6. **React FIRST runs the cleanup function which cancels ALL timeouts (including timer2 and timer3)**
7. The effect condition now fails (`length === 1`, not `0`), so no new timeouts are created
8. **Result**: `timer2` and `timer3` never execute → game is stuck at `booming_economy_selection` step

## The Fix
Removed state values from useEffect dependency arrays when those values are modified by the effect itself through async operations (setTimeout):

### 1. Booming Economy Handler (line 3649)
**Before:**
```typescript
}, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, gameState.turnState.placementContext.resourcesSelected]);
```

**After:**
```typescript
}, [gameState.phase, gameState.turnState.step, gameState.currentPlayer]);
```

### 2. Closed Market Handler (line 3705)
**Before:**
```typescript
}, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, gameState.turnState.placementContext.selectedResource]);
```

**After:**
```typescript
}, [gameState.phase, gameState.turnState.step, gameState.currentPlayer]);
```

### 3. Resource Swap Handler (line 3776)
**Before:**
```typescript
}, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, gameState.turnState.placementContext.selectedPlayerId]);
```

**After:**
```typescript
}, [gameState.phase, gameState.turnState.step, gameState.currentPlayer]);
```

### 4. Free Upgrade Handler (line 3826)
Already correct - no changes needed.

## Why This Fix Works

### Prevents Game Being Stuck
- Timeouts won't be canceled mid-execution because React won't cleanup/re-run the effect
- All three timers (timer1, timer2, timer3) will complete their chain normally
- The game step will properly advance after the card effect completes

### Prevents Duplicate Log Messages
- Guard conditions (`resourcesSelected.length === 0`, `!selectedResource`, etc.) ensure the effect body only runs once per step
- The `aiCardEffectProcessingRef` flag provides additional protection against duplicate execution
- All `addToLog()` calls will execute exactly once

### Preserves All Log Messages
- No setTimeout calls are canceled prematurely
- All log messages (resource selection, card play confirmation) will appear in the Events Log

## Key Principle
**Never include state values in a useEffect's dependency array if the effect itself modifies those values through async operations** (setTimeout, promises, etc.). Use guard conditions instead to prevent duplicate execution.

## Testing Verification
1. ✅ Game no longer gets stuck when AI players play Booming Economy
2. ✅ Events Log messages appear exactly once (no duplicates)
3. ✅ All Events Log messages appear (no missing messages)
4. ✅ Same fix applies to Closed Market, Resource Swap, and Free Upgrade cards
5. ✅ Build completes successfully with no errors
