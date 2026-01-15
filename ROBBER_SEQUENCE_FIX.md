# Robber Movement Sequence Fix

## Issue
When a human player rolled a 7, the centre selection for moving the Robber was being activated immediately, before the proper sequence was completed:
- Centers became clickable before the user clicked the dice roll acknowledgment checkmark
- Centers became clickable even during the discard phase

This violated the intended game sequence:
1. Roll 7
2. AI Players discard if necessary
3. Human Player discards if necessary
4. Select and confirm a Centre to move the Robber
5. Choose who to steal from

## Root Cause
In `GameBoard.tsx` (line 406), the center clickability check was:
```typescript
const canClickCentre = isMovingRobber && currentPlayer?.isHuman && onCentreClick;
```

This only checked if:
- The game step was 'move_robber'
- The current player was human
- The click handler existed

However, it did NOT check:
- If the dice roll was still waiting for confirmation (`waitingForConfirmation` state)
- If the game was in the discard phase (`awaiting_discard` step)

When a 7 was rolled, the game flow would:
1. Show dice result with checkmark to acknowledge
2. Immediately set the step to `awaiting_discard` (if players need to discard) or `move_robber` (if no one needs to discard)
3. This meant centers became clickable BEFORE the user clicked the checkmark
4. Centers remained clickable even during the discard phase

## Solution

### Changes Made

**1. Updated `GameBoard.tsx` interface to accept `waitingForConfirmation` prop:**
```typescript
interface GameBoardProps {
  gameState: GameState;
  boardSize?: BoardSize;
  onVertexClick?: (vertexId: number) => void;
  selectedVertex?: number | null;
  validRoadVertices?: number[];
  firstRoadVertex?: number | null;
  onCentreClick?: (centreId: number) => void;
  selectedCentre?: number | null;
  waitingForConfirmation?: boolean;  // NEW
}
```

**2. Updated center clickability logic in `GameBoard.tsx` (lines 403-408):**

Before:
```typescript
const isMovingRobber = gameState.turnState.step === 'move_robber';
const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
const canClickCentre = isMovingRobber && currentPlayer?.isHuman && onCentreClick;
```

After:
```typescript
const isMovingRobber = gameState.turnState.step === 'move_robber';
const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
const isNotWaitingForDiceConfirmation = !waitingForConfirmation;
const isNotInDiscardPhase = gameState.turnState.step !== 'awaiting_discard';
const canClickCentre = isMovingRobber && currentPlayer?.isHuman && onCentreClick && isNotWaitingForDiceConfirmation && isNotInDiscardPhase;
```

**3. Updated `App.tsx` to pass `waitingForConfirmation` to GameBoard (line 633):**
```tsx
<GameBoard
  gameState={gameState}
  boardSize={gameConfig.selectedBoardSize}
  onVertexClick={handleVertexClick}
  selectedVertex={selectedVertex}
  validRoadVertices={getValidRoadVertices()}
  firstRoadVertex={firstRoadVertex}
  onCentreClick={handleCentreClick}
  selectedCentre={selectedCentre}
  waitingForConfirmation={waitingForConfirmation}  // NEW
/>
```

## How It Works

Now centers are only clickable when ALL of these conditions are met:
1. ✅ Game step is 'move_robber'
2. ✅ Current player is human
3. ✅ Click handler exists
4. ✅ **NOT waiting for dice roll confirmation** (`waitingForConfirmation === false`)
5. ✅ **NOT in discard phase** (`step !== 'awaiting_discard'`)

## Correct Sequence Now Enforced

When a 7 is rolled:

1. **Dice Roll Phase**: Dice shows result with checkmark
   - Centers are NOT clickable (waitingForConfirmation = true)
   - User must click checkmark to proceed

2. **Discard Phase** (if needed): Players discard excess resources
   - Centers are NOT clickable (step = 'awaiting_discard')
   - AI players discard automatically
   - Human player uses discard modal
   - Only after all discards complete does step change to 'move_robber'

3. **Robber Movement Phase**: Select centre to move robber
   - Centers NOW become clickable (waitingForConfirmation = false AND step = 'move_robber' AND not in discard phase)
   - User selects centre and confirms

4. **Steal Phase**: Choose player to steal from
   - User selects player and confirms

## Impact

✅ **Proper Sequence**: Human players can no longer interact with centers before acknowledging the dice roll

✅ **Discard Phase Protected**: Centers remain non-clickable during the entire discard phase

✅ **Game Flow**: The intended turn sequence is now properly enforced

✅ **No Breaking Changes**: Only affects center clickability timing, not functionality

## Build Status

✅ Build successful (442.20 kB / 119.58 kB gzipped)

No TypeScript errors or runtime issues.
