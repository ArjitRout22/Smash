-- Cosmetic live running score for the spectator view (not the finalized result).
ALTER TABLE "Match" ADD COLUMN "liveA" INTEGER;
ALTER TABLE "Match" ADD COLUMN "liveB" INTEGER;
