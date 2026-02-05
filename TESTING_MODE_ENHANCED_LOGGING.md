# Testing Mode Enhanced AI Decision Logging

## Date
2026-02-05

## Overview

Enhanced the Testing Mode logging to provide detailed explanations of AI decision-making, specifically for:
1. Road placement direction choices (Phases 1, 2, and 3)
2. Build pursuit context for trades and resource acquisition cards

## What Testing Mode Now Shows

### 1. Road Placement Reasoning (All Phases)

**Setup Phases (1 & 2):**
- Why a specific direction was chosen vs alternatives
- Production value analysis (high-probability hexes)
- New territory access explanations
- Resource diversity benefits
- Future expansion potential

**Example Output:**
```
Alice placed a road from vertex 15 to 20
  Balanced - accessing high-probability hexes (lumber, grain); opening access to fabric territory; strong future expansion options
```

**Gameplay Phase (3):**
- Strategic placement reasoning including:
  - Longest road pursuit
  - Blocking opponent strategies
  - Access to high-value production
  - Resource acquisition goals

**Example Output:**
```
Bob built a road from vertex 32 to 38
  Aggressive - Extending toward opponent territory to block expansion and contest longest road
```

### 2. Trade Proposals

Enhanced to show **what specific build** the AI is working toward:

**Bank Trades:**
```
Charlie traded 4 clay for 1 fabric with the bank (4:1)
  Balanced - Trading toward village construction (need fabric)
```

**Player Trades:**
```
Dana proposed trade: offering 2 lumber for 1 mineral
  Defensive - Acquiring mineral to work toward estate upgrade
```

### 3. Development Card Resource Selection

**Booming Economy:**
- Shows which resources were chosen
- Explains what build they're working toward

**Example Output:**
```
Alice played Booming Economy
Alice is selecting 2 free resources
  Balanced - Selected grain and fabric; need 1 grain and 1 fabric for village construction
```

**Closed Market:**
- Shows which resource was targeted
- Explains why (targeting leader, blocking builds)

**Example Output:**
```
Bob played Closed Market
Bob is selecting a resource to take from all players
  Aggressive - Target: Alice; selecting mineral because leader has 3, blocks estate (mineral critical)
```

## Implementation Details

### Enhanced Functions

#### 1. Road Placement Reasoning (`generateSetupRoadReasoning`)

**Location:** `useGameEngine.ts:253-326`

**Enhancements:**
- Analyzes production values of destination hexes
- Identifies new territory access
- Checks resource diversity benefits
- Evaluates future expansion options
- Provides specific resource types in explanations

**Before:**
```
"Toward high-production hex, expansion potential"
```

**After:**
```
"Accessing high-probability hexes (lumber, grain); opening access to fabric territory; diversifying access to mineral; strong future expansion options"
```

#### 2. Gameplay Road Placement Logging

**Location:** `useGameEngine.ts:4000-4010`

**Enhancement:**
- Added Testing Mode logging for Road Construction free roads
- Uses existing `RoadLocationDecision.reasoning` for regular roads
- Shows personality trait and strategic objective

#### 3. Trade Proposal Reasoning

**Location:** `useGameEngine.ts:4675-4690`

**Enhancement:**
- Now calls `evaluateTradeOpportunity` to get detailed reasoning
- Shows specific build being pursued (village, estate, etc.)
- Falls back to resource-based reasoning if detailed unavailable

#### 4. Booming Economy Resource Selection

**Location:** `useGameEngine.ts:3626-3635`

**Enhancement:**
- Added Testing Mode logging
- Uses `ResourceSelection.reasoning` from strategic selection
- Shows which resources and why (what build they enable)

#### 5. Closed Market Resource Selection

**Location:** `aiDevCardStrategy.ts:635-738`

**Enhancement:**
- Modified to return `ClosedMarketSelection` object with reasoning
- Reasoning explains:
  - Who is being targeted (leader)
  - Why that resource (amount leader has)
  - What build it blocks (village, estate)

**Added Interface:**
```typescript
export interface ClosedMarketSelection {
  resource: string;
  reasoning: string;
}
```

**Updated Location:** `useGameEngine.ts:3693-3701`
- Added Testing Mode logging using the new reasoning

### How to Enable

Testing Mode is controlled by the `gameSettings.testingMode` boolean:

```typescript
gameSettings: {
  testingMode: true  // Enable detailed AI decision logging
}
```

When enabled:
- AI decisions appear in the Game Events Log
- Each decision shows the personality trait (Aggressive, Defensive, Balanced, Expansionist)
- Reasoning explains the "why" behind every choice
- Build pursuit context shows what the AI is working toward

### Benefits for Testing and Debugging

1. **Transparency:** Understand exactly why AI makes each decision
2. **Balance Testing:** Verify AI strategies are working as intended
3. **Bug Identification:** Spot irrational decisions quickly
4. **Strategy Evaluation:** Assess if AI personalities are distinct
5. **Tutorial/Learning:** Players can learn strategy by watching AI reasoning

## Files Modified

### Primary Changes

1. **`/src/hooks/useGameEngine.ts`**
   - Enhanced `generateSetupRoadReasoning()` (lines 253-326)
   - Added Road Construction testing logging (lines 4000-4010)
   - Enhanced player trade reasoning (lines 4675-4690)
   - Added Booming Economy testing logging (lines 3626-3635)
   - Added Closed Market testing logging (lines 3693-3701)

2. **`/src/engine/aiDevCardStrategy.ts`**
   - Added `ClosedMarketSelection` interface (lines 635-637)
   - Modified `selectClosedMarketResource()` return type (lines 639-738)
   - Updated `selectOpponentsMostAbundantResource()` return type (lines 965-994)

### Supporting Infrastructure

The `addAIDecisionContext()` function (already existed) handles:
- Checking if Testing Mode is enabled
- Formatting the log message with personality and reasoning
- Adding to the Game Events Log with proper styling

## Testing Verification

Build completed successfully:
```
✓ 1531 modules transformed.
✓ built in 35.20s
```

All TypeScript type checking passed with no errors.

## Example Game Events Log (Testing Mode ON)

```
Turn 1

Alice placed village at vertex 15
Alice placed a road from vertex 15 to 20
  Balanced - accessing high-probability hexes (lumber, grain); opening access to fabric territory

Bob placed village at vertex 42
Bob placed a road from vertex 42 to 38
  Aggressive - toward high-production hex; strong future expansion options

Turn 3

Alice rolled 7 - Clay, Lumber, Grain (3 hexes produced)
Alice played Booming Economy
Alice is selecting 2 free resources
  Balanced - Selected grain and fabric; need 1 grain and 1 fabric for village construction
Alice gained Grain and Fabric from Booming Economy

Alice proposed trade: offering 2 clay for 1 mineral
  Balanced - Trading toward estate upgrade (need 2 mineral)

Charlie accepted the trade
Alice traded with Charlie: 2 clay for 1 mineral

Alice built a road from vertex 20 to 24
  Balanced - Extending toward diverse resource hexes (grain, mineral); opening village placement options
```

## Future Enhancements

Potential additions:
1. Estate upgrade reasoning (why upgrade this village vs others)
2. Development card purchase reasoning (timing and strategic value)
3. Robber placement reasoning (already exists but could be enhanced)
4. Trade acceptance/rejection reasoning for AI players
5. Resource discard reasoning when rolling 7

## Notes

- Testing Mode logging only appears when `gameSettings.testingMode === true`
- Logging does not impact game performance (minimal overhead)
- All reasoning is generated from actual AI decision-making code
- No fabricated or generic explanations - all reasoning is authentic to the AI's strategy evaluation
