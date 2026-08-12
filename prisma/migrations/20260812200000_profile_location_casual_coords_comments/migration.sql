-- Player: self-declared home location (OpenStreetMap place name + coordinates).
ALTER TABLE "Player" ADD COLUMN "locationName" TEXT;
ALTER TABLE "Player" ADD COLUMN "locationLat" DOUBLE PRECISION;
ALTER TABLE "Player" ADD COLUMN "locationLng" DOUBLE PRECISION;

-- CasualMatch: map coordinates for the (optional) location.
ALTER TABLE "CasualMatch" ADD COLUMN "locationLat" DOUBLE PRECISION;
ALTER TABLE "CasualMatch" ADD COLUMN "locationLng" DOUBLE PRECISION;

-- Polymorphic comment thread for tournament matches + casual matches.
CREATE TABLE "MatchComment" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "MatchComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MatchComment_entityType_entityId_idx" ON "MatchComment"("entityType", "entityId");
CREATE INDEX "MatchComment_authorUserId_idx" ON "MatchComment"("authorUserId");

ALTER TABLE "MatchComment" ADD CONSTRAINT "MatchComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
