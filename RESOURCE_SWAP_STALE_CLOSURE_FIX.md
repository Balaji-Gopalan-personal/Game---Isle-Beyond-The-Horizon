# Resource Swap Stale Closure Fix

## Problem
The Resource Swap card (and other dev card effects) were getting stuck because of a **stale closure issue**.

When the AI played Resource Swap:
1. `handlePlayDevCard` was called, setting `step: 'resource_swap_selection'`
2. AI timeout fired `handleResourceSwapPlayerSelection` to select target player
3. AI timeout fired `handleConfirmResourceSwap` to confirm
4. **BUG**: `handleConfirmResourceSwap` read from the stale `gameState` captured in its closure
5. The `selectedPlayerId` was `undefined` because the callback was using an old version of gameState
6. The function returned early, leaving the game stuck in `resource_swap_selection` step

### Root Cause
The handlers used `gameState` from their closure scope:
```typescript
const handleConfirmResourceSwap = useCallback(() => {
  // This reads from gameState captured when callback was created
  const targetPlayerId = gameState.turnState.placementContext.selectedPlayerId;
  // ...
}, [gameState, addToLog, getPlayerColorStyle]);
```

When rapid state changes occurred (AI selecting then confirming), the callback had a stale `gameState` that didn't include the latest updates.

## Solution
Use **refs to store log data** extracted from inside `setGameState` where we have fresh data via the `prev` parameter.

### Implementation Pattern
1. Extract data from `prev` parameter inside `setGameState` (always fresh)
2. Store log data in a ref (safe mutation, doesn't violate setState purity)
3. Schedule logging outside `setGameState` using the ref value
4. Clear ref after use

### Code Changes

**Added refs:**
```typescript
const boomingEconomyLogDataRef = useRef<string | null>(null);
const closedMarketLogDataRef = useRef<{ main: string; transfers: string[] } | null>(null);
const resourceSwapLogDataRef = useRef<string | null>(null);
const freeUpgradeLogDataRef = useRef<string | null>(null);
```

**Fixed handlers:**
- `handleConfirmBoomingEconomy` - now reads `resourcesSelected` from `prev`
- `handleConfirmClosedMarket` - now reads `selectedResource` and player data from `prev`
- `handleConfirmResourceSwap` - now reads `selectedPlayerId` from `prev`
- `handleFreeUpgradeVillageSelection` - now avoids side effects inside setState

**Pattern example:**
```typescript
const handleConfirmResourceSwap = useCallback(() => {
  setGameState(prev => {
    // Extract from FRESH prev parameter
    const targetPlayerId = prev.turnState.placementContext.selectedPlayerId;
    const targetPlayer = prev.players.find(p => p.id === targetPlayerId);

    // Store log message in ref
    resourceSwapLogDataRef.current = buildLogMessage(...);

    return newState;
  });

  // Use ref outside setState
  setTimeout(() => {
    if (resourceSwapLogDataRef.current) {
      addToLog(resourceSwapLogDataRef.current);
      resourceSwapLogDataRef.current = null;
    }
  }, 100);
}, [addToLog, getPlayerColorStyle]); // No gameState dependency!
```

## Benefits
1. **No stale closures**: Data extracted from `prev` is always current
2. **Pure setState**: No side effects (setTimeout) inside the updater function
3. **No extra dependencies**: Removed `gameState` from dependency arrays
4. **Consistent pattern**: All dev card effects follow the same approach

## Testing
Resource Swap, Booming Economy, Closed Market, and Free Upgrade cards should now work correctly for both AI and human players without getting stuck.
