# AI Strategic Decision-Making Enhancements

This document summarizes the comprehensive improvements made to AI player strategic decision-making based on gameplay observations and testing.

## Overview

Enhanced AI strategic intelligence across four key areas:
1. **Guard (Robber) Placement Strategy** - More purposeful and strategic placement
2. **Resource Cost Awareness** - Accurate resource validation throughout decision chain
3. **Purposeful Road Building** - Roads built with village expansion intent
4. **Distinct Persona Behaviors** - Dramatically different and recognizable AI personalities

## Changes Made

### 1. Building Costs Validation System (NEW FILE)
**File**: `src/engine/buildingCosts.ts`

Created centralized building cost validation system:
- `BUILDING_COSTS` constant with all building recipes
- `canAffordBuilding()` - Check if player can afford a building
- `getResourceDeficit()` - Calculate exactly what resources are needed
- `getResourcesNeededForBuilding()` - List required resources for any building
- `validateResourceForBuilding()` - Verify a resource is actually needed
- `getMostNeededResources()` - Prioritize resources across multiple building goals

**Impact**: Eliminates errors like requesting Mineral for Village (which doesn't require it)

### 2. Enhanced Robber (Guard) Placement
**File**: `src/engine/aiRobberStrategy.ts`

**Improvements**:
- **Self-Blocking Detection**: AI now checks if robber is currently blocking its own hexes
  - High-production hexes (6/8): +80 bonus to move robber
  - Medium-production hexes (5/9): +50 bonus
  - Other hexes: +30 bonus

- **Resource-Need Aware Stealing**: Targets players who likely have needed resources
  - Identifies top 3 needed resources using `getMostNeededResources()`
  - +25 score bonus if hex produces needed resources
  - +8 bonus per needed resource target player might have

- **Smart Target Selection**: Prioritizes based on game state
  - Leaders close to winning: +40 score
  - Players on estates (cities): +15 score
  - Players with abundant needed resources: higher priority

**Impact**: Guard cards played purposefully, not randomly

### 3. Improved Guard Card Play Timing
**File**: `src/engine/aiDevCardStrategy.ts`

**Changes**:
- Reduced base Guard score from 5 to 3 (less random playing)
- **Major bonuses for strategic plays**:
  - Robber blocking own high-production hex: +20
  - Robber blocking own medium-production hex: +12
  - Leader 2 points from winning: +10
  - Can steal needed resources: +6
  - At resource limit: +7
- **Penalty for non-strategic plays**: -3 when no urgent need

**Impact**: Guard cards played when strategically valuable, not randomly

### 4. Booming Economy Resource Selection
**File**: `src/engine/aiDevCardStrategy.ts`

**Enhancements**:
- Increased weight for needed resources (20 → 25)
- Stronger preference for resources needed AND missing (0 in hand): +12 bonus
- Better scoring for secondary building goals
- Validation that selected resources align with building costs

**Impact**: AI always selects resources it actually needs for building goals

### 5. Purposeful Road Building
**File**: `src/engine/aiLocationStrategy.ts`

**Major Improvements**:
- **Dramatically increased village expansion weight**:
  - Early game (<3 villages): 5x → 12x multiplier
  - Mid game (<4 villages): 3x → 10x multiplier
  - Late game: 3x → 8x multiplier

- **"Road to Nowhere" penalty**: -5 score if road doesn't enable any village placements

- **Viable Location Tracking**: Added `countViableVillageLocations()` function

**Impact**: Roads always built toward viable village locations, not randomly

### 6. Location Scarcity Detection
**File**: `src/engine/aiStrategicEval.ts`

**New Logic**:
```typescript
viableVillageLocations = countViableVillageLocations(playerId, gameState, boardSize)

if (viableVillageLocations <= 4):
  villagePriority *= 0.7      // Reduce village focus
  estatePriority *= 1.5       // Increase estate focus
  devCardPriority *= 1.5      // Increase dev card focus

if (viableVillageLocations <= 2):
  villagePriority *= 0.5      // Further reduce villages
  estatePriority *= 1.5       // Further boost estates
  devCardPriority *= 2.0      // Significantly boost dev cards
  roadPriority *= 0.5         // Reduce road building
```

**Impact**: AI adapts strategy when expansion space becomes limited

### 7. New Developer Persona
**File**: `src/engine/aiLocationStrategy.ts`

**Added 6th Personality Type**: "developer"
- Focuses on Development Cards and Largest Army
- Lower emphasis on expansion and roads
- Prioritizes Grain/Fabric/Mineral production
- Upgrades to estates earlier for better resource generation

**Character Assignments**: Chip, Dale, Donatello, Brainy Smurf, Zummi Gummi, Doc

### 8. Sharpened Persona Distinctions
**File**: `src/engine/aiLocationStrategy.ts`

**Aggressive (Was: Moderate) → Now: VERY Aggressive**
- productionWeight: 2.5 → 3.5 (+40%)
- diversityWeight: 1.5 → 1.0 (-33%)
- expansionWeight: 2.0 → 1.5 (-25%)
- blockingWeight: 3.0 → 4.0 (+33%)
- **Strategy**: Rush 3-4 villages on highest production hexes, ignore diversity

**Expansionist (Was: Moderate) → Now: VERY Expansive**
- expansionWeight: 4.0 → 5.0 (+25%)
- **Strategy**: Aggressively pursues longest road, builds roads constantly

**Developer (NEW)**
- productionWeight: 2.5
- expansionWeight: 1.0 (lowest)
- **Strategy**: Focuses on dev cards from turn 3+, pursues Largest Army

**Trader (Unchanged)**
- Still prioritizes ports and diversity

**Defensive (Slight Boost)**
- blockingWeight: 2.5 → 3.5 (+40%)
- **Strategy**: Protects positions, blocks opponents

### 9. Personality-Based Building Priorities
**File**: `src/engine/aiStrategicEval.ts`

**New Modifiers Applied**:

**Aggressive**:
- Village priority: +50% (×1.5)
- If <4 villages: Additional +30% (×1.3)
- Dev card priority: -40% (×0.6)
- Road priority: -20% (×0.8)

**Expansionist**:
- Road priority: +80% (×1.8)
- Village priority: +10% (×1.1)
- Dev card priority: -30% (×0.7)
- Estate priority: -10% (×0.9)

**Developer**:
- Dev card priority: +100% (×2.0)
- If ≥2 villages: Additional +30% (×1.3)
- Estate priority: +30% (×1.3)
- Village priority: -30% (×0.7)
- Road priority: -40% (×0.6)

**Trader**:
- Village priority: +20% (×1.2)
- Dev card priority: +10% (×1.1)

**Defensive**:
- Estate priority: +20% (×1.2)
- Dev card priority: +10% (×1.1)

**Impact**: Each personality has dramatically different, observable behavior patterns

## Expected Behavioral Changes

### Robber/Guard Usage
**Before**: Often placed randomly or without clear purpose
**After**:
- Moves robber off own hexes when blocking production
- Targets leaders close to winning
- Steals resources AI actually needs
- Only plays Guard when strategically valuable

### Resource Selection (Booming Economy, Trading)
**Before**: Could request wrong resources (e.g., Mineral for Village)
**After**:
- Always validates resources against building costs
- Prioritizes resources for current building goals
- Never requests resources not needed for any building

### Road Building
**Before**: Roads built without clear direction, sometimes to nowhere
**After**:
- Roads always lead toward viable village locations
- AI recognizes when expansion space is limited
- Strategy shifts to estates and dev cards when space is scarce
- No more "roads to nowhere"

### Personality Behaviors

**Aggressive AI**:
- Rapidly builds 3-4 villages on best hexes
- Ignores resource diversity for raw production
- Upgrades to estates aggressively
- Minimal road building unless needed for villages

**Expansionist AI**:
- Builds roads constantly
- Pursues longest road bonus relentlessly
- Sacrifices some production for expansion
- Uses Road Construction dev cards frequently

**Developer AI**:
- Buys dev cards from turn 3 onward
- Focuses on Grain/Fabric/Mineral production
- Pursues Largest Army bonus
- Builds fewer villages, upgrades earlier
- Minimal road building

**Trader AI**:
- Seeks port access
- Builds diverse resource base
- Balances villages and dev cards

**Defensive AI**:
- Protects established positions
- Blocks opponents strategically
- Upgrades to estates for stability

## Testing Recommendations

1. **Play against each personality** to verify distinct behaviors
2. **Watch Guard card plays** - should be purposeful, not random
3. **Observe road building** - roads should lead to villages
4. **Check resource requests** - validate against building costs
5. **Monitor late-game strategy** - should shift when space is limited
6. **Verify robber movement** - should move off own high-production hexes

## Files Modified

1. `src/engine/buildingCosts.ts` - NEW FILE
2. `src/engine/aiRobberStrategy.ts` - Enhanced robber placement
3. `src/engine/aiDevCardStrategy.ts` - Improved Guard timing and Booming Economy
4. `src/engine/aiLocationStrategy.ts` - Purposeful roads, developer persona, sharpened personalities
5. `src/engine/aiStrategicEval.ts` - Location scarcity, personality modifiers

## Build Status

✅ Project builds successfully with no errors
✅ All type checks pass
✅ Ready for gameplay testing

## Next Steps

1. Play multiple games in Testing Mode to observe AI behaviors
2. Verify each personality exhibits distinct strategies
3. Confirm robber placement is strategic
4. Validate resource requests match building costs
5. Check road building has clear purpose
6. Adjust weights if behaviors need further tuning
