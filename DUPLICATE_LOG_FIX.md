# Duplicate Event Log Fix

## Issue
Multiple development cards were logging duplicate events in the Events Feed. For example, Free Upgrade would show:
```
Captain Caveman upgraded a Village to an Estate for free and earned 1 point
Captain Caveman upgraded a Village to an Estate for free and earned 1 point
```

## Root Cause
The logging code was being called **inside** the `setGameState` updater function. React StrictMode (used during development) intentionally calls state updater functions **twice** to detect side effects. This caused any `setTimeout(() => addToLog(...))` calls inside the updater to be scheduled twice, resulting in duplicate log entries.

## Solution
Moved all logging code **outside** the `setGameState` updater function for all affected cards:

1. **Free Upgrade** - Capture log message in a variable, log after state update
2. **Closed Market** - Capture main message and all transfer messages, log after state update
3. **Resource Swap** - Capture swap message, log after state update
4. **Player-to-Player Trading (Human Accept)** - Capture trade message, log after state update

## Pattern Applied
```javascript
// BEFORE (INCORRECT - logs twice in StrictMode):
setGameState(prev => {
  // ... state updates ...
  setTimeout(() => addToLog(message), 100);
  return { ...prev, ... };
});

// AFTER (CORRECT - logs once):
let logMessage = null;
setGameState(prev => {
  // ... state updates ...
  logMessage = "message to log";
  return { ...prev, ... };
});
if (logMessage) {
  setTimeout(() => addToLog(logMessage), 100);
}
```

## Files Modified
- `src/hooks/useGameEngine.ts` - Fixed 4 functions:
  - `handleConfirmClosedMarket`
  - `handleConfirmResourceSwap`
  - `handleFreeUpgradeVillageSelection`
  - `handleHumanAcceptAITrade`

## Verification
All other development cards (Road Construction, Booming Economy, Guard, Expert Negotiator, Extra Point) already followed the correct pattern of logging outside the state updater and were unaffected by this issue.
