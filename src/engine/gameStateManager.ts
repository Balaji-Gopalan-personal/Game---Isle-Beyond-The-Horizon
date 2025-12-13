import { GameState, Player, Village, Road, TurnState, GameSettings, DevelopmentCard, Resources } from '../types/game';
import { BoardSize } from '../data/boardConfigs';

export interface GameStateUpdate {
  villages?: Village[];
  roads?: Road[];
  players?: Player[];
  turnState?: Partial<TurnState>;
  phase?: GameState['phase'];
  currentPlayer?: string;
  verticesOccupiedBy?: Record<number, string | null>;
  edgesOccupiedBy?: Record<string, string | null>;
  robberPosition?: number;
  developmentCardDeck?: DevelopmentCard[];
  developmentCardDiscard?: DevelopmentCard[];
}

export class GameStateManager {
  private state: GameState;

  constructor(initialState: GameState) {
    this.state = this.deepClone(initialState);
  }

  getState(): GameState {
    return this.deepClone(this.state);
  }

  updateState(update: GameStateUpdate): GameState {
    this.state = {
      ...this.state,
      ...update,
      turnState: update.turnState
        ? { ...this.state.turnState, ...update.turnState }
        : this.state.turnState
    };
    return this.getState();
  }

  addVillage(village: Village): GameState {
    this.state.villages.push(village);
    this.state.verticesOccupiedBy[village.vertexId] = village.playerId;

    const playerIndex = this.state.players.findIndex(p => p.id === village.playerId);
    if (playerIndex !== -1) {
      this.state.players[playerIndex] = {
        ...this.state.players[playerIndex],
        villageCount: this.state.players[playerIndex].villageCount + 1,
        score: this.state.players[playerIndex].score + 1
      };
    }

    return this.getState();
  }

  addRoad(road: Road): GameState {
    this.state.roads.push(road);
    const edgeId = road.from < road.to ? `${road.from}__${road.to}` : `${road.to}__${road.from}`;
    this.state.edgesOccupiedBy[edgeId] = road.playerId;

    const playerIndex = this.state.players.findIndex(p => p.id === road.playerId);
    if (playerIndex !== -1) {
      this.state.players[playerIndex] = {
        ...this.state.players[playerIndex],
        roadCount: this.state.players[playerIndex].roadCount + 1
      };
    }

    return this.getState();
  }

  updatePlayer(playerId: string, updates: Partial<Player>): GameState {
    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex !== -1) {
      this.state.players[playerIndex] = {
        ...this.state.players[playerIndex],
        ...updates
      };
    }
    return this.getState();
  }

  getCurrentPlayer(): Player | null {
    return this.state.players.find(p => p.id === this.state.currentPlayer) || null;
  }

  getPlayerById(playerId: string): Player | null {
    return this.state.players.find(p => p.id === playerId) || null;
  }

  setTurnStep(step: TurnState['step']): GameState {
    this.state.turnState.step = step;
    return this.getState();
  }

  setTurnLock(locked: boolean): GameState {
    this.state.turnState.lock = locked;
    return this.getState();
  }

  addLogEntry(message: string): GameState {
    const timestamp = new Date().toLocaleTimeString();
    this.state.gameLog.push({ message, timestamp });
    return this.getState();
  }

  drawDevCard(playerId: string, currentTurn: number): { card: DevelopmentCard | null; state: GameState } {
    if (this.state.developmentCardDeck.length === 0) {
      return { card: null, state: this.getState() };
    }

    const [drawnCard, ...remainingDeck] = this.state.developmentCardDeck;
    const updatedCard: DevelopmentCard = {
      ...drawnCard,
      location: 'hand',
      ownerId: playerId,
      turnDrawn: currentTurn
    };

    this.state.developmentCardDeck = remainingDeck;

    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex !== -1) {
      this.state.players[playerIndex].developmentCardsInHand.push(updatedCard);
      this.state.players[playerIndex].developmentCards = this.state.players[playerIndex].developmentCardsInHand.length;

      if (updatedCard.name === 'Extra Point') {
        this.state.players[playerIndex].secretPoints += 1;
        this.state.players[playerIndex].score += 1;
      }
    }

    return { card: updatedCard, state: this.getState() };
  }

  playDevCard(playerId: string, cardId: string): { success: boolean; card?: DevelopmentCard; state: GameState } {
    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      return { success: false, state: this.getState() };
    }

    const player = this.state.players[playerIndex];
    const cardIndex = player.developmentCardsInHand.findIndex(c => c.id === cardId);

    if (cardIndex === -1) {
      return { success: false, state: this.getState() };
    }

    const card = player.developmentCardsInHand[cardIndex];
    player.developmentCardsInHand.splice(cardIndex, 1);
    player.developmentCards = player.developmentCardsInHand.length;

    const playedCard: DevelopmentCard = { ...card, location: 'played' };

    if (card.name === 'Guard') {
      player.armyCount += 1;
    } else {
      playedCard.location = 'discard';
      this.state.developmentCardDiscard.push(playedCard);
    }

    return { success: true, card: playedCard, state: this.getState() };
  }

  addResources(playerId: string, resources: Partial<Resources>): GameState {
    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex !== -1) {
      const player = this.state.players[playerIndex];
      const clay = (resources.clay || 0);
      const lumber = (resources.lumber || 0);
      const grain = (resources.grain || 0);
      const fabric = (resources.fabric || 0);
      const mineral = (resources.mineral || 0);
      const total = clay + lumber + grain + fabric + mineral;

      this.state.players[playerIndex].resources = {
        clay: player.resources.clay + clay,
        lumber: player.resources.lumber + lumber,
        grain: player.resources.grain + grain,
        fabric: player.resources.fabric + fabric,
        mineral: player.resources.mineral + mineral,
        total: player.resources.total + total
      };
    }
    return this.getState();
  }

  removeResources(playerId: string, resources: Partial<Resources>): GameState {
    const playerIndex = this.state.players.findIndex(p => p.id === playerId);
    if (playerIndex !== -1) {
      const player = this.state.players[playerIndex];
      const clay = (resources.clay || 0);
      const lumber = (resources.lumber || 0);
      const grain = (resources.grain || 0);
      const fabric = (resources.fabric || 0);
      const mineral = (resources.mineral || 0);
      const total = clay + lumber + grain + fabric + mineral;

      this.state.players[playerIndex].resources = {
        clay: Math.max(0, player.resources.clay - clay),
        lumber: Math.max(0, player.resources.lumber - lumber),
        grain: Math.max(0, player.resources.grain - grain),
        fabric: Math.max(0, player.resources.fabric - fabric),
        mineral: Math.max(0, player.resources.mineral - mineral),
        total: Math.max(0, player.resources.total - total)
      };
    }
    return this.getState();
  }

  upgradeVillageToCity(villageId: string): GameState {
    const villageIndex = this.state.villages.findIndex(v => v.id === villageId);
    if (villageIndex === -1) {
      return this.getState();
    }

    const village = this.state.villages[villageIndex];
    if (village.type === 'city') {
      return this.getState();
    }

    this.state.villages[villageIndex] = { ...village, type: 'city' };

    const playerIndex = this.state.players.findIndex(p => p.id === village.playerId);
    if (playerIndex !== -1) {
      this.state.players[playerIndex].villageCount -= 1;
      this.state.players[playerIndex].cityCount += 1;
      this.state.players[playerIndex].score += 1;
    }

    return this.getState();
  }

  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

export function createInitialGameState(
  players: Player[],
  boardSize: BoardSize,
  gameSettings: GameSettings,
  boardGraph: GameState['boardGraph']
): GameState {
  const firstPlayer = players.find(p => p.order === 1);

  return {
    currentPlayer: firstPlayer?.id || players[0]?.id || '',
    currentStep: 'setup-phase-1',
    turn: 1,
    phase: 'setup-phase-1',
    players,
    gameLog: [],
    gameSettings,
    stepHistory: [],
    villages: [],
    roads: [],
    longestRoadLengths: new Map(),
    adjacentVertices: [],
    lastPlacedVillage: null,
    totalVertices: Object.keys(boardGraph.vertices).length,
    turnState: {
      currentPlayerId: firstPlayer?.id || players[0]?.id || '',
      step: 'init_place_village',
      placementContext: {
        lastVillageVertex: null
      },
      lock: false
    },
    boardGraph,
    verticesOccupiedBy: {},
    edgesOccupiedBy: {},
    developmentCardDeck: [],
    developmentCardDiscard: []
  };
}
