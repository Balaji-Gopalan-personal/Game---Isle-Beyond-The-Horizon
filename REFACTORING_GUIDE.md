# Game Engine Refactoring Guide

## Overview

The game engine has been refactored into modular, testable components that separate business logic from React UI concerns. This makes the codebase easier to test, debug, and extend.

## New Module Architecture

### 1. Core State Management (`src/engine/gameStateManager.ts`)

**Purpose**: Centralized game state management with immutable updates

**Key Features**:
- `GameStateManager` class for controlled state mutations
- `createInitialGameState()` for consistent initial state
- Deep cloning to prevent accidental mutations
- Helper methods for common state operations (addVillage, addRoad, etc.)

**Usage Example**:
```typescript
import { GameStateManager, createInitialGameState } from './engine/gameStateManager';

const initialState = createInitialGameState(players, boardSize, settings, boardGraph);
const stateManager = new GameStateManager(initialState);

stateManager.addVillage(village);
const currentState = stateManager.getState();
```

### 2. Phase Transition Logic (`src/engine/phaseController.ts`)

**Purpose**: Pure functions for phase progression and turn management

**Key Features**:
- `checkSetupPhase1Completion()` - Detects when Phase 1 is complete
- `checkSetupPhase2Completion()` - Detects when Phase 2 is complete
- `getNextPlayerInTurn()` - Determines turn order
- `calculatePhaseCompletion()` - Progress tracking

**Usage Example**:
```typescript
import { checkSetupPhase1Completion } from './engine/phaseController';

const result = checkSetupPhase1Completion(gameState);
if (result.shouldTransition) {
  // Transition to next phase
  console.log(result.message);
}
```

### 3. Board Service (`src/engine/boardService.ts`)

**Purpose**: Board operations and validation logic

**Key Features**:
- `getBoardData()` - Cached board loading for performance
- `canPlaceVillageAtVertex()` - Village placement validation
- `canPlaceRoadOnEdge()` - Road placement validation
- `getValidVillageVertices()` - List all valid placement locations
- `getValidRoadEdgesFromVertex()` - List valid road placements
- `getPlayerOwnedVertices()` - Get player's vertex ownership

**Usage Example**:
```typescript
import { canPlaceVillageAtVertex, getValidVillageVertices } from './engine/boardService';

const result = canPlaceVillageAtVertex(vertexId, occupiedVertices, 'standard');
if (!result.canPlace) {
  console.error(result.reason);
}

const validVertices = getValidVillageVertices(occupiedVertices, 'standard');
```

### 4. AI Engine (`src/engine/aiEngine.ts`)

**Purpose**: Isolated AI decision-making logic

**Key Features**:
- `AIEngine` class with configurable difficulty levels
- `decideSetupPhase1Action()` - AI decisions for setup phase 1
- `decideSetupPhase2Action()` - AI decisions for setup phase 2
- Scoring algorithms for village and road placement
- Deterministic and random selection modes

**Usage Example**:
```typescript
import { createAIEngine } from './engine/aiEngine';

const aiEngine = createAIEngine('standard', 'normal');
const decision = aiEngine.decideSetupPhase1Action(player, gameState);

if (decision.action === 'place_village') {
  placeVillage(decision.vertexId);
}
```

### 5. Setup Phase Orchestrator (`src/engine/setupPhaseOrchestrator.ts`)

**Purpose**: High-level controller for setup phase execution

**Key Features**:
- `SetupPhaseOrchestrator` class that manages the entire setup phase
- `placeVillage()` - Validated village placement
- `placeRoad()` - Validated road placement
- `executeAITurn()` - Automatic AI turn execution
- Automatic phase transitions
- Integrated logging

**Usage Example**:
```typescript
import { SetupPhaseOrchestrator } from './engine/setupPhaseOrchestrator';

const orchestrator = new SetupPhaseOrchestrator(
  initialState,
  'standard',
  'normal',
  (msg) => console.log(msg)
);

orchestrator.placeVillage(playerId, vertexId);
orchestrator.executeAITurn(aiPlayerId);

const currentState = orchestrator.getState();
```

## Testing

### Running Isolated Tests

The refactored modules can be tested independently without UI:

```typescript
import { runSetupPhaseTest } from './engine/setupPhaseTest';

// Run a complete setup phase with AI players
runSetupPhaseTest('standard');
```

### Test Harness

Use the test harness to run multiple scenarios:

```bash
npx tsx src/testHarness.ts
```

## Benefits of Refactoring

### 1. **Testability**
- Pure functions can be unit tested easily
- No React dependencies in business logic
- Deterministic behavior for reliable tests

### 2. **Debuggability**
- Clear separation of concerns
- Each module has a single responsibility
- Easy to trace execution flow
- Comprehensive logging at each layer

### 3. **Maintainability**
- Smaller, focused modules
- Clear interfaces between components
- Easy to modify without breaking other parts
- Self-documenting code structure

### 4. **Extensibility**
- Easy to add new AI strategies
- Simple to add new game phases
- Straightforward to add new board validation rules
- Clear extension points for new features

## Migration Path

### For Existing Code

The existing `phase1.ts` and `useGameEngine.ts` continue to work. You can gradually migrate to the new modules:

1. **Start using `boardService.ts`** for all board operations
2. **Use `phaseController.ts`** for phase transitions
3. **Integrate `SetupPhaseOrchestrator`** for new features
4. **Replace AI logic** with `AIEngine` class

### For New Features

Use the new modular architecture:

1. Add new logic to appropriate modules (state, board, AI, etc.)
2. Write unit tests for the new logic
3. Integrate with orchestrator
4. Update React hooks to use new features

## Example: Adding Dev Card Functionality

```typescript
// 1. Add state management
// In gameStateManager.ts
addDevCard(card: DevelopmentCard, playerId: string): GameState {
  this.state.developmentCardDeck = this.state.developmentCardDeck.filter(c => c.id !== card.id);

  const playerIndex = this.state.players.findIndex(p => p.id === playerId);
  if (playerIndex !== -1) {
    this.state.players[playerIndex].developmentCardsInHand.push(card);
  }

  return this.getState();
}

// 2. Add AI decision logic
// In aiEngine.ts
decideDevCardAction(player: Player, gameState: GameState): AIDecision {
  // Logic for deciding which dev card to play
}

// 3. Use in orchestrator or React hook
orchestrator.drawDevCard(playerId);
```

## Performance Considerations

### Caching
- Board data is cached per board size
- Deep cloning only when needed
- Immutable updates for React optimization

### Efficiency
- Pure functions for easy memoization
- Minimal state mutations
- Clear separation of read vs write operations

## Next Steps

1. ✅ Core state management extracted
2. ✅ Phase transition logic isolated
3. ✅ Board validation separated
4. ✅ AI engine modularized
5. ✅ Setup phase orchestrator created
6. ✅ Test suite implemented
7. 🔄 Integrate with React hooks (useGameEngine)
8. 🔄 Add dev card functionality
9. 🔄 Add multi-step AI actions
10. 🔄 Add gameplay phase orchestrator

## Questions or Issues?

The modular architecture makes it easy to:
- Add console logging at any layer
- Insert breakpoints in specific modules
- Test individual components in isolation
- Verify state at each step

Each module is self-contained and can be understood independently.
