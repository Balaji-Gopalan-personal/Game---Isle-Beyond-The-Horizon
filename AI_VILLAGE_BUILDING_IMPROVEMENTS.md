# AI Village Building Improvements

## Overview
This update addresses critical issues preventing AI players from building villages efficiently. The main problems were resource hoarding, restrictive trade goals, lack of village prioritization, and purposeless road building.

## Key Changes

### 1. Building Priority Calculation (`aiStrategicEval.ts`)

**Problem**: Villages were penalized when AI lacked resources, causing them to be deprioritized when they should be the top goal.

**Solution**:
- **Early Game Detection**: Added game phase detection (early: 0-5 points, mid: 5-8 points)
- **Village Priority Boost**: In early game, village priority is doubled and gets +10 bonus if fewer than 3 villages
- **Reversed Resource Penalty**: Changed from penalizing villages when lacking resources to INCREASING priority (+1.5 per needed resource) to signal "work toward this goal"
- **Catch-up Logic**: Added +8 priority bonus when AI has fewer villages than average
- **Reduced Competition**: In early game when having fewer than 3 villages:
  - Estate priority reduced to 30% of normal
  - Dev card priority reduced to 50% of normal
  - Road priority reduced to 60% of normal

**Code Changes**:
```typescript
// Early game village rush
if (isEarlyGame) {
  villagePriority *= 2.0;
  if (villageCount < 3) {
    villagePriority += 10;
  }
}

// Boost priority when lacking resources (opposite of old penalty)
if (villageResourcesNeeded > 0) {
  villagePriority += villageResourcesNeeded * 1.5;
}
```

### 2. Trade Goal Detection (`aiTradingStrategy.ts`)

**Problem**: AI only considered trading for villages when needing 2 or fewer resources, missing many opportunities.

**Solution**:
- **Relaxed Threshold**: Changed from max 2 needed resources to 3 in early game or when having fewer than 3 villages
- **Dynamic Priorities**: Village trade priority is 15 in early game (vs 10 normally)
- **Context-Aware Goals**: All building goals now adjust priority based on game phase:
  - Early game with few villages: Village=15, Estate=6, DevCard=5, Road=4
  - Normal: Village=12, Estate=12, DevCard=8, Road=6

**Code Changes**:
```typescript
const maxNeededForVillage = isEarlyGame || villageCount < 3 ? 3 : 2;

if (neededCount > 0 && neededCount <= maxNeededForVillage) {
  let villagePriority = 10;
  if (isEarlyGame && villageCount < 3) {
    villagePriority = 15;  // Highest priority
  }
  // ... add goal
}
```

### 3. Surplus Resource Detection (`aiTradingStrategy.ts`)

**Problem**: AI required 3+ of a resource before considering it surplus, causing excessive hoarding.

**Solution**:
- **Lower Threshold**: Changed from `> keepThreshold + 1` to `> keepThreshold` (trade with 3+ instead of 4+)
- **Anti-Discard Logic**: When holding 8+ total resources, any resource with 2+ is considered surplus to avoid discarding
- **Village-Focused Surplus**: Special logic for village goals - if AI has 5+ resources but no identified surplus, resources with 2+ that aren't needed for villages become surplus

**Code Changes**:
```typescript
const hasMany = totalResources >= 8;

if (hasMany && resources[resource] > 1) {
  surplus.push(resource);  // More aggressive when at risk of discarding
} else if (resources[resource] > keepThreshold) {
  surplus.push(resource);
}

// Emergency village-focused trading
if (goal?.targetBuilding === 'village' && surplus.length === 0 && totalResources >= 5) {
  // Mark non-needed resources as tradeable
}
```

### 4. Strategic Road Placement (`aiLocationStrategy.ts`)

**Problem**: Roads were built randomly without considering if they lead to good village locations.

**Solution**:
- **Village Expansion Value**: New function `calculateVillageExpansionValue()` evaluates potential village spots accessible from road endpoint
- **Weighted Scoring**: Roads leading to high-value village spots get +8 points (or +5 for good spots)
- **Early Game Multiplier**: In early game with fewer than 3 villages, village expansion value is weighted 5x (vs 3x normally)

**Code Changes**:
```typescript
const villageExpansionValue = calculateVillageExpansionValue(
  toVertex, gameState, boardSize, player
);

adjustedScore =
  evaluation.expansionValue * weights.expansionWeight +
  evaluation.productionAccess * weights.productionWeight * 0.5 +
  evaluation.portConnectionValue * weights.portWeight +
  villageExpansionValue * (isEarlyGame && villageCount < 3 ? 5.0 : 3.0);
```

**New Function**:
```typescript
function calculateVillageExpansionValue(vertexId, gameState, boardSize, player): number {
  // For each adjacent vertex:
  //  - Check if it's a valid village spot
  //  - Evaluate its village quality score
  //  - Award points based on score: 20+ → 8pts, 15+ → 5pts, 10+ → 3pts
  // Returns total expansion value for this road
}
```

## Expected Improvements

### Behavioral Changes:
1. **Aggressive Village Building**: AI will prioritize villages over everything else in early game
2. **Active Trading**: AI will trade even when needing 3 resources (vs 2 before), making multi-step plans
3. **Smart Resource Management**: Less hoarding, more willing to trade resources not needed for village building
4. **Purposeful Roads**: Roads built toward high-quality village spots rather than random directions

### Impact by Game Phase:

**Early Game (0-5 points, < 3 villages)**:
- Village priority: 2x boost + resource need bonus
- Villages should be built ASAP even at poor rates
- Roads prioritize village expansion 5x
- Estates and dev cards heavily deprioritized

**Mid Game (5-8 points, < 4 villages)**:
- Village priority: 1.5x boost if behind
- Balanced approach between villages and other goals
- Roads prioritize village expansion 3x

**Late Game (8+ points)**:
- Normal priority calculations
- Focus shifts to points-per-resource efficiency

## Testing Recommendations

Monitor for:
1. AI building 3-4 villages before heavily investing in other strategies
2. AI initiating trades when 1-3 resources away from villages
3. Roads extending toward open, high-production hexes
4. Reduced instances of AI holding 8+ resources and being forced to discard
5. More competitive games with AI reaching 5-7 points faster

## Difficulty Levels

All improvements apply across all difficulty levels:
- **Easy**: Still makes some random choices, but with village-focused priorities
- **Normal**: 80% optimal village decisions
- **Hard**: Always optimal village decisions, maximum aggression

The core fix is in the priority calculations which affect all difficulties equally.
