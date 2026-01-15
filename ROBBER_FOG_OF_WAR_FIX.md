# Robber Fog of War Fix

## Issue
When the human player moved the Robber (either by playing a Guard card or rolling a 7) and then chose who to steal from, the UI was displaying detailed resource information (specific types: Clay, Lumber, Grain, Fabric, Mineral) for each potential steal target. This violated the "fog of war" game mechanic where players should only know the **total number** of resources opponents have, not the specific breakdown.

## Root Cause
In `ActionPrompt.tsx` (line 460-465), the `OpponentSelector` component was being used to display steal targets without the `hideDetailedResources` prop. This caused the tooltip on each player avatar to show the full resource breakdown like:
```
"PlayerName: 2C 1L 3G 0F 1M (7 total)"
```

Instead of just:
```
"PlayerName: 7 total"
```

## Solution
Added the `hideDetailedResources={true}` prop to the `OpponentSelector` component when it's used for robber steal target selection.

### Changes Made

**File: `src/components/ActionPrompt.tsx` (line 465)**

Before:
```tsx
<OpponentSelector
  opponents={eligibleStealTargets}
  selectedPlayerId={selectedStealTarget}
  onSelectPlayer={(playerId) => onSelectStealTarget?.(playerId)}
  showResourceCount={true}
/>
```

After:
```tsx
<OpponentSelector
  opponents={eligibleStealTargets}
  selectedPlayerId={selectedStealTarget}
  onSelectPlayer={(playerId) => onSelectStealTarget?.(playerId)}
  showResourceCount={true}
  hideDetailedResources={true}
/>
```

## How It Works

The `OpponentSelector` component in `CardEffectPrompts.tsx` already had support for hiding detailed resources via the `hideDetailedResources` prop:

- When `hideDetailedResources={true}`: Tooltip shows `"PlayerName: 7 total"`
- When `hideDetailedResources={false}` (default): Tooltip shows `"PlayerName: 2C 1L 3G 0F 1M (7 total)"`

The fix simply enables this existing feature for the robber stealing UI.

## Impact

✅ **Fog of War Maintained**: Human players can now only see the total resource count for opponents when choosing who to steal from

✅ **Game Balance**: This maintains the intended game mechanics where resource information should be hidden

✅ **No Breaking Changes**: The `OpponentSelector` component already supported this feature, we just enabled it for the robber phase

✅ **Consistent Behavior**: This now matches how other card effects (like Resource Swap) handle opponent resource display

## Build Status

✅ Build successful (442.08 kB / 119.54 kB gzipped)

No TypeScript errors or runtime issues.
