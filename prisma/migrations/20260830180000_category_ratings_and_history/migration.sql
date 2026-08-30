-- Per-category Elo ratings (singles vs doubles, never mixed) + a full rating
-- history / audit trail. The RatingHistory unique key also enforces idempotency
-- (a match can never update a player's rating twice).

CREATE TABLE "PlayerCategoryRating" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "matches" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "lastChange" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerCategoryRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerCategoryRating_playerId_category_key" ON "PlayerCategoryRating"("playerId", "category");
CREATE INDEX "PlayerCategoryRating_category_rating_idx" ON "PlayerCategoryRating"("category", "rating");

ALTER TABLE "PlayerCategoryRating" ADD CONSTRAINT "PlayerCategoryRating_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RatingHistory" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "ratingBefore" INTEGER NOT NULL,
    "teamRatingBefore" INTEGER NOT NULL,
    "opponentRatingBefore" INTEGER NOT NULL,
    "expectedScore" DOUBLE PRECISION NOT NULL,
    "actualScore" DOUBLE PRECISION NOT NULL,
    "k" INTEGER NOT NULL,
    "ratingChange" INTEGER NOT NULL,
    "ratingAfter" INTEGER NOT NULL,
    "matchesBefore" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RatingHistory_matchId_playerId_category_key" ON "RatingHistory"("matchId", "playerId", "category");
CREATE INDEX "RatingHistory_playerId_category_playedAt_idx" ON "RatingHistory"("playerId", "category", "playedAt");
CREATE INDEX "RatingHistory_matchId_idx" ON "RatingHistory"("matchId");

ALTER TABLE "RatingHistory" ADD CONSTRAINT "RatingHistory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
