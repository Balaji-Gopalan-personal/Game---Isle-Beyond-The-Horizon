# AI Strategy Improvements Summary

## Overview
This document summarizes the comprehensive improvements made to the AI strategic decision-making system for initial village placement (T1 and T2) and road direction selection.

## Changes Implemented

### 1. Resource Type Prioritization (aiStrategicEval.ts)
**Location**: `getResourceBaseValue()` function

**Changes**:
- Clay: 1.2 → **1.5** (needed for roads and villages)
- Lumber: 1.2 → **1.5** (needed for roads and villages)
- Grain: 1.1 → **1.2** (needed for villages and estates)
- Fabric: **1.1** (unchanged, needed for villages only)
- Mineral: **1.0** (unchanged, only needed for estates and dev cards)

**Impact**: AI now prioritizes locations that provide clay and lumber, which are critical for early-game road building and village expansion.

---

### 2. Center Count Penalties (aiSetupStrategy.ts)
**Location**: `calculateCenterCountBonus()` function

**Changes**:
- 3 non-desert centers: **+12.0** (unchanged)
- 2 non-desert centers: **+5.0** (unchanged)
- 1 non-desert center: -8.0 → **-50.0** (massive penalty)
- 0 non-desert centers: **-100.0** (new, extreme penalty)

**Impact**: AI will now strongly avoid placing villages on vertices with only one resource center, especially on Hard difficulty where such placements are essentially excluded.

---

### 3. Pip Value Bonuses (aiSetupStrategy.ts)
**Location**: `calculatePipCountBonus()` function

**Changes**:
- Values 6 and 8: **+15.0** (unchanged - premium tier)
- Values 5 and 9: +10.0 → **+12.0** (increased)
- Values 4 and 10: **+6.0** (unchanged)
- Values 3 and 11: +3.0 → **+2.0** (decreased)
- Values 2 and 12: +1.0 → **+0.5** (decreased)

**Impact**: AI now better differentiates between high-probability and low-probability dice rolls, prioritizing 6/8/5/9 locations more strongly.

---

### 4. Complementary Resource Bonuses (aiSetupStrategy.ts)
**Location**: `evaluateComplementaryResources()` function

**Changes for Phase 2**:
- First instance of a resource: +15.0 → **+20.0**
- Second instance: +8.0 → **+12.0**
- Third instance: **+3.0** (unchanged)

**Impact**: AI is now more incentivized to obtain resource diversity in Phase 2, ensuring access to all 5 resource types for flexible building options.

---

### 5. Blocking Behavior (aiSetupStrategy.ts)
**Location**: New `evaluateBlockingPotential()` function

**Implementation**:
- Evaluates vertices that have multiple high-value centers (6, 8, 5, 9)
- Checks if opponents are nearby (placed on adjacent vertices)
- Awards bonus: `highValueCenters × 8.0` when blocking is possible
- Integrated into `evaluateSetupVertex()` scoring

**Impact**: AI on Hard difficulty will now consider denying high-value locations to opponents as part of its strategy.

---

### 6. Road Expansion Path Awareness (aiSetupStrategy.ts)
**Location**: New `evaluateRoadExpansionPath()` function

**Implementation**:
- Looks ahead from the road endpoint to identify future village placement opportunities
- Evaluates potential vertices for:
  - Number of non-desert centers (minimum 2)
  - Quality of dice values (6/8 = +5.0, 5/9 = +3.0, 4/10 = +1.5)
  - Whether they're legally placeable (not blocked by adjacent settlements)
- Weighted more heavily in Phase 1 (1.0×) than Phase 2 (0.5×)

**Impact**: AI now places roads in directions that lead to good future expansion spots rather than randomly or solely based on immediate value.

---

### 7. Difficulty-Based Selection Logic (aiEngine.ts)
**Location**: `selectBestVillageVertex()` and `selectBestRoadEdge()` functions

**Changes**:
- **Hard**: 100% best choice (always selects highest-scoring option)
- **Normal**: 80% best choice, 20% from top 3 alternatives
- **Easy**: 60% best choice, 40% from top 40% of options for villages, top 70% for roads

**Previous behavior**:
- Easy: Random from top 60% for villages, completely random for roads
- Normal: Random from top 30%
- Hard: Always best

**Impact**:
- Easy AI still makes mistakes but now considers strategy instead of being random
- Normal AI is more consistent but occasionally varies
- Hard AI is now deterministic and optimal

---

### 8. Quality Threshold Filtering (aiEngine.ts)
**Location**: `selectBestVillageVertex()` function

**Implementation**:
- **Hard**: Filters out vertices with score < 20.0 (falls back to 10.0 if needed)
- **Normal**: Filters out vertices with score < 10.0
- **Easy**: No threshold filtering

**Impact**: Hard difficulty will never place on obviously poor locations, ensuring competitive AI performance.

---

### 9. Decision Logging (aiEngine.ts)
**Location**: Both selection functions

**Implementation**:
- Logs total vertices/roads evaluated
- Shows best option and its score
- Indicates when alternative selections are made
- Includes difficulty level and player name

**Example output**:
```
[AI hard] Batman evaluating 42 vertices (38 after filtering). Best: 15 (score: 45.23)
[AI normal] Scooby evaluating 3 roads from vertex 15. Best: 15__18 (score: 32.10)
[AI normal] Selected alternative road: 15__22
```

**Impact**: Better debugging, transparency, and ability to tune strategy further based on actual gameplay.

---

## Files Modified

1. **src/engine/aiStrategicEval.ts**
   - Updated resource base values

2. **src/engine/aiSetupStrategy.ts**
   - Adjusted pip bonuses
   - Increased one-center penalties
   - Enhanced complementary resource bonuses
   - Added blocking behavior evaluation
   - Added road expansion path awareness

3. **src/engine/aiEngine.ts**
   - Implemented proper difficulty percentages (100/80/60)
   - Added quality threshold filtering
   - Improved road selection strategy
   - Added comprehensive logging

---

## Expected Behavior Changes

### Hard Difficulty
- Will never place on one-center vertices
- Always selects mathematically optimal positions
- Considers blocking opponents on high-value spots
- Plans road placement for future expansion
- Should be competitive with experienced human players

### Normal Difficulty
- Mostly optimal but occasionally makes suboptimal choices (20% of time)
- Filters out very poor placements
- Balances between consistency and variety
- Suitable for intermediate players

### Easy Difficulty
- Makes best choice 60% of time, weaker choices 40%
- Still applies strategic thinking (no longer random for roads)
- Allows human players to win without perfect play
- Suitable for beginners learning the game

---

## Testing Recommendations

1. **Placement Quality**: Observe initial village placements - Hard AI should never place on single-center spots
2. **Road Direction**: Verify roads lead toward expansion opportunities, not dead ends
3. **Difficulty Scaling**: Confirm Hard > Normal > Easy in terms of competitive strength
4. **Resource Balance**: Check that AI prioritizes clay/lumber access early
5. **Blocking Behavior**: Watch for Hard AI denying opponent access to premium spots

---

## Future Enhancement Opportunities

1. **Mid-game Strategy**: Apply similar principles to village placement during main game phase
2. **Trading Logic**: Enhance trading strategy to work with improved resource prioritization
3. **Development Cards**: Better timing for when to buy and play dev cards
4. **Longest Road**: More explicit longest road pathfinding
5. **Adaptive Difficulty**: Dynamic difficulty adjustment based on human player performance

---

**Implementation Date**: December 22, 2025
**Build Status**: ✓ Successful (no TypeScript errors)
**Ready for Testing**: Yes
