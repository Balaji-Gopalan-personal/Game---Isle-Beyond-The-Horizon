/*
  # AI Analytics Schema

  ## Summary
  Creates tables to track AI performance and game analytics for the Settlers game.

  ## New Tables
  
  ### `game_sessions`
  - `id` (uuid, primary key) - Unique game session identifier
  - `board_size` (text) - Size of the board (tiny, small, standard, large, huge)
  - `player_count` (integer) - Number of players in the game
  - `winner_id` (text) - ID of the winning player
  - `winner_is_ai` (boolean) - Whether winner was AI
  - `total_turns` (integer) - Total number of turns in the game
  - `game_duration` (integer) - Duration in seconds
  - `points_to_win` (integer) - Victory point target
  - `created_at` (timestamptz) - When game started
  - `ended_at` (timestamptz) - When game ended

  ### `ai_player_performance`
  - `id` (uuid, primary key) - Unique record identifier
  - `game_session_id` (uuid, foreign key) - Reference to game session
  - `player_id` (text) - Player identifier
  - `difficulty` (text) - AI difficulty level
  - `final_score` (integer) - Final score achieved
  - `final_position` (integer) - Placement (1st, 2nd, etc)
  - `villages_built` (integer) - Number of villages built
  - `cities_built` (integer) - Number of cities built
  - `roads_built` (integer) - Number of roads built
  - `dev_cards_bought` (integer) - Development cards purchased
  - `dev_cards_played` (integer) - Development cards played
  - `trades_completed` (integer) - Successful trades
  - `resources_gained` (integer) - Total resources collected
  - `created_at` (timestamptz) - Record creation time

  ### `ai_decisions`
  - `id` (uuid, primary key) - Unique decision identifier
  - `game_session_id` (uuid, foreign key) - Reference to game session
  - `player_id` (text) - Player who made decision
  - `turn_number` (integer) - Turn when decision was made
  - `decision_type` (text) - Type of decision (setup, build, trade, robber, etc)
  - `decision_data` (jsonb) - Decision details
  - `evaluation_score` (numeric) - Score of the decision
  - `execution_time_ms` (numeric) - Time taken to make decision
  - `created_at` (timestamptz) - When decision was made

  ## Security
  - Enable RLS on all tables
  - Public read access for analytics
  - No delete operations allowed
*/

-- Create game_sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_size text NOT NULL,
  player_count integer NOT NULL,
  winner_id text,
  winner_is_ai boolean DEFAULT false,
  total_turns integer DEFAULT 0,
  game_duration integer DEFAULT 0,
  points_to_win integer DEFAULT 10,
  created_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to game sessions"
  ON game_sessions FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert of game sessions"
  ON game_sessions FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update of game sessions"
  ON game_sessions FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- Create ai_player_performance table
CREATE TABLE IF NOT EXISTS ai_player_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  difficulty text NOT NULL,
  final_score integer DEFAULT 0,
  final_position integer DEFAULT 0,
  villages_built integer DEFAULT 0,
  cities_built integer DEFAULT 0,
  roads_built integer DEFAULT 0,
  dev_cards_bought integer DEFAULT 0,
  dev_cards_played integer DEFAULT 0,
  trades_completed integer DEFAULT 0,
  resources_gained integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_player_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to ai performance"
  ON ai_player_performance FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert of ai performance"
  ON ai_player_performance FOR INSERT
  TO public
  WITH CHECK (true);

-- Create ai_decisions table
CREATE TABLE IF NOT EXISTS ai_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id uuid REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  turn_number integer NOT NULL,
  decision_type text NOT NULL,
  decision_data jsonb DEFAULT '{}'::jsonb,
  evaluation_score numeric DEFAULT 0,
  execution_time_ms numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to ai decisions"
  ON ai_decisions FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert of ai decisions"
  ON ai_decisions FOR INSERT
  TO public
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_game_sessions_created_at ON game_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_performance_game_session ON ai_player_performance(game_session_id);
CREATE INDEX IF NOT EXISTS idx_ai_performance_difficulty ON ai_player_performance(difficulty);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_game_session ON ai_decisions(game_session_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_player ON ai_decisions(player_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_type ON ai_decisions(decision_type);
