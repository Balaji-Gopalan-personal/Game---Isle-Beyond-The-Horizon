# AI Bank Trade Utilization Improvements

## Problem
AI players were proposing many P2P (player-to-player) trades but rarely executing bank trades, even when they had abundant resources and favorable trading ports. Bank trades were being treated purely as a "last resort" fallback rather than a viable strategic option.

## Root Causes Identified

1. **Sequential Trade Evaluation**: P2P trades were always attempted first, and bank trades were only considered after P2P trades returned no viable options
2. **Conservative Resource Thresholds**: The "hasMany" threshold was set at 8+ resources, which was too high
3. **No Consideration of P2P Failures**: System didn't track or react to repeated P2P trade rejections
4. **Insufficient Bank Trade Scoring**: Bank trades weren't weighted for their key advantage - certainty of getting the needed resource
5. **Port Advantage Underutilized**: Favorable trading ports (2:1, 3:1) weren't factored into the decision to prefer bank trades

## Changes Implemented

### 1. Frustration Meter System (`src/engine/aiTradingStrategy.ts:58-65`)

Added tracking of failed P2P trade attempts and a "frustration level" that increases bank trade priority:

```typescript
const failedProposals = gameState.turnState.aiFailedTradeProposalsThisTurn || new Set<string>();
const failedAttempts = failedProposals.size;
const frustrationLevel = Math.min(failedAttempts, 3); // Cap at 3 for scoring purposes
```

This allows the AI to adapt its strategy based on whether P2P trades are being accepted or rejected.

### 2. Bank Trade Preference Logic (`src/engine/aiTradingStrategy.ts:113-137`)

Added intelligent decision-making for when to prefer bank trades:

- **Expert Negotiator Active**: Always prefer bank trades (2:1 rate)
- **Multiple P2P Failures**: Prefer bank trades after 2+ rejections
- **Abundant Resources + Favorable Port**: Prefer bank when player has 7+ resources AND a 2:1 or 3:1 port
- **Victory Urgency**: Prefer bank trades when close to winning (1-2 points away) with abundant resources
- **Hard Difficulty**: Switch to bank trades after just 1 P2P failure

### 3. Lowered Resource Threshold (`src/engine/aiTradingStrategy.ts:733-738`)

Changed from 8 to 7 resources for "hasMany" status:

```typescript
// Lowered from 8 to 7 to make bank trades more accessible
const hasMany = totalResources >= 7;
```

Also added resource concentration detection:

```typescript
// Find if any resource has high concentration (3+ of one type)
const hasConcentratedResource = (['clay', 'lumber', 'grain', 'fabric', 'mineral'] as ResourceType[])
  .some(r => resources[r] >= 3);
```

### 4. Enhanced Bank Trade Scoring (`src/engine/aiTradingStrategy.ts:671-785`)

Completely rewrote bank trade evaluation to consider multiple factors:

**Base Efficiency Score**:
- 2:1 trades: 9 points
- 3:1 trades: 6 points
- 4:1 trades: 3 points

**Bonus Multipliers**:
- **Port Bonus**: +8 points for 2:1 ports, +4 for 3:1 ports
- **Frustration Bonus**: +2 points per failed P2P attempt (up to +6)
- **Abundance Bonus**: +2-3 points when player has 4-5+ of one resource
- **Certainty Bonus**: +1-3 points based on total resources (higher when near discard threshold)
- **Victory Urgency Bonus**: +2-5 points when close to winning

Example calculation for a 2:1 port trade with 2 failed P2P attempts:
```
Base (2:1 efficiency): 9
Port bonus: +8
Frustration bonus: +4 (2 failures × 2)
Certainty bonus: +2
Total Score: 23 points
```

### 5. Favorable Port Detection (`src/engine/aiTradingStrategy.ts:850-863`)

Added helper function to check if player has beneficial trading ports:

```typescript
function checkForFavorablePorts(player: Player, gameState: GameState): boolean {
  const playerPorts = gameState.tradingPorts?.filter(port =>
    gameState.villages.some(v =>
      v.playerId === player.id &&
      port.vertices.includes(v.vertexId)
    )
  ) || [];

  return playerPorts.some(port =>
    port.type === 'specific_2to1' || port.type === 'general_3to1'
  );
}
```

### 6. Parallel Trade Evaluation (`src/engine/aiTradingStrategy.ts:139-164`)

Changed from sequential (P2P first, then bank) to parallel evaluation where both options are considered and the best is chosen based on current circumstances:

```typescript
// Evaluate both bank and P2P trades, then choose the best option
const bestBankTrade = findBestBankTrade(player, gameState, activeGoal, tradeHistory, frustrationLevel);
const bestPlayerTrade = findBestPlayerTrade(player, gameState, activeGoal, tradeHistory);

// If we prefer bank trades and have one available, use it
if (preferBankTrades && bestBankTrade) {
  return bestBankTrade;
}

// Try P2P trade (only if we haven't exhausted attempts)
if (bestPlayerTrade && failedAttempts < 3) {
  return bestPlayerTrade;
}
```

## Expected Behavior Changes

### Before
- AI would propose P2P trades repeatedly, cycling through different combinations
- Bank trades only used when absolutely no P2P trades were possible
- AI could have 9-10 resources and still try to negotiate with other players
- Trading ports were underutilized

### After
- AI switches to bank trades after 2 failed P2P attempts
- Players with 7+ resources actively consider bank trades
- Players with 2:1 or 3:1 ports strongly prefer bank trades
- Hard difficulty AI uses bank trades more aggressively for efficiency
- Players close to winning (1-2 points away) use bank trades for certainty

## Difficulty-Based Behavior

### Easy
- Maintains conservative approach
- Prefers fair P2P trades (1:1)
- Switches to bank after 2 failures

### Normal
- Balanced approach
- After 2 failed P2P trades, prefers bank if 7+ resources
- Considers both options equally otherwise

### Hard
- Aggressive bank trade usage
- Switches to bank after just 1 P2P failure
- Evaluates trades purely on efficiency
- Willing to use 4:1 bank trades if it guarantees victory progress

## Testing Recommendations

1. **Resource Abundance Test**: Give AI player 8-10 resources, observe if they use bank trades
2. **Port Utilization Test**: Place AI on 2:1 or 3:1 port, verify increased bank trade usage
3. **Frustration Test**: Reject AI's first 2 P2P trades, observe switch to bank trades
4. **Victory Urgency Test**: Give AI player 1 resource away from winning, verify bank trade preference
5. **Difficulty Comparison**: Compare easy vs hard AI bank trade frequency

## Files Modified

- `src/engine/aiTradingStrategy.ts`: Core trading evaluation logic
  - `evaluateTradeOpportunity()`: Added frustration meter and preference logic
  - `findBestBankTrade()`: Enhanced scoring system with multiple bonuses
  - `getSurplusResources()`: Lowered thresholds and added concentration detection
  - `checkForFavorablePorts()`: New helper function for port detection

## Logging Enhancements

All changes include detailed console logging for debugging:
- Frustration level tracking
- Bank trade preference reasons
- Detailed scoring breakdown for each bank trade option
- Port bonus applications
- Resource abundance bonuses
- Victory urgency bonuses

Example log output:
```
💱 [Player] EVALUATING TRADE OPPORTUNITIES
   📉 Failed P2P attempts this turn: 2 (frustration level: 2)
   🏦 PREFERRING BANK TRADES due to:
      - Multiple failed P2P attempts (2)
      - Abundant resources + favorable port
   🏦 Evaluating bank trade options...
      (Frustration bonus active: +4 to all bank trades)
      lumber: Have 5, Rate 2:1 (specific_2to1 port)
         🎯 2:1 port bonus: +8 points
         😤 Frustration bonus: +4 points
         💰 Abundance bonus (5): +3 points
         ✅ Certainty bonus: +2 points
         Score: 26.0 (efficiency: 2:1)
   ✓ Selected BANK trade: 2x lumber → grain
```

## Summary

The AI now treats bank trades as a competitive strategic option rather than a last resort. Bank trades are selected when:
1. They offer favorable rates (2:1 or 3:1 ports)
2. P2P trades have been rejected multiple times
3. Player has abundant resources (7+)
4. Player needs certainty to complete a high-value building or win
5. Player is at risk of discard (7+ resources)

This creates more realistic and strategic gameplay where AI players leverage their trading port positions and make pragmatic decisions about guaranteed trades versus negotiated trades.
