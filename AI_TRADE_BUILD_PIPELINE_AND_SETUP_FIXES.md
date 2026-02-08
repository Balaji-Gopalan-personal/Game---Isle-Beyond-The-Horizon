# AI Trade-Build Pipeline and Setup Phase Fixes

## Date: 2026-02-08

## Issues Fixed

### 1. AI Trading Without Building (Trade-Build Disconnect)
**Problem**: AI players would execute trades but then not build in the same turn, losing the intent of the trade.

**Root Cause**: The committed building goal mechanism was only half-implemented:
- Reading part existed in `aiTurnOrchestrator.ts` (line 33)
- Writing part was missing in trade execution
- No clearing mechanism after builds
- No timeout for abandoned goals

### 2. Hard AI Struggles Due to Poor Setup Resource Balance
**Problem**: Hard difficulty AI players placed first settlements with poor resource diversity, making early game expansion difficult.

**Root Causes**:
- Phase 1 ignored resource diversity (only applied in Phase 2)
- Production weight (5.0) heavily overshadowed diversity weight (3.5)
- No penalty for imbalanced resource distributions
- AI could place first settlement with 3 of same resource type and 0 of others

## Changes Implemented

### Trade-Build Pipeline Fixes

#### 1. Committed Goal Persistence (`useGameEngine.ts:4633-4683`)
**File**: `src/hooks/useGameEngine.ts`

Added committed goal tracking to bank trade execution:
- Saves `committedBuildingGoal` from trade evaluation to `turnState`
- Tracks `tradeIterationsForGoal` counter
- Implements difficulty-based iteration limits:
  - **Easy**: 2 trades max before abandoning goal
  - **Normal**: 3 trades max
  - **Hard**: 4 trades max
- Logs commitment and continuation messages

```typescript
// Persist the building goal from this trade
const targetBuilding = (tradeEval as any).targetBuilding;
const currentGoal = (prev.turnState as any).committedBuildingGoal;
const tradeIterations = (prev.turnState as any).tradeIterationsForGoal || 0;

// Get difficulty for max iteration limit
const currentPlayer = prev.players.find(p => p.id === playerId);
const difficulty = currentPlayer?.difficulty || 'normal';
const maxIterations = difficulty === 'hard' ? 4 : difficulty === 'normal' ? 3 : 2;
```

#### 2. Goal Clearing After Builds (`useGameEngine.ts:4906-4918`)
**File**: `src/hooks/useGameEngine.ts`

Added automatic clearing of committed goals after successful builds:
- Checks if built structure matches committed goal
- Clears both `committedBuildingGoal` and `tradeIterationsForGoal`
- Logs the clearing action

```typescript
// If build was successful, clear the committed goal
if (actionSuccess) {
  const committedGoal = (gameState.turnState as any).committedBuildingGoal;
  if (committedGoal && committedGoal === buildingType) {
    console.log(`   ✓ Clearing committed goal: ${committedGoal} (successfully built)`);
    setGameState(prev => ({
      ...prev,
      turnState: {
        ...prev.turnState,
        committedBuildingGoal: undefined,
        tradeIterationsForGoal: 0
      }
    }));
  }
}
```

#### 3. Enhanced Turn Plan Priority (`aiTurnOrchestrator.ts:32-50`)
**File**: `src/engine/aiTurnOrchestrator.ts`

Improved committed goal handling in turn planning:
- Increased priority boost from +5 to +10 for committed builds
- Added logging showing current iteration count
- Added helper function `getResourcesNeeded()` to show what's still needed
- Logs detailed resource gaps for unaffordable goals

```typescript
if (canAfford) {
  const buildPriority = calculateBuildPriority(player, gameState, committedGoal) + 10; // Increased boost
  console.log(`   ✓ Can now afford committed ${committedGoal}! Adding with boosted priority ${buildPriority}`);
} else {
  const resourcesNeeded = getResourcesNeeded(player, committedGoal);
  console.log(`   ⚠️ Still cannot afford committed ${committedGoal}`);
  console.log(`      Still need: ${resourcesNeeded}`);
}
```

#### 4. Enhanced Trade Logging (`useGameEngine.ts:4592-4602`)
**File**: `src/hooks/useGameEngine.ts`

Trade log messages now show the building goal:
```typescript
const targetBuilding = (tradeEval as any).targetBuilding;
const targetSuffix = targetBuilding ? ` (building toward ${targetBuilding})` : '';
const message = `${player.name} traded ... (${rateDisplay})${targetSuffix}`;
```

### Setup Phase Balance Fixes

#### 1. Updated Phase 1 Weights (`aiSetupStrategy.ts:13-18`)
**File**: `src/engine/aiSetupStrategy.ts`

Changed weights to 60% production / 40% diversity:
```typescript
export const PHASE_1_WEIGHTS: SetupPhaseWeights = {
  production: 6.0,  // 60% weight - prioritize high-probability rolls (6, 8, 5, 9)
  diversity: 4.0,   // 40% weight - ensure balanced resource access (clay, lumber, grain, fabric)
  portAccess: 1.0,
  expansion: 1.5,
};
```

#### 2. Applied Complementary Resources to Phase 1 (`aiSetupStrategy.ts:82-99`)
**File**: `src/engine/aiSetupStrategy.ts`

Enabled resource complementarity evaluation for both phases:
- Phase 1: 0.8x weight, focuses on critical resources (clay, lumber, grain, fabric)
- Phase 2: 1.0x weight, focuses on filling gaps
- Added resource imbalance penalty for Phase 1 only

```typescript
// Apply complementary resource evaluation for BOTH phases
const complementaryWeight = isPhase2 ? 1.0 : 0.8;
score += evaluateComplementaryResources(vertexId, player, boardSize, gameState, isPhase2) * complementaryWeight;

// Phase 1 only: Apply resource imbalance penalty
if (!isPhase2) {
  const imbalancePenalty = calculateResourceImbalancePenalty(vertexId, player, gameState);
  score += imbalancePenalty;
}
```

#### 3. Enhanced Complementary Resource Logic (`aiSetupStrategy.ts:161-226`)
**File**: `src/engine/aiSetupStrategy.ts`

Updated to distinguish between Phase 1 and Phase 2:
- **Phase 1**: Higher bonus (+30) for critical resources (clay, lumber, grain, fabric)
- **Phase 1**: Extra +20 bonus for covering all 4 critical resources
- **Phase 2**: Standard bonus (+25) for any new resource
- Both: +30 bonus for completing all 5 resource types

```typescript
const criticalResources = ['clay', 'lumber', 'grain', 'fabric'];

for (const resource of newResources) {
  const isCritical = criticalResources.includes(resource);
  if (currentCount === 0) {
    const bonus = isPhase2 ? 25.0 : (isCritical ? 30.0 : 18.0);
    complementaryScore += bonus;
  }
}
```

#### 4. Resource Imbalance Penalty (`aiSetupStrategy.ts:228-271`)
**File**: `src/engine/aiSetupStrategy.ts`

New function to penalize poor resource distributions in Phase 1:
- **-25 points**: Missing 2+ critical resources with 2x concentration
- **-40 points**: Missing 3+ critical resources
- **-50 points**: 3x concentration + missing 2+ critical resources

```typescript
// Heavy penalty for missing 2+ critical resources with high concentration in one
if (missingCritical >= 2 && maxCount >= 2) {
  penalty = -25.0;
}

// Severe penalty for missing 3+ critical resources
if (missingCritical >= 3) {
  penalty = -40.0;
}

// Extra penalty for having 3 of the same resource with 0 of multiple others
if (maxCount >= 3 && missingCritical >= 2) {
  penalty = -50.0;
}
```

#### 5. Enhanced Setup Phase Logging (`aiSetupStrategy.ts:101-124`)
**File**: `src/engine/aiSetupStrategy.ts`

Added detailed resource distribution logging:
```typescript
const resourceDist = `Clay:${projectedResources.clay || 0} Lumber:${projectedResources.lumber || 0} ...`;
console.log(`[AI Eval ${isPhase2 ? 'P2' : 'P1'}] V${vertexId} centers: ${centerInfo}`);
console.log(`           Resources: ${resourceDist} | Score: ${score.toFixed(1)}`);
```

## Expected Behavior Changes

### Trade-Build Pipeline
1. **Immediate Builds After Trades**: AI will now build immediately after completing trades
2. **Trade Goal Memory**: Each trade iteration remembers the building goal
3. **No Orphaned Trades**: Trades always lead to builds or timeout after max iterations
4. **Clear Logging**: Can see "building toward X" in trade messages

### Setup Phase
1. **Balanced First Settlements**: Phase 1 placements will prioritize having at least 1 source of each critical resource
2. **No High-Production-Only Starts**: AI won't place on 3x clay, 0x grain positions
3. **Better Early Game**: Hard AI should have more balanced resource income from turn 1
4. **Consistent Performance**: Hard difficulty should reach 8+ points within 10-12 turns

## Testing Recommendations

1. **Trade-Build Flow**: Watch for AI trades followed immediately by builds in same turn
2. **Setup Diversity**: Check first settlement provides 3-4 different resources (especially critical ones)
3. **Hard AI Performance**: Should achieve 8+ points within 10-12 turns consistently
4. **Log Messages**: Verify "building toward X" appears in trade logs

## Files Modified

1. `src/hooks/useGameEngine.ts` - Trade execution and build clearing
2. `src/engine/aiTurnOrchestrator.ts` - Turn planning and committed goals
3. `src/engine/aiSetupStrategy.ts` - Setup phase weights and evaluation

## Build Status

✓ Build completed successfully with no errors
