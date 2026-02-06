# Development Card Logging - Proper Fix

## Date
2026-02-06

## Problem Summary
AI players playing Resource Swap (and potentially other interactive dev cards) showed no message in the Events Log.

## Root Cause Analysis

### The Issue with React Strict Mode
The problem stems from a fundamental misunderstanding of React's purity requirements for setState updater functions.

**React Strict Mode** double-invokes updater functions to detect side effects and impure code. This is intentional behavior to help developers write more robust code.

### Original Code (Caused Duplicates)
```typescript
setGameState(prev => {
  // ... state updates ...

  setTimeout(() => {
    addToLog(message);
  }, 100);

  return newState;
});
```

**Problem**: setTimeout scheduled INSIDE the setState updater
- Strict Mode double-invokes the updater
- Result: Two timeouts scheduled → duplicate log entries

### First Attempted Fix (Caused No Logs)
```typescript
let swapMessage: string | null = null;

setGameState(prev => {
  // ... state updates ...

  // Mutate outer variable
  swapMessage = "Built message here";

  return newState;
});

if (swapMessage) {
  setTimeout(() => addToLog(swapMessage), 100);
}
```

**Problem**: Variable mutation INSIDE the setState updater violates purity
- This is a side effect that React Strict Mode is designed to detect
- The double-invocation of the updater causes the mutation to be lost or behave unpredictably
- Result: `swapMessage` remains `null` after setState returns → no log entry at all

### Why Undoing Would Cause Duplicates
Because reverting to the original code puts the `setTimeout` scheduling back inside the setState updater, which Strict Mode invokes twice, creating two timeouts that both fire.

## The Correct Solution

Extract ALL data from the current `gameState` BEFORE calling `setState`, build log messages with that data, then schedule timeouts AFTER setState returns:

```typescript
const handleConfirmResourceSwap = useCallback(() => {
  // 1. Extract data from current state BEFORE setState
  const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
  const targetPlayer = gameState.players.find(p => p.id === targetPlayerId);

  if (!currentPlayer || !targetPlayer) return;

  // 2. Build log message BEFORE setState
  const swapMessage = `${currentPlayer.name} swapped with ${targetPlayer.name}`;

  // 3. Call setState (pure function, no side effects)
  setGameState(prev => {
    // ... pure state updates only ...
    return newState;
  });

  // 4. Schedule timeout AFTER setState
  setTimeout(() => {
    addToLog(swapMessage);
  }, 100);
}, [gameState, addToLog]);
```

**Why This Works**:
1. No side effects inside setState updater (pure function)
2. Message is built once from stable data (current gameState)
3. setTimeout scheduled once (outside the updater) → single log entry
4. Works correctly in both development (Strict Mode) and production

## Files Modified
- `/src/hooks/useGameEngine.ts`
  - `handleConfirmResourceSwap()` - Fixed
  - `handleConfirmBoomingEconomy()` - Fixed
  - `handleConfirmClosedMarket()` - Fixed

## Key Principle
**Never perform side effects inside setState updater functions.** Extract all needed data from current state before calling setState, then perform side effects (like logging) after setState returns.

This ensures:
- Updater functions remain pure
- Code works correctly in React Strict Mode
- No duplicate operations
- Predictable, maintainable behavior
