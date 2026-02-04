# Comprehensive Diagnostic Logging - Dev Card Timer Race Conditions

## Problem
AI players playing dev cards (especially Free Upgrade and Booming Economy) are not showing completion messages in the Events Log despite the card effects executing.

## Approach
Added comprehensive diagnostic logging with `🔥` prefix to trace the exact execution path of timer-based dev card effects and identify race conditions.

## Changes Made

### 1. Free Upgrade useEffect (Line ~3653)

**Added Logging:**
- **Setup:** "🔥 FREE UPGRADE: Setting up 800ms timeout for [Player]"
- **Duplicate guard:** "🔥 FREE UPGRADE: Already processing, skipping"
- **Timeout execution:** "🔥 FREE UPGRADE TIMEOUT EXECUTING for [Player]"
- **Village count:** "🔥 FREE UPGRADE: Found [N] villages to upgrade"
- **Handler call:** "🔥 FREE UPGRADE: Calling handleFreeUpgradeVillageSelection([vertexId])"
- **Completion:** "🔥 FREE UPGRADE TIMEOUT COMPLETE for [Player]"
- **Cleanup:** "🔥 FREE UPGRADE CLEANUP: Cancelling timeout for [Player]"

### 2. handleFreeUpgradeVillageSelection (Line ~3370)

**Added Logging:**
- **Entry:** "🔥 handleFreeUpgradeVillageSelection CALLED with vertexId: [id]"
- **No player:** "🔥 FREE UPGRADE: No current player found!"
- **Invalid village:** "🔥 FREE UPGRADE: Invalid village selection"
- **Upgrading:** "🔥 FREE UPGRADE: Upgrading village [id] for [Player]"
- **Log preparation:** "🔥 FREE UPGRADE: Prepared log message for [Player]"
- **After state update:** "🔥 FREE UPGRADE: State updated. shouldLog=[bool], playerName=[name], logMessage length=[N]"
- **Scheduling log:** "🔥 FREE UPGRADE: Scheduling log message with 100ms delay"
- **Log execution:** "🔥 FREE UPGRADE: addToLog executing now - [message preview]"
- **No log:** "🔥 FREE UPGRADE: shouldLog is FALSE, not logging"
- **Error log:** "🔥 FREE UPGRADE: Logging error message immediately"

### 3. Booming Economy useEffect (Line ~3530)

**Added Logging:**
- **Setup:** "🔥 BOOMING ECONOMY: Setting up 600ms timeout for [Player]"
- **Timeout execution:** "🔥 BOOMING ECONOMY TIMEOUT EXECUTING for [Player]"
- **Completion:** "🔥 BOOMING ECONOMY TIMEOUT COMPLETE for [Player]"
- **Cleanup:** "🔥 BOOMING ECONOMY CLEANUP: Cancelling timeout for [Player]"

### 4. Step Change Tracking (Line ~3703)

**Added useEffect:**
```typescript
useEffect(() => {
  console.log(`🔥 STEP CHANGE: phase=${gameState.phase}, step=${gameState.turnState.step}, currentPlayer=${gameState.currentPlayer}`);
}, [gameState.phase, gameState.turnState.step, gameState.currentPlayer]);
```

This logs EVERY time the turn step changes, helping identify:
- When steps transition
- If steps are changing unexpectedly during timeouts
- If cleanup functions are being triggered by step changes

## Expected Console Output

### Successful Free Upgrade Flow
```
🔥 STEP CHANGE: phase=playing, step=free_upgrade_selection, currentPlayer=2
🔥 FREE UPGRADE: Setting up 800ms timeout for Captain Caveman

[800ms delay]

🔥 FREE UPGRADE TIMEOUT EXECUTING for Captain Caveman
🔥 FREE UPGRADE: Found 3 villages to upgrade
🔥 FREE UPGRADE: Calling handleFreeUpgradeVillageSelection(12)
🔥 handleFreeUpgradeVillageSelection CALLED with vertexId: 12
🔥 FREE UPGRADE: Upgrading village 5 for Captain Caveman
🔥 FREE UPGRADE: Prepared log message for Captain Caveman
🔥 STEP CHANGE: phase=playing, step=play_dev_cards, currentPlayer=2
🔥 FREE UPGRADE: State updated. shouldLog=true, playerName="Captain Caveman", logMessage length=123
🔥 FREE UPGRADE: Scheduling log message with 100ms delay
🔥 FREE UPGRADE TIMEOUT COMPLETE for Captain Caveman

[100ms delay]

🔥 FREE UPGRADE: addToLog executing now - <span style="color: #...">Captain Caveman</span> upgraded a Vi...
```

### Failed Free Upgrade Flow (Timeout Cancelled)
```
🔥 STEP CHANGE: phase=playing, step=free_upgrade_selection, currentPlayer=2
🔥 FREE UPGRADE: Setting up 800ms timeout for Captain Caveman

[Some state change before 800ms]

🔥 STEP CHANGE: phase=playing, step=[something_else], currentPlayer=2
🔥 FREE UPGRADE CLEANUP: Cancelling timeout for Captain Caveman

[Timeout never executes, handler never called, no log message]
```

### Successful Booming Economy Flow
```
🔥 STEP CHANGE: phase=playing, step=booming_economy_selection, currentPlayer=2
🔥 BOOMING ECONOMY: Setting up 600ms timeout for Captain Caveman
💰 Captain Caveman is selecting 2 free resources from Booming Economy...

[600ms delay]

🔥 BOOMING ECONOMY TIMEOUT EXECUTING for Captain Caveman
   ✓ Captain Caveman selected grain and clay
   📋 Reasoning: Selected grain and clay for village

[200ms delay for second selection]

   🎁 Confirming selection...
🎁 handleConfirmBoomingEconomy called
   📋 Prepared log message for Captain Caveman: gained grain, clay
🔥 STEP CHANGE: phase=playing, step=play_dev_cards, currentPlayer=2
   ⏱️ State updated. shouldLog=true, playerName=Captain Caveman, logMessage length=123
🔥 BOOMING ECONOMY TIMEOUT COMPLETE for Captain Caveman

[100ms delay]

   📝 Adding to Events log: <span style="color: #...">Captain Caveman</span> gained...
```

## Diagnostic Questions to Answer

### Q1: Is the timeout being cancelled?
**Look for:** "🔥 FREE UPGRADE CLEANUP" message appearing BEFORE "🔥 FREE UPGRADE TIMEOUT EXECUTING"

**If YES:** The useEffect cleanup is cancelling the timeout prematurely. Check what's triggering the re-render:
- Is `gameState.turnState.step` changing during the timeout?
- Is `gameState.currentPlayer` changing?
- Is `gameState.phase` changing?

### Q2: Is the timeout executing but handler not being called?
**Look for:** "🔥 FREE UPGRADE TIMEOUT EXECUTING" but NOT "🔥 handleFreeUpgradeVillageSelection CALLED"

**If YES:** Something is preventing the handler call. Check:
- Are there 0 villages to upgrade? ("🔥 FREE UPGRADE: Found 0 villages")
- Is the condition failing silently?

### Q3: Is the handler executing but not logging?
**Look for:** "🔥 handleFreeUpgradeVillageSelection CALLED" but NOT "🔥 FREE UPGRADE: addToLog executing now"

**If YES:** The logging mechanism is failing. Check:
- Is `shouldLog` false? ("🔥 FREE UPGRADE: shouldLog is FALSE")
- Is the setTimeout being cancelled?
- Is `addToLog` failing silently?

### Q4: Is addToLog executing but not appearing in UI?
**Look for:** "🔥 FREE UPGRADE: addToLog executing now" in console but nothing in Events Log UI

**If YES:** The Events Log component is not updating. Check:
- Is `setGameState` updating the eventLog array?
- Is the EventsFeed component re-rendering?
- Is there a React rendering issue?

### Q5: Are there unexpected step changes?
**Look for:** Multiple "🔥 STEP CHANGE" messages in rapid succession

**If YES:** Something is causing rapid state updates. Check:
- Are multiple handlers being called simultaneously?
- Is there a state update loop?
- Are there competing setTimeout calls?

### Q6: Are there duplicate executions?
**Look for:** "🔥 FREE UPGRADE: Already processing, skipping" messages

**If YES:** The useEffect is triggering multiple times. Check:
- Is the component re-rendering unnecessarily?
- Is the dependency array correct?
- Is `aiCardEffectProcessingRef.current` being managed correctly?

## Race Condition Patterns to Identify

### Pattern 1: Premature Cleanup
```
🔥 Setting up timeout
🔥 STEP CHANGE (to different step)
🔥 CLEANUP: Cancelling timeout
[timeout never executes]
```
**Cause:** Dependencies changing before timeout completes
**Fix:** Remove unnecessary dependencies or refactor to avoid state changes

### Pattern 2: Stale Closure
```
🔥 Setting up timeout
🔥 TIMEOUT EXECUTING
🔥 Found 0 villages to upgrade
```
**But player actually has villages**
**Cause:** Timeout captured old gameState
**Fix:** Read fresh data inside timeout or restructure dependencies

### Pattern 3: Silent Failure
```
🔥 handleFreeUpgradeVillageSelection CALLED
🔥 State updated. shouldLog=true
[No addToLog execution]
```
**Cause:** setTimeout being cancelled or addToLog failing
**Fix:** Investigate why setTimeout isn't executing

### Pattern 4: Competing Updates
```
🔥 STEP CHANGE: step=free_upgrade_selection
🔥 STEP CHANGE: step=play_dev_cards (immediate)
🔥 STEP CHANGE: step=free_upgrade_selection (again)
```
**Cause:** Multiple handlers updating state simultaneously
**Fix:** Ensure sequential execution or proper guards

## Next Steps

1. **Run the game** with AI players and dev cards
2. **Open browser console** and filter for "🔥" emoji
3. **Observe the logs** when Free Upgrade or Booming Economy is played
4. **Identify which pattern** matches the actual behavior
5. **Apply the appropriate fix** based on the root cause

## Files Modified

- `src/hooks/useGameEngine.ts`
  - Lines ~3370-3470: handleFreeUpgradeVillageSelection with comprehensive logging
  - Lines ~3530-3566: Booming Economy useEffect with diagnostic logging
  - Lines ~3653-3700: Free Upgrade useEffect with diagnostic logging
  - Lines ~3703-3706: Step change tracking useEffect

## Build Status

✅ Build successful (476.90 kB)
✅ Type-safe
✅ Ready for diagnostic testing

## Important Notes

1. All diagnostic logs use `🔥` prefix for easy filtering in console
2. Logs show exact timing of events: setup → execution → completion
3. Cleanup logs show when timeouts are cancelled
4. Step change logs show when dependencies change
5. shouldLog tracking shows if messages are being prepared correctly

With these logs, we can definitively identify:
- Whether timeouts are executing or being cancelled
- Whether handlers are being called
- Whether log messages are being scheduled
- Whether addToLog is executing
- What state transitions are occurring and when
