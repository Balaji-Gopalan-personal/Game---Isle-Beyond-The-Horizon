# Robber Same Position Bug Fix

## Problem
The AI was repeatedly moving the robber to the same hex location, even moving from that location back to itself, which violates the game rules that the robber cannot stay on the same hex.

## Root Cause
In `src/hooks/useGameEngine.ts` at the AI robber movement logic (lines 4391-4548), the code had a **stale closure problem**:

1. The `selectRobberPlacement` function was being called with `gameState` from the outer closure
2. This `gameState` was captured when the useEffect first ran, but by the time the setTimeout executed, the actual state had changed
3. The `gameState` passed to `selectRobberPlacement` had an outdated `robberPosition`, so the filtering logic (which excludes the current robber position) was checking against a stale value
4. As a result, the AI could select the current robber position because it didn't know where the robber actually was

### Code Structure Issue
```typescript
// BEFORE (Buggy - Stale Closure)
useEffect(() => {
  // gameState captured here from useEffect dependency

  setTimeout(() => {
    const robberPlacement = selectRobberPlacement(
      currentPlayer,
      gameState, // ❌ Stale - from outer closure
      boardSize,
      difficulty
    );

    setGameState(prev => ({
      ...prev,
      robberPosition: robberPlacement.hexId // Updates state but too late
    }));
  }, 1500);
}, [gameState, ...]);
```

The filtering in `selectRobberPlacement`:
```typescript
const validHexes = gameState.boardCenters.filter(center =>
  center.id !== gameState.robberPosition // ❌ Checking against stale position
);
```

## Solution
Refactored the robber movement logic to use **fresh state** from the state updater function:

```typescript
// AFTER (Fixed - Fresh State)
setTimeout(() => {
  setGameState(prev => { // prev is always fresh
    console.log('DEBUG: Current robber position in state:', prev.robberPosition);

    const robberPlacement = selectRobberPlacement(
      currentPlayer,
      prev, // ✅ Fresh state from updater
      boardSize,
      difficulty
    );

    // Extra safety check
    if (robberPlacement.hexId === prev.robberPosition) {
      console.error('ERROR: AI tried to move robber to same position!', newCentreId);
      return prev; // Don't update if invalid
    }

    // Move robber and handle stealing all in one state update
    return {
      ...prev,
      robberPosition: robberPlacement.hexId,
      // ... rest of state updates
    };
  });
}, 1500);
```

### Key Improvements

1. **Fresh State Access**: Call `selectRobberPlacement` with `prev` from inside the state updater, ensuring it always has the current robber position

2. **Single State Update**: Combined robber movement and resource stealing into a single state update instead of nested callbacks with multiple state updates

3. **Validation Guard**: Added an extra safety check that prevents updating state if the AI somehow selects the same position

4. **Eliminated Stale References**: Removed references to `gameState`, `boardCenters`, and other variables from outer closures

## Result
- The AI now always has access to the current robber position when making decisions
- The robber can never be moved to the same position twice
- The validation logic in `selectRobberPlacement` works correctly with fresh data
- Cleaner code with a single atomic state update

## Testing
The console logs will now show:
- "DEBUG: Current robber position in state: X" before each decision
- "ERROR: AI tried to move robber to same position!" if the safety check catches an issue (should never happen now)
- Robber moves should always be to different hexes
