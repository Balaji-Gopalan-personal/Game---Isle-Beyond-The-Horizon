import { GameState, Player } from '../types/game';
import { BoardSize } from '../data/boardConfigs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase credentials not found. Analytics disabled.');
    return null;
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
    return supabaseClient;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    return null;
  }
}

export interface GameSessionData {
  boardSize: BoardSize;
  playerCount: number;
  winnerId?: string;
  winnerIsAI?: boolean;
  totalTurns: number;
  gameDuration: number;
  pointsToWin: number;
}

export interface AIPerformanceData {
  gameSessionId: string;
  playerId: string;
  difficulty: string;
  finalScore: number;
  finalPosition: number;
  villagesBuilt: number;
  citiesBuilt: number;
  roadsBuilt: number;
  devCardsBought: number;
  devCardsPlayed: number;
  tradesCompleted: number;
  resourcesGained: number;
}

export interface AIDecisionData {
  gameSessionId: string;
  playerId: string;
  turnNumber: number;
  decisionType: string;
  decisionData: any;
  evaluationScore: number;
  executionTimeMs: number;
}

export async function createGameSession(data: GameSessionData): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: session, error } = await client
      .from('game_sessions')
      .insert({
        board_size: data.boardSize,
        player_count: data.playerCount,
        total_turns: data.totalTurns,
        game_duration: data.gameDuration,
        points_to_win: data.pointsToWin,
        winner_id: data.winnerId,
        winner_is_ai: data.winnerIsAI,
        ended_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error creating game session:', error);
      return null;
    }

    return session.id;
  } catch (error) {
    console.error('Exception creating game session:', error);
    return null;
  }
}

export async function logAIPerformance(data: AIPerformanceData): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('ai_player_performance')
      .insert({
        game_session_id: data.gameSessionId,
        player_id: data.playerId,
        difficulty: data.difficulty,
        final_score: data.finalScore,
        final_position: data.finalPosition,
        villages_built: data.villagesBuilt,
        cities_built: data.citiesBuilt,
        roads_built: data.roadsBuilt,
        dev_cards_bought: data.devCardsBought,
        dev_cards_played: data.devCardsPlayed,
        trades_completed: data.tradesCompleted,
        resources_gained: data.resourcesGained
      });

    if (error) {
      console.error('Error logging AI performance:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Exception logging AI performance:', error);
    return false;
  }
}

export async function logAIDecision(data: AIDecisionData): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const { error } = await client
      .from('ai_decisions')
      .insert({
        game_session_id: data.gameSessionId,
        player_id: data.playerId,
        turn_number: data.turnNumber,
        decision_type: data.decisionType,
        decision_data: data.decisionData,
        evaluation_score: data.evaluationScore,
        execution_time_ms: data.executionTimeMs
      });

    if (error) {
      console.error('Error logging AI decision:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Exception logging AI decision:', error);
    return false;
  }
}

export async function getAIPerformanceStats(difficulty?: string): Promise<any> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    let query = client
      .from('ai_player_performance')
      .select('*');

    if (difficulty) {
      query = query.eq('difficulty', difficulty);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching AI performance stats:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception fetching AI performance stats:', error);
    return null;
  }
}

export function extractPlayerPerformance(player: Player, gameState: GameState): Omit<AIPerformanceData, 'gameSessionId' | 'finalPosition'> {
  const villagesBuilt = gameState.villages.filter(v => v.playerId === player.id && v.type === 'settlement').length;
  const citiesBuilt = gameState.villages.filter(v => v.playerId === player.id && v.type === 'city').length;
  const roadsBuilt = gameState.roads.filter(r => r.playerId === player.id).length;

  return {
    playerId: player.id,
    difficulty: player.difficulty || 'normal',
    finalScore: player.score + player.secretPoints,
    villagesBuilt,
    citiesBuilt,
    roadsBuilt,
    devCardsBought: player.developmentCards,
    devCardsPlayed: 0,
    tradesCompleted: 0,
    resourcesGained: 0
  };
}

export async function finalizeGameSession(gameState: GameState, boardSize: BoardSize, gameStartTime: number): Promise<void> {
  const winner = gameState.players.reduce((prev, current) => {
    const prevScore = prev.score + prev.secretPoints;
    const currentScore = current.score + current.secretPoints;
    return currentScore > prevScore ? current : prev;
  });

  const gameDuration = Math.floor((Date.now() - gameStartTime) / 1000);

  const sessionId = await createGameSession({
    boardSize,
    playerCount: gameState.players.length,
    winnerId: winner.id,
    winnerIsAI: !winner.isHuman,
    totalTurns: gameState.turn,
    gameDuration,
    pointsToWin: gameState.gameSettings.pointsToWin
  });

  if (sessionId) {
    const sortedPlayers = [...gameState.players].sort((a, b) => {
      const scoreA = a.score + a.secretPoints;
      const scoreB = b.score + b.secretPoints;
      return scoreB - scoreA;
    });

    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      if (!player.isHuman) {
        const perfData = extractPlayerPerformance(player, gameState);
        await logAIPerformance({
          ...perfData,
          gameSessionId: sessionId,
          finalPosition: i + 1
        });
      }
    }
  }
}
