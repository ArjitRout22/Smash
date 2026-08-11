-- AlterTable
ALTER TABLE "CasualMatch" ADD COLUMN     "challengerPartnerPlayerId" TEXT,
ADD COLUMN     "challengerPartnerUserId" TEXT,
ADD COLUMN     "matchType" TEXT NOT NULL DEFAULT 'singles',
ADD COLUMN     "opponentPartnerPlayerId" TEXT,
ADD COLUMN     "opponentPartnerUserId" TEXT;

-- AddForeignKey
ALTER TABLE "CasualMatch" ADD CONSTRAINT "CasualMatch_challengerPartnerPlayerId_fkey" FOREIGN KEY ("challengerPartnerPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CasualMatch" ADD CONSTRAINT "CasualMatch_opponentPartnerPlayerId_fkey" FOREIGN KEY ("opponentPartnerPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

