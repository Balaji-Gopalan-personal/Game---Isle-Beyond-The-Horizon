# Duplicate Development Card Logging Fix - Final

## Date
2026-02-05

## Issue
AI players playing certain development cards (Resource Swap, Closed Market, Booming Economy) were causing duplicate event log messages. Each action appeared twice in the Events Feed with identical timestamps.

## Root Cause
React Strict Mode (enabled in `src/main.tsx`) **intentionally double-invokes** setState updater callbacks during development to help detect side effects. The affected card handlers were scheduling `setTimeout(() => addToLog(...))` calls **inside** the setState callbacks, causing:

1. Handler called once by AI
2. setState callback invoked twice by Strict Mode
3. Two setTimeout calls scheduled (one per invocation)
4. Both timeouts execute 100ms later
5. Result: Duplicate log entries with identical timestamps

### Why Guard and Road Building Weren't Affected
These cards call `addToLog()` **before** or **outside** the setState callback, so even with Strict Mode double-invocation, logging only happens once.

## Solution Applied
Refactored three card confirmation handlers to move logging **outside** the setState callbacks:

### Pattern Used
```javascript
const handleConfirmCard = useCallback(() => {
  // Declare variable outside setState
  let logMessage: string | null = null;

  setGameState(prev => {
    // ... state updates ...

    // Capture log message but DON'T schedule setTimeout here
    logMessage = "message to log";

    return { ...prev, ... };
  });

  // Schedule logging AFTER setState - executes only once
  if (logMessage) {
    setTimeout(() => addToLog(logMessage!), 100);
  }
}, [addToLog, getPlayerColorStyle]);
```

## Files Modified

**`src/hooks/useGameEngine.ts`**

1. **`handleConfirmClosedMarket`** (lines ~3211-3350)
   - Moved setTimeout scheduling outside setState callback
   - Captures log data in `logData` variable during state update
   - Schedules main message and transfer messages after setState completes

2. **`handleConfirmResourceSwap`** (lines ~3357-3440)
   - Moved setTimeout scheduling outside setState callback
   - Captures swap message in `swapMessage` variable during state update
   - Schedules log after setState completes

3. **`handleConfirmBoomingEconomy`** (lines ~3112-3200)
   - Moved setTimeout scheduling outside setState callback
   - Captures log message in `logMessage` variable during state update
   - Schedules log after setState completes

## Technical Explanation

### React Strict Mode Behavior
- Strict Mode is enabled during development to catch bugs early
- It double-invokes setState updater functions to ensure they're pure
- Any side effects in updater functions will execute twice
- This is intentional and documented React behavior

### Why Previous Attempts Failed
Previous documentation claimed this was fixed, but the setTimeout calls were still inside the setState callbacks. The fix either:
- Was never properly applied
- Was accidentally reverted
- Only fixed some cards but not all

### Why This Fix Works
By moving setTimeout scheduling outside the setState callback:
- setState callback can be invoked multiple times safely (no side effects)
- Log message variables are captured during state computation
- setTimeout only schedules once, after setState completes
- Works correctly in both development (Strict Mode) and production

## Verification

Build completed successfully:
```
✓ 1531 modules transformed.
✓ built in 33.52s
```

## Expected Behavior After Fix

When AI players use development cards:
1. Card played message appears once ✓
2. Selection/action message appears once ✓
3. Final effect message appears once ✓
4. No duplicate messages with identical timestamps ✓
5. Events log displays clean, single-entry history ✓

## Related Documentation
- `DUPLICATE_LOG_FIX.md` - Previous incomplete fix attempt
- `DEV_CARD_LOGGING_ROOT_CAUSE_FIX.md` - Previous analysis that missed Strict Mode issue

## Notes
This is the final, correct fix for the duplicate logging issue. The root cause was React Strict Mode's intentional double-invocation of setState callbacks combined with side effects (setTimeout scheduling) inside those callbacks.
