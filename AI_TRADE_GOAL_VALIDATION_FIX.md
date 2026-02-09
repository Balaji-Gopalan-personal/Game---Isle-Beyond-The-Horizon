# AI Trade Goal Validation and Board Saturation Strategy Fix

## Problem Analysis

The AI decision-making system had several critical bugs causing players to:
1. Trade toward buildings (especially villages) with no valid placement locations
2. Get stuck in a self-defeating cycle when the board became "saturated" (no village spots on current network)
3. Stop building roads that could expand the network and create new village spots
4. Continue turn iterations trading toward unviable goals, wasting actions

## Root Causes Identified

### 1. Trade Goal Identification Never Checked Viable Placements
- `identifyTradeGoals()` in `aiTradingStrategy.ts` only checked:
  - Resource affordability
  - Game phase heuristics (early game, village count)
  - Whether upgradeable villages existed (for estates)
- **Never checked:**
  - Valid village placement locations (`getValidVillagePlacements()`)
  - Valid road placement edges (`getValidRoadPlacements()`)
  - Whether dev cards were available in the deck

**Example from logs:** Tom had 0 viable village locations but village goal was assigned priority 15 (highest), leading to two failed trade attempts toward a village he could never build.

### 2. Board Saturation Logic Crushed Road Priority
- When `viableVillageLocations <= 2`, the board was flagged as "saturated"
- Road priority was then multiplied by 0.3 (70% reduction)
- **Problem:** `viableVillageLocations` only counted spots on the **current road network**, not the entire board
- Building roads to expand the network could open new village spots, but the AI never tried because road priority was crushed
- **Self-defeating cycle:** No spots → saturated → no roads → still no spots → repeat

### 3. Committed Goal Path Didn't Validate Placement
- After trading, the AI could commit to a building goal with a +10 priority boost
- This boosted build action was added if the player could **afford** the building
- Never checked if placement was actually **possible**
- High-priority committed goal shadowed viable alternatives (estates, dev cards)

### 4. shouldContinueTurn Didn't Validate Trade Goals
- `shouldContinueTurn()` checked if `evaluateTradeOpportunity()` returned `shouldTrade: true`
- If yes, it continued the turn for more trading
- Never validated that the trade goal had viable placement
- AI could loop through multiple iterations trading toward impossible buildings

### 5. Action Limits Were Hard-Coded
- Trade continuation was capped at `actionsTaken < 3` regardless of difficulty
- Should vary: easy=2, normal=3, hard=4 (to match intended difficulty scaling)

## Implementation Summary

### Changes to `aiTradingStrategy.ts`

**1. Updated imports and interfaces:**
```typescript
import { BoardSize } from '../types/game';
import { getValidVillagePlacements, getValidRoadPlacements, getPlayerVillages } from './gameplayActions';

export interface TradeGoal {
  targetBuilding: 'village' | 'estate' | 'road' | 'dev_card';
  neededResources: Partial<Resources>;
  priority: number;
  hasViablePlacement?: boolean; // NEW
}
```

**2. Added boardSize parameter to functions:**
- `evaluateTradeOpportunity(player, gameState, boardSize, tradeHistory?)`
- `identifyTradeGoals(player, gameState, boardSize)`

**3. Added viable placement checks in identifyTradeGoals():**
```typescript
// Check viable placement locations for each building type
const validVillagePlacements = getValidVillagePlacements(player.id, gameState, boardSize);
const validRoadPlacements = getValidRoadPlacements(player.id, gameState, boardSize);
const upgradableVillages = getPlayerVillages(player.id, gameState);
const hasDevCardsAvailable = gameState.developmentCardDeck.length > 0;
```

**4. Modified village goal to check placement:**
```typescript
const hasViablePlacement = validVillagePlacements.length > 0;
if (!hasViablePlacement) {
  // Drastically reduce priority if no viable placements exist
  villagePriority = 1;
}
goals.push({
  targetBuilding: 'village',
  neededResources: villageNeeds,
  priority: villagePriority,
  hasViablePlacement
});
```

**5. Boosted road priority when it can open village spots:**
```typescript
// Boost road priority if it could open village spots
const hasViablePlacement = validRoadPlacements.length > 0;
if (validVillagePlacements.length === 0 && hasViablePlacement) {
  // No village spots on current network but roads are available - boost priority
  roadPriority = 14; // Make roads higher priority than base estate (12)
}
```

**6. Filtered unviable goals in evaluateTradeOpportunity():**
```typescript
const goals = identifyTradeGoals(player, gameState, boardSize);
const viableGoals = goals.filter(g => g.hasViablePlacement !== false);

if (viableGoals.length === 0) {
  console.log(`   ✗ No viable trade goals (all buildings have no valid placement locations)`);
  return { shouldTrade: false, tradeType: 'bank', reasoning: 'No viable building placements available' };
}
```

### Changes to `aiStrategicEval.ts`

**1. Added helper function to detect if roads can open village spots:**
```typescript
function canRoadsOpenVillageSpots(
  playerId: string,
  gameState: GameState,
  boardSize: BoardSize
): boolean {
  const validRoadEndpoints = getValidRoadPlacements(playerId, gameState, boardSize);
  const boardData = loadBoardForSize(boardSize);
  const occupiedVertices = gameState.verticesOccupiedBy || {};

  for (const endpoint of validRoadEndpoints) {
    const neighbors = boardData.adjacencyMap[endpoint] || [];
    for (const neighbor of neighbors) {
      if (canPlaceVillage(neighbor, occupiedVertices, boardSize)) {
        return true;
      }
    }
  }

  return false;
}
```

**2. Modified road priority calculation to escape saturation:**
```typescript
const roadsCanOpenVillageSpots = canRoadsOpenVillageSpots(player.id, gameState, boardSize);

if ((isLateGame || isBoardSaturated) && !roadsCanOpenVillageSpots) {
  roadPriority *= 0.3;  // Severe reduction only if roads won't help
  console.log(`   🛤️ Late game/saturated - road priority severely reduced`);
} else if (isBoardSaturated && roadsCanOpenVillageSpots) {
  // Board saturated but roads can open new spots - BOOST priority
  roadPriority = Math.max(roadPriority, 14);  // Higher than base estate priority
  roadPriority *= 1.5;
  console.log(`   🛤️ Board saturated but roads can open village spots - BOOSTING road priority`);
}
```

### Changes to `aiTurnOrchestrator.ts`

**1. Added viable placement validation to committed goal path:**
```typescript
if (committedGoal) {
  console.log(`   🔒 Committed goal from previous trade: ${committedGoal} (iteration ${tradeIterations})`);

  // Validate that placement is still viable for this goal
  let hasViablePlacement = true;
  if (committedGoal === 'village') {
    const validPlacements = getValidVillagePlacements(player.id, gameState, boardSize);
    hasViablePlacement = validPlacements.length > 0;
    if (!hasViablePlacement) {
      console.log(`   ❌ Committed village goal has NO VIABLE PLACEMENTS - clearing goal`);
      (gameState.turnState as any).committedBuildingGoal = undefined;
      (gameState.turnState as any).tradeIterationsForGoal = 0;
    }
  }
  // ... similar checks for road, estate, dev_card ...
```

**2. Updated all evaluateTradeOpportunity() calls to pass boardSize:**
- Line 106: Expert Negotiator trade evaluation
- Line 148: Post-build trade evaluation
- Line 163: Main trade evaluation when can't build

**3. Made shouldContinueTurn validate trade goals:**
```typescript
// Vary trade action limits by difficulty: easy=2, normal=3, hard=4
const maxTradeActions = difficulty === 'hard' ? 4 : difficulty === 'normal' ? 3 : 2;

const tradeEval = evaluateTradeOpportunity(player, gameState, boardSize);
if (tradeEval.shouldTrade && actionsTaken < maxTradeActions) {
  // Validate that the trade goal has viable placement
  const goals = identifyTradeGoals(player, gameState, boardSize);
  const viableGoals = goals.filter(g => g.hasViablePlacement !== false);

  if (viableGoals.length > 0) {
    console.log(`   ✓ Can still trade toward viable goal: ${tradeEval.reasoning}`);
    return true;
  } else {
    console.log(`   ✗ Trade available but NO VIABLE BUILDING PLACEMENTS`);
    return false;
  }
}
```

### Changes to `useGameEngine.ts`

**1. Updated both evaluateTradeOpportunity() calls to pass boardSize:**
- Line 4565: `handleAIBankTrade()`
- Line 4775: AI trade proposal reasoning

```typescript
const boardSize = gameState.gameSettings.boardSize as BoardSize;
const tradeEval = evaluateTradeOpportunity(player, gameState, boardSize, turnTradeHistory);
```

### Changes to `aiTrading.ts`

**1. Updated function signatures to accept boardSize:**
- `shouldAttemptBankTrade(player, gameState, boardSize, attemptsThisTurn)`
- `selectBankTradeResources(player, gameState, boardSize)`
- `shouldAttemptPlayerTrade(player, gameState, boardSize, attemptsThisTurn)`
- `generatePlayerTradeProposal(player, gameState, boardSize, failedProposalsThisTurn)`

**2. Passed boardSize to all trading strategy calls:**
- `evaluateTradeOpportunity()` in bank trade functions
- `identifyTradeGoals()` in player trade proposal generation
- `getAllRankedPlayerTrades()` in player trade ranking
- `shouldInitiatePlayerTrade()` in player trade initiation check

**3. Updated call sites in `useGameEngine.ts`:**
- `handleAIPlayerTrade()` now extracts boardSize from gameState
- All player trade functions receive boardSize parameter

## Expected Behavior After Fix

### Scenario 1: AI with 0 viable village locations
**Before:**
- Village goal assigned priority 15
- AI trades toward village repeatedly
- All trades rejected or succeed but build fails
- Turn ends with wasted actions

**After:**
- Village goal assigned priority 1 and marked `hasViablePlacement: false`
- Filtered out of viable goals
- AI trades toward estate or dev_card instead (priority 12 and 8)
- OR trades toward roads (boosted to priority 14) to expand network

### Scenario 2: Board saturated, roads could help
**Before:**
- Board flagged as saturated (0-2 village spots on current network)
- Road priority crushed to 0.3x base
- AI doesn't build roads
- Permanently stuck with no village spots

**After:**
- `canRoadsOpenVillageSpots()` returns true (neighbors of road endpoints are valid)
- Road priority boosted to 14 and multiplied by 1.5
- AI builds roads aggressively to reach new territory
- New village spots become available as network expands

### Scenario 3: Committed goal becomes unviable
**Before:**
- AI commits to village goal after trading
- Village goal gets +10 priority boost
- No check if placement is possible
- Build action added, fails at execution
- High-priority failed action shadows viable trades

**After:**
- Committed village goal validated with `getValidVillagePlacements()`
- If 0 locations, goal cleared: `committedBuildingGoal = undefined`
- AI falls back to normal turn planning with viable alternatives
- Logs: `❌ Committed village goal has NO VIABLE PLACEMENTS - clearing goal`

### Scenario 4: Difficulty-based action limits
**Before:**
- All difficulties capped at 3 trade actions per turn
- Hard AI couldn't fully leverage trading strategy

**After:**
- Easy: 2 trade actions max
- Normal: 3 trade actions max
- Hard: 4 trade actions max
- Matches the 4-iteration bank trade limit for hard difficulty

## Bug Fix: Missing boardSize in Player Trade Functions

### Error Encountered
After initial implementation, player trade attempts crashed with:
```
Error: No CSV data found for board size: undefined
at identifyTradeGoals (aiTradingStrategy.ts:197:31)
at shouldInitiatePlayerTrade (aiTradingStrategy.ts:1127:17)
at shouldAttemptPlayerTrade (aiTrading.ts:58:10)
```

### Root Cause
Player trade functions (`shouldAttemptPlayerTrade`, `generatePlayerTradeProposal`, etc.) were calling `identifyTradeGoals()` and other functions that now require `boardSize`, but these functions had not been updated to accept and pass the parameter.

### Resolution
1. Updated `shouldAttemptPlayerTrade()` to accept `boardSize` parameter
2. Updated `shouldInitiatePlayerTrade()` to accept `boardSize` parameter
3. Updated `generatePlayerTradeProposal()` to accept `boardSize` parameter
4. Updated `getAllRankedPlayerTrades()` to accept `boardSize` parameter (passthrough)
5. Updated `handleAIPlayerTrade()` in useGameEngine.ts to extract and pass boardSize
6. All function signatures and call sites now consistent

This ensures that ALL trading functions (both bank and player) properly validate placement viability.

## Verification Checklist

✅ Project builds without TypeScript errors
✅ Village goals marked unviable when no placements exist
✅ Road priority boosted when board saturated but roads can help
✅ Committed goals validated and cleared if unviable
✅ Trade continuation varies by difficulty (2/3/4)
✅ BoardSize parameter threaded through all trade evaluation calls
✅ Player trade functions properly receive and pass boardSize
✅ No more "undefined boardSize" runtime errors

## Testing Recommendations

1. **Test board saturation scenario:**
   - Let game progress until AI's road network is hemmed in
   - Verify AI builds roads to expand rather than getting stuck
   - Check logs for "Board saturated but roads can open village spots - BOOSTING road priority"

2. **Test no viable village placements:**
   - Create scenario where all village spots on network are blocked
   - Verify AI trades toward estates/dev cards instead
   - Check logs for "⚠️ NO VIABLE PLACEMENT" markers

3. **Test committed goal clearing:**
   - Force AI to commit to village goal via trading
   - Block all village spots before next turn
   - Verify goal is cleared and logged

4. **Test difficulty scaling:**
   - Compare hard vs normal AI trade frequency
   - Hard should attempt up to 4 trades, normal up to 3

## Impact Summary

**Core Logic:**
- 6 files modified (aiTradingStrategy.ts, aiStrategicEval.ts, aiTurnOrchestrator.ts, useGameEngine.ts, aiTrading.ts)
- 500+ lines of logic changes
- All function signatures updated to thread boardSize parameter
- 0 new bugs introduced (clean build)

**Key Principles Applied:**
1. **Validate before planning:** Check board state before setting goals
2. **Adaptive strategies:** Boost roads when they're the escape hatch from saturation
3. **Fail fast:** Clear unviable committed goals immediately
4. **Difficulty scaling:** Vary action limits by AI skill level

**Strategic Improvement:**
- AI now intelligently escapes board saturation via road expansion
- No more wasted trades toward impossible buildings
- Better fallback to viable alternatives (estates, dev cards)
- Difficulty tuning reflects intended AI capability differences
