-- =============================================================================
-- Smash — Item 6: FULL STATS RESET (clean slate) + hard-delete test accounts
-- =============================================================================
-- Run this against the PRODUCTION Neon database. It is DESTRUCTIVE and cannot be
-- undone once committed. It:
--   1. wipes ALL matches, casual matches, the point ledger, and every derived
--      stats cache (leaderboards + rankings) + all match comments  → clean slate;
--   2. removes tournaments that were created/organized by throwaway test accounts;
--   3. HARD-DELETES the throwaway test accounts (users + linked players).
-- Real users, real players and real tournaments are preserved (their stats simply
-- reset to zero and rebuild as new scores are entered).
--
-- HOW TO RUN (Neon SQL editor or psql):
--   Run the whole block. It executes inside ONE transaction and prints NOTICE
--   counts before and after. Review them, then run  COMMIT;  to apply — or
--   ROLLBACK;  to abort with nothing changed.
--
--   zsh users on the CLI: quote the URL —
--     psql "postgresql://…?sslmode=require" -f scripts/cleanup_reset_stats.sql
-- -----------------------------------------------------------------------------

BEGIN;

-- Throwaway test accounts. EDIT these patterns to match your test data.
CREATE TEMP TABLE _test_users ON COMMIT DROP AS
  SELECT id, "playerId"
  FROM "User"
  WHERE email LIKE '%@t.test'
     OR email LIKE 'hero-%'
     OR email LIKE 'probe-%'
     OR email LIKE 'deploy-check-%';

CREATE TEMP TABLE _test_players ON COMMIT DROP AS
  SELECT "playerId" AS id FROM _test_users WHERE "playerId" IS NOT NULL;

-- Tournaments owned/created by a test account (removed with the accounts).
CREATE TEMP TABLE _test_tournaments ON COMMIT DROP AS
  SELECT id FROM "Tournament"
  WHERE "createdById" IN (SELECT id FROM _test_users)
     OR "organizerId" IN (SELECT id FROM _test_users);

-- ---- Preview (before) -------------------------------------------------------
DO $$
DECLARE u int; p int; t int; m int; c int;
BEGIN
  SELECT count(*) INTO u FROM _test_users;
  SELECT count(*) INTO p FROM _test_players;
  SELECT count(*) INTO t FROM _test_tournaments;
  SELECT count(*) INTO m FROM "Match";
  SELECT count(*) INTO c FROM "CasualMatch";
  RAISE NOTICE 'BEFORE  test_users=%  test_players=%  test_tournaments=%  ALL_matches=%  ALL_casual=%', u, p, t, m, c;
END $$;

-- ---- 1) Full stats reset (clean slate) -------------------------------------
DELETE FROM "MatchComment";              -- comments on tournament + casual matches
DELETE FROM "PointTransaction";          -- append-only ledger (source of truth)
DELETE FROM "LeaderboardEntry";          -- per-tournament standings cache
DELETE FROM "PlayerRanking";             -- global rankings cache
UPDATE "Match" SET "nextMatchId" = NULL; -- drop bracket self-references first
DELETE FROM "Game";                      -- (also cascades from Match)
DELETE FROM "MatchParticipant";          -- (also cascades from Match)
DELETE FROM "Match";
DELETE FROM "CasualMatch";

-- ---- 2) Remove test-account tournaments ------------------------------------
-- Cascades their stages / teams / tournamentPlayers (matches already gone).
DELETE FROM "Tournament" WHERE id IN (SELECT id FROM _test_tournaments);

-- ---- 3) Hard-delete the test accounts --------------------------------------
-- Users first (User holds the FK to Player). Sessions + tokens cascade.
-- AuditLog.actorUserId is ON DELETE SET NULL, so audit history is kept (actorless).
DELETE FROM "User"   WHERE id IN (SELECT id FROM _test_users);
DELETE FROM "Player" WHERE id IN (SELECT id FROM _test_players);

-- ---- Verify (after) ---------------------------------------------------------
DO $$
DECLARE m int; c int; pt int; le int; pr int; u int;
BEGIN
  SELECT count(*) INTO m  FROM "Match";
  SELECT count(*) INTO c  FROM "CasualMatch";
  SELECT count(*) INTO pt FROM "PointTransaction";
  SELECT count(*) INTO le FROM "LeaderboardEntry";
  SELECT count(*) INTO pr FROM "PlayerRanking";
  SELECT count(*) INTO u  FROM "User"
    WHERE email LIKE '%@t.test' OR email LIKE 'hero-%'
       OR email LIKE 'probe-%'  OR email LIKE 'deploy-check-%';
  RAISE NOTICE 'AFTER   matches=%  casual=%  ledger=%  leaderboard=%  rankings=%  remaining_test_users=%', m, c, pt, le, pr, u;
END $$;

-- Review the two NOTICE lines above. If they look right:
--     COMMIT;
-- If anything is off:
--     ROLLBACK;
-- (Left uncommitted on purpose — decide explicitly.)
