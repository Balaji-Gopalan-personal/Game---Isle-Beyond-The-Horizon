# AI Trade Budget Awareness Fix

## Problem

AI players were executing multiple trades toward a goal but hitting the max trade limit (3 trades per turn) before completing the goal. This resulted in:

1. Trading away resources through 3 trades
2. Identifying the goal as "achievable" (e.g., needs 1 more trade)
3. Running out of trade budget before final trade
4. Ending turn without building anything - wasting all trades

**Example from logs:**
```
Space Ghost made 3 trades (max reached)
Resources after trades: C:0 L:0 Gr:1 F:5 M:0
AI identifies: "dev_card achievable in 1 more trade (4 fabric → 1 mineral)"
But no trades remaining!
Turn ends with no building - resources wasted
```

## Root Cause

The trade sequence simulation in `simulateTradeSequencesToGoal()` assumed unlimited trades per turn. It would calculate "this goal needs 4 trades to complete" without checking if 4 trades were actually available.

Key issues:
- `identifyTradeGoals()` didn't know how many trades were already executed
- `findBestBankTrade()` didn't validate if goal completion was possible within remaining budget
- Goals marked "achievable" even when requiring more trades than budget allowed

## Solution

### 1. Added Trade Budget Tracking

**In `evaluateTradeOpportunity()`:**
```typescript
// Calculate trade budget for this turn
const tradesExecutedCount = tradeHistory?.tradesExecuted.length || 0;
const pointsAway = gameState.gameSettings.pointsToWin - (player.score + player.secretPoints);
const maxTradesAllowed = expertNegotiatorActive ? 4 : (pointsAway <= 2 ? 5 : 3);
const remainingTradeBudget = maxTradesAllowed - tradesExecutedCount;

console.log(`💰 Trade budget: ${tradesExecutedCount}/${maxTradesAllowed} trades used (${remainingTradeBudget} remaining)`);
```

### 2. Updated Goal Evaluation to Use Budget

**Updated `identifyTradeGoals()` signature:**
```typescript
export function identifyTradeGoals(
  player: Player,
  gameState: GameState,
  boardSize: BoardSize,
  remainingTradeBudget: number = 4  // NEW: Pass remaining budget
): TradeGoal[]
```

**Budget-aware goal achievability:**
```typescript
// Use remaining trade budget as max steps
const simulation = simulateTradeSequencesToGoal(player, gameState, goal, remainingTradeBudget);
goal.achievableThisTurn = simulation.canComplete;
goal.tradeSequenceSteps = simulation.totalSteps;

// CRITICAL: Verify goal is within budget
if (goal.achievableThisTurn && goal.tradeSequenceSteps! > remainingTradeBudget) {
  console.log(`⚠️ ${goal.targetBuilding} needs ${goal.tradeSequenceSteps} trades but only ${remainingTradeBudget} remaining - marking UNACHIEVABLE`);
  goal.achievableThisTurn = false;
}
```

### 3. Enhanced Bank Trade Validation

**In `findBestBankTrade()`:**

Added budget parameter:
```typescript
function findBestBankTrade(
  player: Player,
  gameState: GameState,
  goal: TradeGoal,
  tradeHistory?: TurnTradeHistory,
  frustrationLevel: number = 0,
  remainingTradeBudget: number = 4  // NEW parameter
): TradeEvaluation | null
```

Added upfront budget check:
```typescript
// Check if we have ANY trade budget remaining
if (remainingTradeBudget <= 0) {
  console.log(`⚠️ No trade budget remaining - cannot execute any more trades this turn`);
  return null;
}
```

Added post-trade validation:
```typescript
if (!canAffordAfterTrade) {
  // Calculate budget after this trade
  const tradesUsedAfterThis = 1;
  const budgetAfterThis = remainingTradeBudget - tradesUsedAfterThis;

  if (budgetAfterThis > 0) {
    // Verify we can complete goal with remaining budget
    const postTradeSimulation = simulateTradeSequencesToGoal(
      simulatedPlayer,
      gameState,
      updatedGoal,
      budgetAfterThis
    );

    if (!postTradeSimulation.canComplete) {
      console.log(`⚠️ Trade would NOT lead to goal completion within remaining budget`);
      console.log(`✗ REJECTING trade - insufficient budget to complete goal`);
      return null;
    }
  } else {
    // Last trade must complete goal
    console.log(`⚠️ This is the LAST trade allowed - must complete goal or reject`);
    return null;
  }
}
```

### 4. Updated All Call Sites

Updated calls to `identifyTradeGoals()` throughout the codebase:

**aiTradingStrategy.ts:**
- `evaluateTradeOpportunity()` - passes calculated `remainingTradeBudget`
- `shouldInitiatePlayerTrade()` - calculates and passes budget

**aiTurnOrchestrator.ts:**
- `evaluateExpertNegotiatorTrade()` - calculates Expert Negotiator budget (4 trades)
- `shouldContinueTurn()` - calculates budget when looking for alternative goals

**aiTrading.ts:**
- `generatePlayerTradeProposal()` - estimates remaining budget

**useGameEngine.ts:**
- Trade proposal handlers - uses default budget of 3

## Impact

### Before Fix:
```
Turn 5: Space Ghost
- Trade 1: 4 fabric → 1 clay (4:1)
- Trade 2: 4 lumber → 1 grain (4:1)
- Trade 3: 4 clay → 1 mineral (4:1)
- Has: C:0 L:0 Gr:1 F:5 M:0
- Identifies: "dev_card achievable in 1 trade"
- ✗ Max trades reached (3)
- Turn ends, no building, resources wasted
```

### After Fix:
```
Turn 5: Space Ghost
- Budget: 0/3 trades (3 remaining)
- Evaluating dev_card goal...
- Simulation: Needs 4 trades to complete
- ⚠️ dev_card needs 4 trades but only 3 remaining - marking UNACHIEVABLE
- Priority reduced from 8 to 3
- AI switches to achievable goal (e.g., road needs 1 trade)
- Trade 1: Execute efficient trade toward road
- Build road
- Turn ends successfully
```

## Key Benefits

1. **No Wasted Trades**: AI never executes trades it can't complete
2. **Smart Goal Selection**: Goals requiring too many trades are marked unachievable
3. **Budget-Aware Planning**: Every trade considers remaining budget
4. **Early Detection**: Unachievable goals identified before first trade
5. **Clear Logging**: Shows trade budget status in all evaluations

## Example Logs (After Fix)

```
💱 [Space Ghost] EVALUATING TRADE OPPORTUNITIES
💰 Trade budget: 0/3 trades used (3 remaining)
📊 Identified 3 possible trade goals (2 achievable, 2 viable):
  1. village (priority 15) - Needs: 2 clay, 1 grain (4 steps) ⚠️ NOT ACHIEVABLE THIS TURN (needs 4 trades, only 3 remaining)
  2. dev_card (priority 8) - Needs: 1 mineral (1 step) ✓ ACHIEVABLE
  3. road (priority 6) - Needs: 1 lumber (1 step) ✓ ACHIEVABLE
🎯 Prioritizing: dev_card (priority 8)
🏦 Evaluating bank trade options...
  ✓ Best bank trade: 4x fabric → 1x mineral
  ✓ Trade COMPLETES the goal dev_card!
```

## Testing Verification

To verify the fix works:
1. Watch for "Trade budget: X/Y trades used (Z remaining)" in logs
2. Check goals show "(needs N trades, only M remaining)" when unachievable
3. Verify AI never executes trades without building afterward
4. Confirm goals requiring >3 trades are marked unachievable early

## Files Modified

- `src/engine/aiTradingStrategy.ts` - Core budget tracking and validation
- `src/engine/aiTurnOrchestrator.ts` - Budget-aware goal switching
- `src/utils/aiTrading.ts` - Budget calculation for player trades
- `src/hooks/useGameEngine.ts` - Default budget in trade handlers
