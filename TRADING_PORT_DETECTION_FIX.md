# Trading Port Detection Fix

## Issue
Trading port detection and logging was not working properly during setup phases T1 (setup-phase-1) and T2 (setup-phase-2). When a village was placed adjacent to a trading port during these phases, the Events Log did not reveal the new trading capability. This functionality worked correctly in T3 (main game phase) and beyond.

## Root Cause
There were two main issues:

1. **Timing Issue**: Trading ports were generated in a `useEffect` hook that ran after game initialization. This created a race condition where villages could be placed before trading ports were available in the game state.

2. **State Update Pattern**: The `checkAndLogTradingPortAccess` function was being called within a problematic `setGameState` pattern that didn't properly pass the updated state:

```typescript
// PROBLEMATIC PATTERN
setGameState(prev => {
  checkAndLogTradingPortAccess(playerId, vertexId, prev);
  return prev;
});
```

This pattern was receiving the old state before the village was fully added to the state.

## Solution
The fix addresses both issues:

### 1. Generate Trading Ports During Initialization
Trading ports are now generated synchronously during game initialization (line ~1865-1889 in `useGameEngine.ts`):

```typescript
// Generate trading ports if enabled
let tradingPorts = undefined;
if (config.gameSettings.tradingPortsEnabled) {
  const vertices = Object.values(boardGraph.vertices).map(v => ({
    id: v.id,
    row: '',
    position: 0,
    x: 0,
    y: 0
  }));

  const edges = Object.values(boardGraph.edges).map(e => ({
    from: e.v1,
    to: e.v2
  }));

  tradingPorts = generateTradingPorts(
    vertices,
    edges,
    config.gameSettings.numberOfTradingPorts,
    boardCenters
  );
}

setGameState({
  // ... other state
  tradingPorts
});
```

This ensures trading ports are available from the very start of the game, including during T1.

### 2. Fix State Update Pattern
All village placement code now properly integrates trading port detection:

```typescript
// FIXED PATTERN
setGameState(prev => {
  const newState = {
    ...prev,
    villages: [...prev.villages, newVillage],
    // ... other state updates
  };

  // Check for trading port access with the updated state
  checkAndLogTradingPortAccess(playerId, vertexId, newState);

  return newState;
});
```

## Files Modified
- `src/hooks/useGameEngine.ts`
  - Game initialization (line ~1865-1925) - Added trading port generation during initialization
  - `placeVillage_P1_wrapper` (line ~1002) - Setup phase village placement
  - `placeVillageToVertex` (line ~1596) - Legacy village placement
  - `handlePlaceVillageGameplay` (line ~3180) - Main game human village placement
  - `handleAIBuildVillage` (line ~3375) - Main game AI village placement

## Implementation Details
1. Trading ports are generated synchronously during game initialization when trading ports are enabled
2. The existing `useEffect` for trading port generation still exists as a fallback but won't run if ports are already initialized
3. All `setGameState` calls that add villages now create a `newState` object first
4. `checkAndLogTradingPortAccess` is called with this `newState` object before returning it
5. This ensures the function receives the complete updated state including the newly placed village
6. The trading port detection now works consistently across all game phases (T1, T2, and T3+)

## Testing
To verify the fix:
1. Start a new game with trading ports enabled
2. During setup phase 1 (T1), place a village adjacent to a trading port
3. Check the Events Log - it should show: "Player X gained access to a [port description]"
4. During setup phase 2 (T2), place a village adjacent to a different trading port
5. Check the Events Log - it should again show the trading port access message
6. During main game (T3+), build a village adjacent to a trading port
7. Verify the message appears in all three phases

## Benefits
- Consistent trading port detection across all game phases
- Players are immediately informed when they gain trading port access
- Both human and AI players benefit from proper port detection logging
- Events Log provides complete information for strategic decision-making
