-- CreateTable
CREATE TABLE "CasualMatch" (
    "id" TEXT NOT NULL,
    "challengerUserId" TEXT NOT NULL,
    "challengerPlayerId" TEXT NOT NULL,
    "opponentUserId" TEXT NOT NULL,
    "opponentPlayerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "bestOf" INTEGER NOT NULL DEFAULT 3,
    "scheduledAt" TIMESTAMP(3),
    "location" TEXT,
    "games" JSONB,
    "winnerSide" TEXT,
    "winnerPlayerId" TEXT,
    "reportedByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CasualMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CasualMatch_challengerUserId_idx" ON "CasualMatch"("challengerUserId");

-- CreateIndex
CREATE INDEX "CasualMatch_opponentUserId_idx" ON "CasualMatch"("opponentUserId");

-- CreateIndex
CREATE INDEX "CasualMatch_status_idx" ON "CasualMatch"("status");

-- AddForeignKey
ALTER TABLE "CasualMatch" ADD CONSTRAINT "CasualMatch_challengerUserId_fkey" FOREIGN KEY ("challengerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasualMatch" ADD CONSTRAINT "CasualMatch_opponentUserId_fkey" FOREIGN KEY ("opponentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasualMatch" ADD CONSTRAINT "CasualMatch_challengerPlayerId_fkey" FOREIGN KEY ("challengerPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasualMatch" ADD CONSTRAINT "CasualMatch_opponentPlayerId_fkey" FOREIGN KEY ("opponentPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

