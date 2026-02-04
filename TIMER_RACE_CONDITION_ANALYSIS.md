# Timer Race Condition Analysis - AI Dev Card Effects

## Problem Statement

AI players playing Free Upgrade (and potentially other dev cards) are not showing completion messages in the Events Log:

```
1:33:53 PM - Captain Caveman played Free Upgrade
1:33:53 PM - Captain Caveman is selecting a Village to upgrade
1:33:59 PM - Captain Caveman purchased a Development Card  ← No upgrade completion message!
```

## Flow Tracing

### Free Upgrade Flow

1. **handlePlayFreeUpgradeCard** (line 3008)
   - Sets `step: 'free_upgrade_selection'`
   - Logs: "Captain Caveman is selecting a Village to upgrade" (100ms delay)

2. **useEffect - Free Upgrade AI handler** (line 3642)
   ```typescript
   useEffect(() => {
     if (gameState.phase === 'playing' &&
         gameState.turnState.step === 'free_upgrade_selection') {
       const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
       if (currentPlayer && !currentPlayer.isHuman) {
         if (aiCardEffectProcessingRef.current) return;

         aiCardEffectProcessingRef.current = true;

         const timer = setTimeout(() => {
           const playerVillages = gameState.villages.filter(...);  // ← Stale gameState?
           if (playerVillages.length > 0) {
             handleFreeUpgradeVillageSelection(village.vertexId);  // ← Never called?
           }
           aiCardEffectProcessingRef.current = false;
         }, 800);  // ← 800ms delay

         return () => {
           clearTimeout(timer);  // ← Cleanup cancels timeout!
           aiCardEffectProcessingRef.current = false;
         };
       }
     }
   }, [gameState.phase, gameState.turnState.step, gameState.currentPlayer]);
   ```

3. **handleFreeUpgradeVillageSelection** (line 3370)
   - Upgrades village to city
   - Sets `step: 'play_dev_cards'`
   - Logs: "upgraded a Village to an Estate" (100ms delay)

## Potential Race Conditions

### Race Condition #1: useEffect Cleanup Cancellation

**Hypothesis:** The useEffect cleanup function cancels the timeout before it executes.

**Trigger:** If `gameState.turnState.step` changes during the 800ms timeout period:
1. T+0: step = 'free_upgrade_selection', useEffect runs, 800ms timer starts
2. T+500ms: Something changes `step` (e.g., another action, state update)
3. T+500ms: useEffect cleanup runs, **CANCELS the 800ms timer**
4. T+800ms: Timer was cancelled, handler never executes

**Evidence:**
- User sees "is selecting a Village" but never sees "upgraded a Village"
- 6 seconds later, player is buying dev cards (step must have changed)

### Race Condition #2: Stale Closure Data

**Hypothesis:** The timeout captures stale `gameState` in closure.

**Problem:**
```typescript
const timer = setTimeout(() => {
  const playerVillages = gameState.villages.filter(...);  // ← Captured from closure
  if (playerVillages.length > 0) {
    handleFreeUpgradeVillageSelection(village.vertexId);
  }
}, 800);
```

If `gameState` updates between T+0 and T+800ms, the timeout has stale data:
- Villages might have been added/removed
- Player might have changed
- State might be inconsistent

### Race Condition #3: Handler Recreation

**Hypothesis:** Even though handlers are not in dependency array, they're recreated on renders, causing issues.

**Problem:** While `handleFreeUpgradeVillageSelection` is wrapped in `useCallback`, if its dependencies change, it gets recreated. If the timeout calls the OLD handler, but the component has the NEW handler, there could be inconsistencies.

### Race Condition #4: Multiple Rapid State Updates

**Hypothesis:** Multiple rapid `setGameState` calls cause timing issues.

**Sequence:**
1. handlePlayFreeUpgradeCard calls setGameState (step → 'free_upgrade_selection')
2. 100ms later: addToLog calls setGameState (adds log entry)
3. 800ms later: handleFreeUpgradeVillageSelection calls setGameState (upgrades village)
4. 100ms later: addToLog calls setGameState (adds log entry)

If these overlap incorrectly, state might become inconsistent.

## Comparison with Booming Economy

### Booming Economy Timing
- T+0: step → 'booming_economy_selection'
- T+600ms: Select first resource
- T+800ms: Select second resource (200ms after first)
- T+1100ms: Confirm selection (300ms after second)
- T+1200ms: Log message (100ms after confirm)

**Total:** ~1.2 seconds with 3 sequential timeouts

### Free Upgrade Timing
- T+0: step → 'free_upgrade_selection'
- T+800ms: Select and upgrade village
- T+900ms: Log message (100ms after upgrade)

**Total:** ~0.9 seconds with 1 timeout

**Key Difference:** Booming Economy has multiple sequential calls with staggered timeouts. Free Upgrade has a single call. But Free Upgrade is FAILING to log.

## Critical Questions

### Q1: Is the timeout being cancelled?
**Test:** Add console.log at start and end of setTimeout callback:
```typescript
const timer = setTimeout(() => {
  console.log('🔥 FREE UPGRADE TIMEOUT EXECUTING');
  // ... existing code ...
  console.log('🔥 FREE UPGRADE TIMEOUT COMPLETE');
}, 800);
```

### Q2: Is handleFreeUpgradeVillageSelection being called?
**Test:** Check existing console.log at line 3371:
```typescript
console.log('DEBUG: Free Upgrade village selected:', vertexId);
```

### Q3: Is shouldLog being set correctly?
**Test:** Add console.log before setTimeout in handleFreeUpgradeVillageSelection:
```typescript
console.log(`🔥 shouldLog=${shouldLog}, logMessage="${logMessage}"`);
if (shouldLog) {
  setTimeout(() => addToLog(logMessage), 100);
}
```

### Q4: Is addToLog failing silently?
**Test:** Add console.log inside addToLog (in useCallback):
```typescript
const addToLog = useCallback((message: string) => {
  console.log(`📝 addToLog called with: ${message.substring(0, 50)}...`);
  setGameState(prev => ({
    ...prev,
    eventLog: [{ message, timestamp: Date.now() }, ...prev.eventLog]
  }));
}, []);
```

## Hypothesis: The Real Problem

Looking at the code carefully, I notice that `shouldLog` is a `let` variable that's captured in closures:

```typescript
const handleFreeUpgradeVillageSelection = useCallback((vertexId: number) => {
  let logMessage = '';
  let shouldLog = false;

  setGameState(prev => {
    // ... updates ...
    shouldLog = true;  // ← Set inside setGameState
    logMessage = '...';
    return newState;
  });

  if (shouldLog) {  // ← Read outside setGameState
    setTimeout(() => addToLog(logMessage), 100);
  }
}, [addToLog, getPlayerColorStyle]);
```

**This pattern is CORRECT.** The `setGameState` updater function is synchronous - it captures the values in the outer scope. When we check `if (shouldLog)` after calling `setGameState`, we're reading the updated value.

But there's a subtlety: **if the timeout inside the useEffect never executes**, then `handleFreeUpgradeVillageSelection` is never called, so no log message!

## Most Likely Cause

The 800ms timeout in the Free Upgrade useEffect is being CANCELLED before it executes because:

1. Something is triggering a re-render
2. The useEffect dependency `gameState.turnState.step` is changing
3. The cleanup function runs: `clearTimeout(timer)`
4. The handler never executes

**But what's changing the step?**

Looking at the user's log, there's a 6-second gap between "is selecting" and "purchased a Development Card". This suggests:
- The timeout might be executing
- But something is failing silently
- Or the log message is not being added

## Next Steps

1. Add comprehensive logging to trace the exact execution path
2. Log when timeouts start, execute, and complete
3. Log when cleanup functions run
4. Log all step transitions
5. Verify that `shouldLog` is true when expected
6. Verify that `addToLog` is actually being called
