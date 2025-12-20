import { AICharacter } from '../data/aiCharacters';

export interface GameStep {
  id: string;
  name: string;
  description: string;
  playerAction?: boolean;
  autoExecute?: boolean;
  nextStep?: string;
}

export interface StepHistory {
  playerId: string;
  stepId: string;
  timestamp: number;
  data?: any;
}

export interface StepTrigger {
  stepId: string;
  playerId: string;
  data?: any;
}

export interface TradingPort {
  id: string;
  type: 'generic' | 'clay' | 'lumber' | 'grain' | 'fabric' | 'mineral';
  vertices: number[];
  position: { x: number; y: number };
}

export type CardLocation = 'deck' | 'hand' | 'played' | 'discard';

export interface DevelopmentCard {
  id: string;
  name: string;
  deckAffiliation: 'standard' | 'expanded';
  playStyle: string;
  rules: string;
  description: string;
  imageUrl: string;
  location: CardLocation;
  ownerId?: string;
  turnDrawn?: number;
}

export interface GameSettings {
  boardSize: 'tiny' | 'small' | 'standard' | 'large' | 'huge';
  pointsToWin: number;
  longestRoadEnabled: boolean;
  longestRoadSize: number;
  longestRoadBonus: number;
  largestArmyEnabled: boolean;
  largestArmySize: number;
  largestArmyBonus: number;
  maxResourceHold: number;
  robberCanReturnToDesert: boolean;
  tradingPortsEnabled: boolean;
  numberOfTradingPorts: number;
  developmentCardDeck: 'standard' | 'expanded';
  testingMode: boolean;
}

export type TurnStep = 'init_place_village' | 'init_place_road' | 'awaiting_dice_roll' | 'awaiting_discard' | 'move_robber' | 'play_dev_cards' | 'main' | 'buy_item' | 'place_road_gameplay' | 'place_village_gameplay' | 'place_estate_gameplay' | 'booming_economy_selection' | 'closed_market_selection' | 'resource_swap_selection' | 'free_upgrade_selection';

export interface DiscardSelection {
  clay: number;
  lumber: number;
  grain: number;
  fabric: number;
  mineral: number;
}

export interface DiscardState {
  playersNeedingDiscard: string[];
  currentDiscardIndex: number;
  isProcessing: boolean;
}

export interface TradeProposal {
  proposingPlayerId: string;
  offeredResources: { clay: number; lumber: number; grain: number; fabric: number; mineral: number };
  requestedResources: { clay: number; lumber: number; grain: number; fabric: number; mineral: number };
  respondingPlayers: string[];
  responses: Record<string, 'accepted' | 'rejected' | 'pending'>;
  proposerIsAI?: boolean;
  currentRespondingPlayerIndex: number;
  respondingPlayerOrder: string[];
}

export interface TurnState {
  currentPlayerId: string;
  step: TurnStep;
  placementContext: {
    lastVillageVertex: number | null;
    buildingType?: 'road' | 'village' | 'estate' | null;
    freeRoadsRemaining?: number;
    resourcesSelected?: string[];
    pendingCardId?: string;
  };
  lock: boolean;
  tradeProposal?: TradeProposal;
  expertNegotiatorActive?: boolean;
  aiTradeAttemptsThisTurn?: number;
  aiFailedTradeProposalsThisTurn?: Set<string>;
}

export interface Edge {
  id: string;
  v1: number;
  v2: number;
  occupiedBy: string | null;
  kind: 'land' | 'sea';
}

export interface Vertex {
  id: number;
  occupiedBy: string | null;
  neighbors: number[];
}

export interface Resources {
  clay: number;
  lumber: number;
  grain: number;
  fabric: number;
  mineral: number;
  total: number;
}

export interface Village {
  id: string;
  playerId: string;
  vertexId: number;
  type: 'settlement' | 'city';
}

export interface Road {
  id: string;
  playerId: string;
  from: number;
  to: number;
}

export interface Player {
  id: string;
  name: string;
  isHuman: boolean;
  color: string;
  isActive: boolean;
  resources: Resources;
  developmentCards: number;
  developmentCardsInHand: DevelopmentCard[];
  armyCount: number;
  secretPoints: number;
  score: number;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
  character?: AICharacter;
  order: number;
  difficulty?: 'easy' | 'normal' | 'hard';
  currentTurn: number;
  villageCount: number;
  cityCount: number;
  roadCount: number;
  hasPlacedVillage: boolean;
  hasPlacedRoad: boolean;
  guardsPlayedThisTurn: number;
}

export interface GameState {
  currentPlayer: string;
  currentStep: string;
  turn: number;
  phase: 'setup' | 'setup-phase-1' | 'setup-phase-2' | 'playing' | 'ended';
  players: Player[];
  gameLog: Array<{ message: string; timestamp: string }>;
  robberPosition?: number;
  gameSettings: GameSettings;
  stepHistory: StepHistory[];
  villages: Village[];
  roads: Road[];
  longestRoadLengths: Map<string, number>;
  adjacentVertices: number[];
  lastPlacedVillage: number | null;
  totalVertices: number;
  turnState: TurnState;
  boardGraph: {
    edges: Record<string, Edge>;
    vertices: Record<number, Vertex>;
    edgesByVertex: Record<number, string[]>;
  };
  verticesOccupiedBy: Record<number, string | null>;
  edgesOccupiedBy: Record<string, string | null>;
  developmentCardDeck: DevelopmentCard[];
  developmentCardDiscard: DevelopmentCard[];
  tradingPorts?: TradingPort[];
}