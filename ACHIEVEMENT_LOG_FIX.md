# Achievement Logging Fix

## Problem
Game events log was not consistently reporting when players win or steal the Longest Road or Largest Army achievements.

## Root Causes Identified

### Largest Army Issues
1. **Race conditions with setTimeout**: Log messages were being added using `setTimeout` with delays (50ms, 100ms, 200ms)
2. **Closure problems**: Delayed callbacks could capture stale state
3. **Messages inside map function**: Log calls were being made inside the player map function, which could execute multiple times

### Longest Road Issues
1. **Missing loss messages**: When a player lost the Longest Road, no log entry was created
2. **Inconsistent with Largest Army**: Only gains were logged, not losses

## Changes Made

### 1. Fixed `handlePlayGuardCard` function (src/hooks/useGameEngine.ts:2234-2321)
- **Removed all setTimeout calls** for logging
- **Made logging synchronous**: Messages are now added immediately after state updates
- **Extracted logging logic**: Moved log calls outside the map function to prevent duplicates
- **Track state changes**: Added variables to track `previousHolderName` and `achievementGained`
- **Consistent messaging**: Used `addColoredLog` for achievement changes to match Longest Road format
- **Two message types**:
  - First achievement: "Player achieved the Largest Army (N) and earned N bonus points!"
  - Stolen achievement: "Player took the Largest Army (N) from PreviousPlayer and earned N bonus points!"

### 2. Enhanced `checkLongestRoadBonus` function (src/hooks/useGameEngine.ts:792-825)
- **Added loss message**: When Longest Road is taken from another player, both gain and loss are now logged
- **Format**: "Player lost the Longest Road and N bonus points"
- **Maintains consistency**: Uses `addColoredLog` for colored player names

## Testing Recommendations

Test these scenarios to verify the fixes:

1. **First achievement**: Player reaches minimum requirement (5 roads or 3 guards)
2. **Stealing achievement**: Second player exceeds first player's count
3. **Multiple steals**: Achievement changes hands multiple times
4. **AI players**: Verify logs appear for both human and AI players
5. **Road Construction card**: Verify Longest Road detection when using free roads
6. **Guard card sequence**: Play multiple Guard cards and verify army count updates

## Expected Log Behavior

### Longest Road
- When first achieved: "Player achieved the Longest Road (5) and earned 2 bonus points!"
- When stolen: Two messages:
  - "NewPlayer took the Longest Road (6) from PreviousPlayer and earned 2 bonus points!"
  - "PreviousPlayer lost the Longest Road and 2 bonus points"

### Largest Army
- When first achieved: "Player achieved the Largest Army (3) and earned 2 bonus points!"
- When stolen: "NewPlayer took the Largest Army (4) from PreviousPlayer and earned 2 bonus points!"
- Always shows: "Player added 1 to Army count (now N)"

All player names appear in colored text matching their player color.
