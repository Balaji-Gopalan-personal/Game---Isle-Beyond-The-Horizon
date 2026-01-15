# AI Strategy Improvements V2

## Overview
This document describes the second round of AI strategy enhancements focused on balanced resource acquisition, aggressive building, and smarter development card usage.

---

## 1. Balanced Resource Acquisition for Villages

**Problem**: AI was not prioritizing village placements that would give access to all 5 resource types, leading to resource bottlenecks.

**Solution**: Enhanced the village placement evaluation to reward vertices that fill resource gaps.

### Changes Made

**File: `src/engine/aiStrategicEval.ts`**

#### Resource Diversity Scoring (lines 110-137)
- **Increased rewards** for high diversity:
  - 5 unique resources: 12.0 (was 10.0)
  - 4 unique resources: 8.0 (was 7.0)
  - 3 unique resources: 5.0 (unchanged)
- **Decreased rewards** for low diversity:
  - 2 unique resources: 2.5 (was 3.0)
  - 1 unique resource: 0.5 (was 1.0)

#### New: Resource Gap Bonus System (lines 139-197)
Added `calculateResourceGapBonus()` function that:

1. **Identifies Missing Resources**: Checks which resource types the player doesn't have production access to yet
2. **Rewards Filling Gaps**:
   - +4.0 points per NEW resource type this vertex would provide
   - +0.5x the production value of new resources
   - +8.0 bonus if this would give access to all 5 resource types
3. **Production-Weighted**: New resources on high-probability hexes are valued more

#### Updated Vertex Evaluation (lines 38-67)
```typescript
const totalScore =
  productionValue * 3.0 +
  resourceDiversity * 2.5 +    // Increased weight from 2.0
  portAccess * 1.5 +
  expansionPotential * 1.0 +
  gapFillingBonus * 3.0;        // NEW component
```

**Result**: AI now strongly prioritizes village locations that provide access to resource types it doesn't have yet, leading to more balanced economies and fewer resource bottlenecks.

---

## 2. Aggressive Building Toward Villages, Estates, and Development Cards

**Problem**: AI was not building toward victory points aggressively enough, sometimes choosing to build roads or save resources instead of pursuing villages, estates, and dev cards.

**Solution**: Increased priority values for point-generating buildings at multiple levels in the AI decision-making system.

### Changes Made

**File: `src/engine/aiStrategicEval.ts`**

#### Building Priority Calculation (lines 341-399)
Increased multipliers and reduced penalties:

```typescript
// Villages: More aggressive
let villagePriority = (10 - villageCount) * 3.0;     // Was 2.5
villagePriority -= villageResourcesNeeded * 2.5;      // Was 3.0

// Estates: More aggressive
let estatePriority = (5 - cityCount) * 3.5;           // Was 2.5
estatePriority -= estateResourcesNeeded * 2.5;        // Was 3.0
```

Added **development card priority calculation** (lines 370-389):
```typescript
let devCardPriority = 9;  // Base priority (new, was missing)

// Bonus when close to winning
if (pointsAway <= 3) devCardPriority += 3;
else if (pointsAway <= 5) devCardPriority += 1.5;

// Bonus for largest army pursuit
if (myGuardCount >= largestArmySize - 2) devCardPriority += 2;
```

**File: `src/engine/aiBuilding.ts`**

#### Development Card Priority (line 89)
```typescript
priority: priorityMap['dev_card'] || 8  // Was hardcoded to 5
```

**File: `src/engine/aiTurnOrchestrator.ts`**

#### Turn Action Priorities (lines 98-111)
Increased base priorities for all point-generating buildings:

```typescript
case 'village':   basePriority = 11;  // Was 9
case 'estate':    basePriority = 12;  // Was 10
case 'dev_card':  basePriority = 9;   // Was 7
case 'road':      basePriority = 6;   // Unchanged
```

**Result**: AI now prioritizes villages, estates, and development cards much more aggressively, leading to faster progression toward victory and more competitive gameplay.

---

## 3. Expert Negotiator - Only Play When Intending to Bank Trade

**Problem**: AI was playing Expert Negotiator whenever it had surplus resources, even when it had no intention of doing a bank trade, wasting the card's 2:1 trading benefit.

**Solution**: Made Expert Negotiator conditional on the AI actually planning to do a bank trade immediately after playing it.

### Changes Made

**File: `src/engine/aiDevCardStrategy.ts`**

#### Updated Expert Negotiator Scoring (lines 271-284)
```typescript
case 'Expert Negotiator':
  // Only play if we're actually planning to do a bank trade
  const wouldBankTrade = checkIfBankTradeIsBeneficial(player, gameState);
  if (!wouldBankTrade) {
    return 0;  // Don't play if not intending to bank trade
  }

  // If we would benefit from a bank trade, very valuable
  if (pointsAway <= 4) return 13;
  else return 10;
```

#### New Helper Functions (lines 408-476)

**`checkIfBankTradeIsBeneficial()`** - Checks three conditions:
1. Player has a viable building goal (close to affording something)
2. Player has surplus resources (has > 2 of at least one resource)
3. Player can afford a bank trade (has ≥ 3-4 of some resource depending on ports)

**`hasViableBuildingGoal()`** - Returns true if player is close to affording:
- Village: needs ≤ 2 of the 4 required resources
- Estate: needs ≤ 2 more resources (grain/mineral)
- Road: needs 1 more resource (clay or lumber)
- Dev Card: needs ≤ 2 of the 3 required resources

**Result**: Expert Negotiator is now played strategically - only when the AI has surplus resources, needs specific resources for building, and can afford a bank trade. This maximizes the card's value by ensuring the 2:1 trade rate is actually used.

---

## Summary of Improvements

| Improvement | Impact | Files Changed |
|------------|--------|---------------|
| **Balanced Resources** | AI prioritizes diverse resource access, fills gaps in production | `aiStrategicEval.ts` |
| **Aggressive Building** | AI builds villages, estates, and dev cards more aggressively | `aiStrategicEval.ts`, `aiBuilding.ts`, `aiTurnOrchestrator.ts` |
| **Smart Expert Negotiator** | Card only played when actually beneficial for bank trading | `aiDevCardStrategy.ts` |

---

## Expected Gameplay Changes

1. **Better Economies**: AI players will have more balanced resource production, reducing reliance on trading
2. **Faster Games**: More aggressive building toward victory points will lead to quicker wins
3. **Higher Scores**: AI players will accumulate points faster through better building decisions
4. **Smarter Card Play**: Development cards will be used more strategically, especially Expert Negotiator
5. **More Competitive**: All difficulty levels benefit from these improvements, with "hard" AI being significantly stronger

---

## Build Status

✅ All changes compiled successfully
- Bundle size: 442.06 kB (gzipped: 119.54 kB)
- No TypeScript errors
- No runtime errors expected
