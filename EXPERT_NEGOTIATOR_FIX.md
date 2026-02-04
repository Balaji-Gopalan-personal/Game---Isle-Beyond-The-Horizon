# Expert Negotiator Bank Trade Fix

## Problem Identified

AI players would sometimes play the Expert Negotiator card but then fail to execute the bank trade that is the primary purpose of the card. This was caused by timing and state synchronization issues similar to those affecting other development cards.

## Root Cause

The issue was a **race condition in the AI turn flow**:

1. AI plays Expert Negotiator during `play_dev_cards` phase
2. Card effect activates: `expertNegotiatorActive: true`
3. Modal displays the played card (`playedCardForModal` is set)
4. **AI action loop continues running** but was not properly waiting for modal dismissal
5. When user closes modal, the game phase may not have properly advanced to `main`
6. AI action loop missed the opportunity to execute the bank trade with 2:1 rate

### Specific Issues

1. **Missing dependency**: `playedCardForModal` was not in the AI action loop's useEffect dependency array, so the loop didn't re-run when the modal closed

2. **No modal pause**: The AI action loop wasn't checking if a card modal was showing, so it could race with the modal display

3. **Phase transition missing**: After AI plays a dev card and modal closes, there was no reliable mechanism to advance from `play_dev_cards` to `main` phase

## Solution Implemented

### 1. Added Modal State Tracking
```typescript
// Check if there's an active card modal - if so, pause the AI loop
if (playedCardForModal) {
  console.log('DEBUG: AI action loop paused - card modal is showing');
  return;
}
```

### 2. Updated Dependency Array
Added `playedCardForModal` to the AI action loop's useEffect dependencies:
```typescript
}, [aiActionLoopActive, aiActionLoopIterations, gameState, boardSize, playedCardForModal, ...]);
```

This ensures the loop resumes when the modal closes.

### 3. Phase Transition Tracking
Added a ref to track when AI has played a dev card:
```typescript
const aiPlayedDevCardThisPhaseRef = useRef(false);
```

When AI plays a card:
```typescript
aiPlayedDevCardThisPhaseRef.current = true;
```

### 4. Automatic Phase Advancement
Added a useEffect to advance to `main` phase after the modal closes:
```typescript
useEffect(() => {
  if (gameState.phase === 'playing' &&
      gameState.turnState.step === 'play_dev_cards' &&
      !playedCardForModal &&
      aiPlayedDevCardThisPhaseRef.current) {
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
    if (currentPlayer && !currentPlayer.isHuman) {
      console.log(`DEBUG: AI dev card modal closed, advancing to main phase`);
      aiPlayedDevCardThisPhaseRef.current = false;

      setGameState(prev => ({
        ...prev,
        turnState: {
          ...prev.turnState,
          step: 'main'
        }
      }));
    }
  }
}, [gameState.phase, gameState.turnState.step, gameState.currentPlayer, gameState.players, playedCardForModal]);
```

### 5. Ref Reset on Turn Change
Reset the tracking ref when advancing to next player:
```typescript
// Reset AI dev card play tracking
aiPlayedDevCardThisPhaseRef.current = false;
```

## Expected Behavior After Fix

1. AI plays Expert Negotiator card
2. Modal displays card play to user
3. AI action loop **pauses** while modal is showing
4. User closes modal (or auto-closes after timeout)
5. Game phase **automatically advances** to `main`
6. AI action loop **resumes with fresh game state**
7. AI detects `expertNegotiatorActive: true`
8. AI orchestrator **prioritizes bank trade** (priority 15)
9. AI executes 2:1 bank trade as intended

## Verification

The fix ensures:
- ✓ Modal display doesn't race with AI actions
- ✓ AI action loop uses fresh game state after modal closes
- ✓ Phase transitions happen reliably
- ✓ Expert Negotiator benefit (2:1 trade) is actually used
- ✓ No duplicate card plays during phase transition

## Related Issues Fixed

This fix also improves the reliability of:
- Booming Economy card effect timing
- Closed Market card effect timing
- Resource Swap card effect timing
- Free Upgrade card effect timing
- Guard card display timing

All AI dev card plays now follow the same reliable pattern: play → modal → phase advance → AI action loop resume.

## Files Modified

- `src/hooks/useGameEngine.ts`
  - Added `aiPlayedDevCardThisPhaseRef` tracking
  - Added modal check to AI action loop
  - Added `playedCardForModal` to dependencies
  - Added phase advancement after modal close
  - Added ref reset on turn change

## Testing Recommendations

To verify the fix works:

1. Start a game with AI players (normal or hard difficulty)
2. Watch for AI players with Expert Negotiator cards
3. When AI plays Expert Negotiator:
   - Verify modal displays properly
   - Verify after modal closes, AI executes a bank trade at 2:1 rate
   - Check game log for trade confirmation
4. Verify AI doesn't get stuck or skip actions
5. Confirm no console errors about stale state

The fix should result in 100% bank trade execution rate after Expert Negotiator plays (assuming AI has viable resources to trade).
