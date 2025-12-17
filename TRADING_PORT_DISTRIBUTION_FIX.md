# Trading Port Distribution Fix

## Summary

Fixed trading port generation to use proper percentage-based distribution and moved port generation from deferred async useEffect to synchronous game initialization. This ensures ports are available from the very beginning of the game before any player takes action.

## Changes Made

### 1. Updated Port Type Distribution Algorithm (`src/utils/tradingPortUtils.ts`)

**Previous Implementation:**
- Used a simple 70% random chance to assign resource-specific ports
- Did not guarantee proper distribution across port types
- Could result in unbalanced port type allocation

**New Implementation:**
- Each of 5 resource-specific 2:1 ports (clay, lumber, grain, fabric, mineral): 14% of total
- Generic 3:1 port: 28% of total
- Pre-calculates target counts using `Math.round(numberOfPorts * percentage)`
- Builds a shuffled list of port types before assignment
- Handles edge cases when total ports < 7 by randomly removing port types
- Ensures exact number of ports matches the requested amount

**Example Distributions:**
- 7 ports: 1 clay, 1 lumber, 1 grain, 1 fabric, 1 mineral, 2 generic
- 9 ports: 1-2 of each resource type, ~3 generic
- 5 ports: Some port types randomly excluded to match count

### 2. Moved Port Generation to Synchronous Initialization (`src/hooks/useGameEngine.ts`)

**Previous Flow:**
1. Game initialized with `tradingPorts: undefined` (line 1953)
2. Deferred useEffect watched for `boardCenters.length > 0` (lines 673-712)
3. Generated ports asynchronously after board load
4. Race condition: AI players could take turns before ports exist

**New Flow:**
1. Board graph and centers loaded via useMemo (line 624-656)
2. During game initialization (line 1915-1948):
   - Check if ports are enabled via `config.gameSettings.tradingPortsEnabled`
   - Check if `boardCenters.length > 0`
   - Convert boardGraph vertices/edges to array format
   - Call `generateTradingPorts()` synchronously
   - Store result in `initialTradingPorts` variable
3. Set `tradingPorts: initialTradingPorts` in initial game state (line 1984)
4. Ports now exist before first player's turn begins

### 3. Removed Deferred Port Generation

- Deleted the entire useEffect at lines 673-712 that watched `boardCenters`
- Removed comment at lines 1915-1917 about deferring port generation
- Ports are now generated once during initialization and remain fixed

## Benefits

1. **Eliminates Race Condition**: Ports exist from the very start, before any player action
2. **Proper Distribution**: Port types follow the specified 14%/14%/14%/14%/14%/28% distribution
3. **Deterministic**: Port generation happens once at a predictable time
4. **Simplified Logic**: No async coordination needed between components
5. **Better Testing**: Ports can be verified immediately after game initialization
6. **Performance**: Single synchronous generation vs. reactive async update

## Technical Details

### Port Type Allocation Algorithm

```typescript
// Calculate target counts for each type
const clayCount = Math.round(numberOfPorts * 0.14);
const lumberCount = Math.round(numberOfPorts * 0.14);
const grainCount = Math.round(numberOfPorts * 0.14);
const fabricCount = Math.round(numberOfPorts * 0.14);
const mineralCount = Math.round(numberOfPorts * 0.14);
const genericCount = Math.round(numberOfPorts * 0.28);

// Build list of port types
const portTypesList = [
  ...Array(clayCount).fill('clay'),
  ...Array(lumberCount).fill('lumber'),
  // ... etc
];

// Adjust to exact count if rounding caused mismatch
while (portTypesList.length > numberOfPorts) {
  // Remove random port type
}
while (portTypesList.length < numberOfPorts) {
  // Add random port type
}

// Shuffle and assign sequentially
const shuffledPortTypes = portTypesList.sort(() => Math.random() - 0.5);
```

### Initialization Sequence

1. `boardGraph` useMemo runs (line 624)
2. `setBoardCenters(boardData.centers)` called (line 630)
3. Game initialization useEffect runs (line 1800)
4. Port generation happens synchronously (line 1915-1948)
5. Initial game state set with ports (line 1950-1985)
6. First player's turn begins (line 1987-1999)

## Testing Recommendations

1. Verify port types follow distribution for various total counts (5, 7, 9, 11 ports)
2. Confirm AI players can access ports on their first turn
3. Test with ports disabled (`tradingPortsEnabled: false`)
4. Verify no shared vertices between ports
5. Check port positions are calculated correctly on border edges

## Files Modified

- `src/utils/tradingPortUtils.ts`: Updated port type distribution algorithm
- `src/hooks/useGameEngine.ts`: Moved port generation to initialization, removed deferred useEffect
