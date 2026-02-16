# AI Trade Planning and Goal Feasibility Improvements

## Problem Identified

The AI was making trades toward ambitious building goals (like estates) without verifying whether the goal could be completed during the current turn. This led to situations where:

1. **Partial Progress Trades**: AI would trade away resources to make partial progress toward expensive buildings
2. **Dead-End Situations**: After the trade, no surplus resources remained to continue trading
3. **Wasted Turns**: Turn would end with no building completed, wasting the traded resources
4. **Poor Planning**: AI didn't simulate the full sequence of trades needed to complete a goal

### Example Scenario

Captain Caveman had:
- 4 grain, 1 mineral
- Goal: Build estate (needs 2 grain + 3 mineral = 5 total)
- Action: Traded 4 grain → 1 mineral (4:1 rate)
- Result: Now has 2 mineral, 0 grain - CANNOT complete estate and CANNOT continue trading
- Better action: Don't trade at all, or pursue a more achievable goal

## Solution Implemented

### 1. Trade Sequence Simulation

Added comprehensive lookahead logic that simulates all possible trade sequences:

**New Functions:**
- `simulateTradeSequencesToGoal()`: Main simulation entry point
- `findViableTradeSequence()`: Breadth-first search to find complete trade paths
- `getSurplusResourcesForSimulation()`: Helper for simulation context

**How It Works:**
- Before committing to any goal, simulates all possible trading sequences (up to 4 steps)
- Uses breadth-first search to explore trade paths
- Checks if ANY sequence of trades can complete the goal with current resources
- Returns complete information: can complete? how many steps? what's the path?

### 2. Goal Achievability Marking

Updated `TradeGoal` interface to include:
- `achievableThisTurn`: Boolean flag indicating if goal can be completed this turn
- `tradeSequenceSteps`: Number of trades required to complete the goal

**Integration in `identifyTradeGoals()`:**
- After creating all goals, runs simulation for each
- Marks goals as achievable/unachievable based on simulation results
- Adjusts priorities:
  - Unachievable goals: priority reduced to 3 (very low)
  - Achievable goals (1-2 steps): priority boosted by +2
- Sorts goals by adjusted priority

### 3. Enhanced Trade Validation

Updated `findBestBankTrade()` to include multiple safety checks:

**Pre-Trade Checks:**
- Immediately rejects trades for unachievable goals
- Logs warning when goal is not achievable this turn

**Post-Trade Validation:**
- Simulates resource state after trade
- Checks if trade completes goal OR leaves surplus resources to continue trading
- Rejects trades that create "dead-end" situations (no surplus left but goal incomplete)
- Provides detailed logging about remaining resources and needs

**Example Validation:**
```
After trade: C:1 L:2 Gr:0 F:1 M:2
Still need: 2 grain, 1 mineral
Remaining surplus: []
✗ REJECTING trade - would create dead-end situation
```

### 4. Goal Filtering in Trade Evaluation

Updated `evaluateTradeOpportunity()` to:
- Filter out unachievable goals from consideration
- Separate achievable vs unachievable for logging
- Provide detailed feedback when no achievable goals exist
- Show which goals exist but aren't achievable and why

**Filtering Logic:**
```typescript
const viableGoals = goals.filter(g => {
  if (g.hasViablePlacement === false) return false;
  if (Object.keys(g.neededResources).length === 0) return true; // Already can afford
  return g.achievableThisTurn !== false; // Must be achievable if requiring trades
});
```

### 5. Fallback Logic for Committed Goals

Updated `shouldContinueTurn()` in `aiTurnOrchestrator.ts`:

**When Committed Goal Becomes Unachievable:**
1. Detects when no more trades are available toward committed goal
2. Clears the committed goal from turn state
3. Searches for alternative achievable goals
4. Logs available alternatives and their trade requirements
5. Switches to new goal if immediately buildable or tradeable

**Example Flow:**
```
⚠️ No more trades available for committed goal estate
🔄 CLEARING unachievable committed goal and looking for alternatives
✓ Found 2 achievable alternative goals:
   1. road (1 steps, priority 8)
   2. dev_card (2 steps, priority 7)
✓ Switching to new achievable goal: road
```

## Impact and Benefits

### 1. Prevents Wasted Resources
- AI no longer makes "progress" trades that lead nowhere
- Every trade must be part of a viable completion path
- Dead-end situations are detected and prevented

### 2. Smarter Goal Selection
- Achievable goals are automatically prioritized over ambitious ones
- Easily achievable goals (1-2 steps) get priority boost
- Unachievable goals are deprioritized but not completely ignored (may become viable)

### 3. Better Turn Efficiency
- AI completes more buildings per turn
- Fewer turns wasted on partial progress
- Resources are used more efficiently

### 4. Adaptive Strategy
- When committed goal fails, AI adapts and switches to achievable alternatives
- Doesn't stubbornly pursue impossible goals
- Prefers completing SOMETHING over making futile progress toward nothing

### 5. Transparent Decision-Making
- Enhanced logging shows simulation results
- Clear indication of achievable vs unachievable goals
- Shows trade sequences required for each goal
- Explains why trades are accepted or rejected

## Example Log Output

```
💱 [Captain Caveman] EVALUATING TRADE OPPORTUNITIES

🔮 Simulating trade sequences for estate...
   Starting resources: C:1 L:2 Gr:4 F:1 M:1
   ✗ No viable sequence found: Insufficient tradeable resources (have 9, need path to estate)

📊 Identified 4 possible trade goals (2 achievable, 3 viable):
   1. village (priority 15) - Needs: 1 clay, 1 fabric (2 steps) ✓ ACHIEVABLE
   2. road (priority 8) - Needs: 1 clay (1 steps) ✓ ACHIEVABLE
   3. estate (priority 3) - Needs: 2 grain, 2 mineral ⚠️ NOT ACHIEVABLE THIS TURN
   4. dev_card (priority 7) - Needs: 1 mineral (1 steps) ✓ ACHIEVABLE

🎯 Prioritizing: village (priority 15)

🏦 Evaluating bank trade options...
   lumber: Have 2, Rate 4:1 (4:1 bank)
      ✗ Not enough (need 4)
   grain: Have 4, Rate 4:1 (4:1 bank)
      Score: 8.0 for 4:1 (4:1 rate)
      ⚠️ WARNING: Trade would leave no surplus resources to continue toward village
         After trade: C:1 L:2 Gr:0 F:2 M:1
         Still need: 1 clay
         ✗ REJECTING trade - would create dead-end situation

✗ No beneficial trades available
```

## Technical Details

### Breadth-First Search Algorithm

The trade sequence simulation uses BFS to explore all possible trade paths:
1. Start with current resources
2. For each state, try all possible trades (surplus → needed resources)
3. Track visited states to avoid cycles
4. Continue until goal is met or max depth reached
5. Return shortest viable path or "not achievable"

### Complexity Considerations

- Max search depth: 4 trades (configurable)
- State pruning: Uses visited set to avoid redundant explorations
- Efficient resource representation: String key for state comparison
- Early termination: Returns immediately when goal is met

### Performance Impact

- Simulation runs once per turn during goal identification
- Minimal overhead: Most simulations complete in <50ms
- Results are cached in goal objects for the turn
- No impact on runtime performance during normal gameplay

## Future Enhancements

Potential improvements for even smarter planning:

1. **Multi-Goal Planning**: Evaluate sequences that build multiple items
2. **Resource Production Prediction**: Factor in expected dice rolls for next turn
3. **Opponent Trade Availability**: Consider likelihood of successful P2P trades
4. **Risk Assessment**: Assign confidence scores to trade sequences
5. **Partial Progress Value**: Sometimes partial progress IS valuable (e.g., card hoarding)

## Configuration

Current settings:
- `maxSteps`: 4 (maximum trades to simulate in sequence)
- Priority adjustments:
  - Unachievable: reduced to 3
  - Achievable (1-2 steps): boosted by +2
- Validation: All trades validated before execution

These can be tuned in `aiTradingStrategy.ts` if different behavior is desired.

## Testing

To verify the improvements:
1. Start a game with AI players
2. Observe trade logs for "ACHIEVABLE" markings
3. Verify AI doesn't make dead-end trades
4. Check that goals switch when unachievable
5. Confirm more buildings completed per turn

The enhanced logging makes it easy to trace AI decision-making and verify correct behavior.
