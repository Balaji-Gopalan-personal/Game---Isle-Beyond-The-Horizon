# AI Trading and Placement Strategy Improvements

## Overview
This update addresses two critical AI strategy issues:
1. **Insufficient resource balance in AI initial placement** - AI players weren't consistently achieving diversity across all 5 resource types
2. **Contradictory trading sequences** - AI players were cycling resources (trading for X, then trading X away)

---

## Issue 1: AI Village Placement - Resource Balance

### Problem
- AI placement prioritized high-production locations (6s and 8s) over resource diversity
- Phase 1 weights: Production=5.0, Diversity=2.0 (too production-heavy)
- AI players often had 3-4 resource types but missing critical ones (e.g., fabric or grain)
- Even on Hard difficulty, placement didn't ensure balanced resource access

### Solution

#### 1. Adjusted Setup Phase Weights (`aiSetupStrategy.ts`)
```typescript
// Phase 1 (First settlement)
diversity: 3.5  // Increased from 2.0 for better resource balance

// Phase 2 (Second settlement)
diversity: 4.5  // Increased from 3.5 to prioritize filling resource gaps
```

#### 2. Enhanced Resource Gap Bonus (`aiStrategicEval.ts`)
- Increased bonus per new resource type: 6.0 (was 4.0)
- Increased production value multiplier: 0.8 (was 0.5)
- Increased "all 5 resources" bonus: 12.0 (was 8.0)
- Added early game diversity bonus: +8.0 if placing 2nd settlement with 2+ new resources

**Impact**: AI players now strongly favor locations that provide resources they don't have, ensuring more balanced production across all 5 types, especially on Hard difficulty.

---

## Issue 2: Contradictory Trading Sequences

### Problem
Example sequence that was occurring:
```
1. Start: 2 Clay, 2 Grain
2. Trade 2C → 1M (need mineral)
3. Trade 2G → 1M (now have 2M)
4. Trade 2M → 1G (cycling - just traded away grain to get mineral!)
```

Root cause: `evaluateTradeOpportunity()` was **stateless** - no memory of previous trades in the same turn.

### Solution

#### 1. Added Turn-Level Trade Tracking (`aiTradingStrategy.ts`)

**New Interface:**
```typescript
interface TurnTradeHistory {
  tradesExecuted: Array<{
    offering: ResourceType;
    offeringAmount: number;
    requesting: ResourceType;
    requestingAmount: number;
  }>;
  targetGoal?: TradeGoal;  // Locked-in goal from first trade
  resourcesGained: Partial<Record<ResourceType, number>>;
  resourcesLost: Partial<Record<ResourceType, number>>;
}
```

#### 2. Updated Trade Evaluation with History

**Modified Function Signature:**
```typescript
evaluateTradeOpportunity(
  player: Player,
  gameState: GameState,
  tradeHistory?: TurnTradeHistory  // Now accepts history
): TradeEvaluation
```

#### 3. Added Cycling Prevention Logic

**Resource Cycling Detection:**
```typescript
function isResourceCycling(history: TurnTradeHistory): boolean {
  // Checks if we're trading away resources we just acquired
  // Example: Trade A→B, then B→C is cycling
}

function isRecentlyAcquired(resource: ResourceType, history: TurnTradeHistory): boolean {
  // Don't trade away resources from the last trade
}
```

**Validation Rules:**
- Skip trading resources acquired in the last trade
- Detect and prevent full resource cycles
- Limit trades per turn: 3 normal, 4 with Expert Negotiator, 5 when close to winning
- Lock in the target building goal from the first trade

#### 4. Updated Trade Functions

Both `findBestBankTrade()` and `findBestPlayerTrade()` now:
- Accept `tradeHistory` parameter
- Check if resources were recently acquired before offering them
- Skip surplus resources that came from the previous trade

#### 5. Integrated with Game Engine (`useGameEngine.ts`)

- Added `turnTradeHistory` state variable
- Updated `handleAIBankTrade()` to use new strategy
- Track each executed trade in history
- Clear history when turn ends (`advanceToNextPlayer`)

---

## Expected Behavior After Fixes

### Placement
✅ AI players will have access to 4-5 resource types after initial placement (vs 2-3 before)
✅ Second settlement strongly favors filling resource gaps
✅ Hard difficulty AI will rarely have missing resource types
✅ Better balance between production value and resource diversity

### Trading
✅ Coherent trading sequences that build toward a specific goal
✅ No more "trade for X → trade X away" patterns
✅ Each trade moves closer to affording a target building
✅ Expert Negotiator card usage is strategic, not wasteful
✅ Trade history persists through the turn, preventing cycles

---

## Example Improved Trading Sequence

**Before (Buggy):**
```
Start: 2C, 2G, need 1M for estate
1. Trade 2C → 1M  ✓ Good
2. Trade 2G → 1M  ? Why? Already have 1M needed
3. Trade 2M → 1G  ✗ Cycled resources!
End: 1G, 0C, 0M  ✗ Can't build anything
```

**After (Fixed):**
```
Start: 2C, 2G, need 1M for estate
1. Trade 2C → 1M  ✓ Good (goal locked: estate)
2. [Detects: Already have 1M for goal, stop trading]
End: 2G, 1M  ✓ Can build estate OR save for next action
```

---

## Files Modified

### Trading Logic
- `src/engine/aiTradingStrategy.ts` - Added history tracking, cycling prevention
- `src/hooks/useGameEngine.ts` - Integrated history with trade execution
- `src/engine/aiTurnOrchestrator.ts` - Updated imports (no functional changes needed)

### Placement Logic
- `src/engine/aiSetupStrategy.ts` - Adjusted phase weights for diversity
- `src/engine/aiStrategicEval.ts` - Enhanced resource gap bonus calculations

---

## Testing Recommendations

1. **Resource Balance Test**: Play several games on Hard difficulty and check if AI players have 4-5 resource types after setup phase
2. **Trading Sequence Test**: Enable console logs and watch for:
   - "Skipping X - recently acquired in previous trade" messages
   - "Detected resource cycling" messages
   - Trades that clearly build toward a stated goal
3. **Expert Negotiator Test**: Play the Expert Negotiator card and verify AI doesn't waste 2:1 trades cycling resources

---

## Performance Impact

- **Minimal**: Trade history only stores data for current turn (cleared each turn)
- **Max memory**: ~10 trade records per turn × small objects = negligible
- **Computation**: Small additional checks in trade evaluation (O(n) where n = trades this turn, typically < 5)

---

## Future Enhancements (Optional)

1. Extract target goal explicitly from `evaluateTradeOpportunity` return value
2. Add analytics tracking for "trades prevented by cycling detection"
3. Implement more sophisticated goal selection when multiple buildings are affordable
4. Add difficulty-based trade aggression tuning (Hard = more multi-trade sequences)
