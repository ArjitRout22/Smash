-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "lockedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TeamPairingChange" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "tournamentId" TEXT,
    "removedPlayerId" TEXT,
    "addedPlayerId" TEXT,
    "playersBefore" JSONB NOT NULL,
    "playersAfter" JSONB NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamPairingChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipantPlayer" (
    "id" TEXT NOT NULL,
    "matchParticipantId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "position" INTEGER,

    CONSTRAINT "MatchParticipantPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamPairingChange_teamId_idx" ON "TeamPairingChange"("teamId");

-- CreateIndex
CREATE INDEX "MatchParticipantPlayer_matchParticipantId_idx" ON "MatchParticipantPlayer"("matchParticipantId");

-- CreateIndex
CREATE INDEX "MatchParticipantPlayer_playerId_idx" ON "MatchParticipantPlayer"("playerId");

-- AddForeignKey
ALTER TABLE "TeamPairingChange" ADD CONSTRAINT "TeamPairingChange_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipantPlayer" ADD CONSTRAINT "MatchParticipantPlayer_matchParticipantId_fkey" FOREIGN KEY ("matchParticipantId") REFERENCES "MatchParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipantPlayer" ADD CONSTRAINT "MatchParticipantPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: existing DOUBLES match participants get a snapshot of their team's
-- current members (no pair change has happened yet, so current == who played).
INSERT INTO "MatchParticipantPlayer" ("id", "matchParticipantId", "playerId", "displayName", "position")
SELECT gen_random_uuid(), mp."id", tp."playerId", p."displayName", tp."position"
FROM "MatchParticipant" mp
JOIN "TeamPlayer" tp ON tp."teamId" = mp."teamId" AND tp."status" = 'active'
JOIN "Player" p ON p."id" = tp."playerId"
WHERE mp."teamId" IS NOT NULL;
