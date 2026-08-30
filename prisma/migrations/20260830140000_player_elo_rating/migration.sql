-- Opponent-relative Elo rating for the global player ranking. Everyone starts at
-- 1000; the value is recomputed by replaying completed matches chronologically.
ALTER TABLE "PlayerRanking" ADD COLUMN "eloRating" INTEGER NOT NULL DEFAULT 1000;

CREATE INDEX "PlayerRanking_eloRating_idx" ON "PlayerRanking"("eloRating");
