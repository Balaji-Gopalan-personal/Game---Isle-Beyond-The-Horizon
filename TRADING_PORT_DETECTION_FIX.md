# Trading Port Detection Fix

## Issue
Trading port detection and logging was not working properly during setup phases T1 (setup-phase-1) and T2 (setup-phase-2). When a village was placed adjacent to a trading port during these phases, the Events Log did not reveal the new trading capability. This functionality worked correctly in T3 (main game phase) and beyond.

## Root Cause
The `checkAndLogTradingPortAccess` function was being called within a problematic `setGameState` pattern:

```typescript
// PROBLEMATIC PATTERN
setGameState(prev => {
  checkAndLogTradingPortAccess(playerId, vertexId, prev);
  return prev;
});
```

This pattern had two issues:
1. The function was receiving the old state (`prev`) before the village was fully added to the state
2. The outer `setGameState` was returning `prev` without any changes, potentially interfering with the internal `setGameState` call made by `addColoredLog` within `checkAndLogTradingPortAccess`

## Solution
The fix refactors all village placement code to properly integrate trading port detection:

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
  - `placeVillage_P1_wrapper` (line ~1002) - Setup phase village placement
  - `placeVillageToVertex` (line ~1596) - Legacy village placement
  - `handlePlaceVillageGameplay` (line ~3180) - Main game human village placement
  - `handleAIBuildVillage` (line ~3375) - Main game AI village placement

## Implementation Details
1. All `setGameState` calls that add villages now create a `newState` object first
2. `checkAndLogTradingPortAccess` is called with this `newState` object before returning it
3. This ensures the function receives the complete updated state including the newly placed village
4. The trading port detection now works consistently across all game phases (T1, T2, and T3+)

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
