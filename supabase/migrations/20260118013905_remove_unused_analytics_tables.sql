/*
  # Remove Unused Analytics Tables

  ## Summary
  Removes the analytics tables that were created but never integrated into the game.
  This addresses multiple security issues:
  - Unused indexes causing overhead
  - RLS policies with `USING (true)` that bypass security
  - Tables that are not being used in the application

  ## Tables Removed
  - `ai_decisions` - AI decision logging (unused)
  - `ai_player_performance` - AI performance metrics (unused)
  - `game_sessions` - Game session tracking (unused)

  ## Rationale
  The analytics system was scaffolded but never integrated into the game loop.
  If analytics are needed in the future, they should be reimplemented with:
  - Proper rate limiting via Edge Functions
  - Server-side validation
  - Restrictive RLS policies or service role access only
*/

-- Drop tables (CASCADE will remove foreign keys and indexes automatically)
DROP TABLE IF EXISTS ai_decisions CASCADE;
DROP TABLE IF EXISTS ai_player_performance CASCADE;
DROP TABLE IF EXISTS game_sessions CASCADE;
