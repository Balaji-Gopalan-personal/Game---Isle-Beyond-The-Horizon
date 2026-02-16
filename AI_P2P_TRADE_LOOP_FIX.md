# AI P2P Trade Action Loop Fix

## Problem

When an AI player initiated a P2P trade, the action loop would immediately continue to the next iteration and call `shouldContinueTurn()` BEFORE the trade response was received. This caused the AI to end its turn prematurely because:

1. AI initiates P2P trade (e.g., 1 grain → 1 clay for village)
2. Trade proposal created, waiting for responses
3. Action loop continues to next iteration
4. `shouldContinueTurn()` evaluates current state:
   - Still can't afford village (trade not accepted yet)
   - No other immediate actions available
   - Returns false → turn ends
5. Trade responses never processed, AI never continues

## Root Cause

The action loop didn't properly **pause and wait** for P2P trade responses. After `handleAIPlayerTrade` returned `true`, it would:
- Continue to the end of the loop
- Increment iteration counter
- Start next iteration immediately
- Call `shouldContinueTurn` before trade was resolved

## Solution

### Part 1: Pause After P2P Trade Initiation

In `useGameEngine.ts` at the `case 'trade_player'` section:

```typescript
case 'trade_player':
  console.log('   Attempting player trade...');
  const playerTradeAttempts = gameState.turnState.aiTradeAttemptsThisTurn || 0;
  if (playerTradeAttempts < 3) {
    actionSuccess = handleAIPlayerTrade(currentPlayer.id);
    console.log(`   ${actionSuccess ? '✓' : '✗'} Player trade ${actionSuccess ? 'initiated' : 'failed'}`);

    // If P2P trade was successfully initiated, pause the action loop
    // and wait for the trade response (accept/reject)
    if (actionSuccess) {
      console.log('   ⏸️  Pausing AI action loop - waiting for trade response');
      console.log(`${'='.repeat(60)}\n`);
      return; // Exit loop immediately without incrementing iteration
    }
  }
  break;
```

This prevents the loop from calling `shouldContinueTurn` prematurely.

### Part 2: Resume After Trade Resolution

Added a new `useEffect` that monitors `tradeProposal` and resumes the AI action loop when it's cleared:

```typescript
// Resume AI action loop when a trade proposal is resolved
useEffect(() => {
  if (gameState.phase === 'playing' &&
      gameState.turnState.step === 'main' &&
      !gameState.turnState.tradeProposal &&
      diceRollPhaseComplete &&
      !aiActionLoopActive) {
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);

    if (currentPlayer &&
        !currentPlayer.isHuman &&
        currentPlayer.id === gameState.turnState.currentPlayerId) {
      console.log(`DEBUG: Trade resolved, resuming AI action loop for ${currentPlayer.name}`);
      const timer = setTimeout(() => {
        startAIActionLoop(currentPlayer.id);
      }, 800);

      return () => clearTimeout(timer);
    }
  }
}, [gameState.phase, gameState.turnState.step, gameState.turnState.tradeProposal, ...]);
```

This ensures the AI loop resumes after the trade is either accepted or rejected.

## Expected Behavior After Fix

1. AI initiates P2P trade
2. Action loop **pauses** (returns immediately)
3. Trade responses are collected from other players
4. Trade is accepted OR rejected by all
5. `tradeProposal` is cleared (set to `undefined`)
6. `useEffect` detects trade resolution
7. AI action loop **resumes** with updated resources
8. AI re-evaluates with new state:
   - If trade accepted: may now be able to build
   - If trade rejected: tries different approach
9. Continues turn or ends based on actual state

## Files Modified

- `src/hooks/useGameEngine.ts`
  - Modified `case 'trade_player'` to pause loop after successful trade initiation
  - Added new `useEffect` to resume loop when trade is resolved

## Testing Recommendations

1. Verify AI continues building after successful P2P trade
2. Verify AI tries alternative actions after rejected P2P trade
3. Verify no premature turn endings after trade initiation
4. Check console logs for "Pausing AI action loop" and "Trade resolved, resuming" messages
