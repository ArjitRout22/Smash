-- CreateTable
CREATE TABLE "TournamentScorer" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentScorer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentScorer_userId_idx" ON "TournamentScorer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentScorer_tournamentId_userId_key" ON "TournamentScorer"("tournamentId", "userId");

-- AddForeignKey
ALTER TABLE "TournamentScorer" ADD CONSTRAINT "TournamentScorer_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentScorer" ADD CONSTRAINT "TournamentScorer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

