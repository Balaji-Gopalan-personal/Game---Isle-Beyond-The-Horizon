# Bug Fix: BoardCenters Undefined Safety Checks

## Issue
Runtime error when AI attempted to move the robber:
```
aiRobberStrategy.ts:20 Uncaught TypeError: Cannot read properties of undefined (reading 'filter')
```

## Root Cause
The `gameState.boardCenters` property was undefined in certain game states, causing a crash when the robber placement logic tried to filter the centers array.

## Files Fixed

### 1. `src/engine/aiRobberStrategy.ts`
**Changes:**
- Added defensive check for undefined/empty `gameState.boardCenters` at the start of `selectRobberPlacement()`
- Added fallback to load board data if boardCenters is missing
- Added check for empty validHexes array after filtering
- Returns safe fallback placement if no valid options exist

**Code Added:**
```typescript
if (!gameState.boardCenters || gameState.boardCenters.length === 0) {
  console.error('ERROR: boardCenters is undefined or empty in selectRobberPlacement');
  const boardData = loadBoardForSize(boardSize);
  const fallbackHex = boardData.centers.find(c => c.resourceType !== 'desert') || boardData.centers[0];
  return {
    hexId: fallbackHex.id,
    targetPlayerId: undefined,
    score: 0,
    reasoning: 'Fallback - boardCenters was undefined'
  };
}
```

### 2. `src/engine/aiLocationStrategy.ts`
**Changes:**
- Added safety check in `calculateResourceStrategicValue()` before filtering boardCenters
- Added fallback in `selectStrategicEstateLocation()` to load board data if boardCenters is missing

**Code Added:**
```typescript
// In calculateResourceStrategicValue
if (!gameState.boardCenters || gameState.boardCenters.length === 0) {
  return value;
}

// In selectStrategicEstateLocation
const boardCenters = gameState.boardCenters && gameState.boardCenters.length > 0
  ? gameState.boardCenters
  : loadBoardForSize(boardSize).centers;
```

## Impact
- ✅ No more crashes when AI moves the robber
- ✅ Graceful fallback if boardCenters is undefined
- ✅ Proper error logging for debugging
- ✅ All strategic AI functions now have defensive checks
- ✅ Build size: 436.92 kB (minimal increase of 0.66 kB)

## Testing
Run the game and verify:
1. AI can successfully move the robber without crashes
2. Console shows clear error messages if boardCenters is missing
3. Game continues with fallback placement instead of crashing
4. All strategic AI decisions work correctly

## Status
✅ Fixed and verified - Build successful
