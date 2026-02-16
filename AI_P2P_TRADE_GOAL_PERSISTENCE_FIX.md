# AI P2P Trade Goal Persistence Fix

## Problem Summary

AI players were abandoning their building goals after a single P2P trade, even when they needed multiple trades to complete the goal. This happened because:

1. **P2P trade history was not tracked** - When trades were accepted (AI-to-AI or human-accepting-AI), the `turnTradeHistory` object was never updated
2. **Building goals were not preserved** - The target building the AI was working toward wasn't stored or carried forward across trades
3. **Re-evaluation from scratch** - After each trade, the AI would re-evaluate all goals without memory of its commitment
4. **No committed goal enforcement** - The system didn't enforce that the AI should continue working toward a goal it had already started trading for

### Example Scenario (Before Fix)
```
Alvin has: 3 mineral, 0 grain
Goal: Build estate (needs 2 grain + 3 mineral)

1. Proposes trade: 2 mineral for 1 grain → ACCEPTED
2. Now has: 1 mineral, 1 grain
3. Trade history is empty (BUG)
4. Re-evaluates goals from scratch
5. Sees village as higher priority than estate
6. Can't build village (missing clay, lumber, fabric)
7. Has only 2 total resources, can't identify surplus
8. GIVES UP and ends turn

Expected: Should continue trading to get 1 more grain!
```

## Solution Implemented

### 1. Enhanced TradeProposal Type
**File**: `src/types/game.ts`

Added `targetBuilding` field to track which building the trade is working toward:
```typescript
export interface TradeProposal {
  // ... existing fields
  targetBuilding?: 'village' | 'estate' | 'road' | 'dev_card';
}
```

### 2. Enhanced TurnState Type
**File**: `src/types/game.ts`

Added fields to track committed building goals across trades:
```typescript
export interface TurnState {
  // ... existing fields
  committedBuildingGoal?: 'village' | 'estate' | 'road' | 'dev_card';
  tradeIterationsForGoal?: number;
}
```

### 3. Updated Trade Proposal Generation
**File**: `src/utils/aiTrading.ts`

Modified `generatePlayerTradeProposal()` to return the target building:
```typescript
export function generatePlayerTradeProposal(
  // ... params
): {
  offeredResources: any;
  requestedResources: any;
  targetBuilding: 'village' | 'estate' | 'road' | 'dev_card'
} | null
```

Now includes target building in the return value and logs it clearly.

### 4. Updated AI Trade Handler
**File**: `src/hooks/useGameEngine.ts`

Modified `handleAIPlayerTrade()` to attach `targetBuilding` to the trade proposal:
```typescript
const tradeProposal = {
  // ... existing fields
  targetBuilding: proposal.targetBuilding
};
```

### 5. P2P Trade History Tracking (AI-to-AI)
**File**: `src/hooks/useGameEngine.ts`

Updated the AI trade acceptance logic (in useEffect around line 5571) to:
- Track trade details in `turnTradeHistory`
- Record resources gained and lost
- Preserve the target building goal
- Update `committedBuildingGoal` in turnState
- Increment `tradeIterationsForGoal` counter

### 6. P2P Trade History Tracking (Human Accept)
**File**: `src/hooks/useGameEngine.ts`

Updated `handleHumanAcceptAITrade()` to:
- Track trade details before state update
- Record resources gained and lost
- Preserve the target building goal
- Update `committedBuildingGoal` in turnState
- Increment `tradeIterationsForGoal` counter

### 7. Enhanced Goal Validation
**File**: `src/engine/aiTradingStrategy.ts`

Modified `evaluateTradeOpportunity()` to use a priority order for goal selection:
1. **Highest**: Committed goal from turnState (locked from previous successful trade)
2. **Medium**: Target goal from trade history (from current trading session)
3. **Lowest**: Top viable goal from fresh evaluation

```typescript
// Check if there's a committed building goal from a previous successful trade
const committedGoal = gameState.turnState.committedBuildingGoal;
if (committedGoal) {
  const committedGoalData = viableGoals.find(g => g.targetBuilding === committedGoal);
  if (committedGoalData) {
    activeGoal = committedGoalData;
    console.log(`   🔒 Using committed goal from successful trade: ${committedGoal}`);
  }
}
```

### 8. Enhanced Turn Continuation Logic
**File**: `src/engine/aiTurnOrchestrator.ts`

Updated `shouldContinueTurn()` to:
- Check for committed building goals
- Allow extended trading when pursuing a committed goal
- Apply difficulty-based limits:
  - **Easy**: Up to 3 trade iterations
  - **Normal**: Up to 4 trade iterations
  - **Hard**: Up to 5 trade iterations

```typescript
if (committedGoal && tradeIterations > 0) {
  console.log(`   📍 Committed to building: ${committedGoal} (${tradeIterations} trades executed)`);

  const maxCommittedTradeIterations = difficulty === 'hard' ? 5 : difficulty === 'normal' ? 4 : 3;

  if (tradeIterations < maxCommittedTradeIterations) {
    const tradeEval = evaluateTradeOpportunity(player, gameState, boardSize, tradeHistory);
    if (tradeEval.shouldTrade) {
      console.log(`   ✓ Continuing trades toward committed goal: ${committedGoal}`);
      return true;
    }
  }
}
```

## How It Works Now

### Example Scenario (After Fix)
```
Alvin has: 3 mineral, 0 grain
Goal: Build estate (needs 2 grain + 3 mineral)

1. Proposes P2P trade: 2 mineral for 1 grain (targetBuilding: estate)
2. Trade accepted → Now has: 1 mineral, 1 grain
3. ✅ turnTradeHistory updated:
   - tradesExecuted: [{offering: mineral, requesting: grain}]
   - targetGoal: estate
   - resourcesGained: {grain: 1}
   - resourcesLost: {mineral: 2}
4. ✅ turnState updated:
   - committedBuildingGoal: 'estate'
   - tradeIterationsForGoal: 1
5. AI resumes, evaluates trades
6. 🔒 Finds committed goal: estate
7. Still needs: 1 grain, 2 mineral
8. Proposes another trade to get more grain/mineral
9. Continues until estate can be built (or max iterations reached)
```

## Key Improvements

1. **Goal Persistence**: AI maintains commitment to building goals across multiple trades
2. **Trade Memory**: Complete history of trades executed during the turn
3. **Resource Tracking**: Knows what resources were gained/lost through trading
4. **Iteration Limits**: Prevents infinite trading loops with difficulty-based limits
5. **Smart Re-evaluation**: Only abandons goals when they become impossible (no valid placements)
6. **Logging**: Clear console logs showing committed goals and trade progress

## Benefits

- AI players now exhibit more strategic, persistent trading behavior
- Multiple trades per turn work toward the same building goal
- Difficulty scaling through iteration limits (easy=3, normal=4, hard=5)
- Prevents premature turn endings when partial progress is made
- Matches player expectation that AI should "finish what it started"

## Testing

Build completed successfully with no TypeScript errors. The fix is ready for gameplay testing.

The AI should now:
- Keep proposing trades (within difficulty limits) to complete building goals
- Show clear logging of committed goals and trade iterations
- Only abandon goals when they become truly impossible
- Make more strategic use of multi-trade opportunities
