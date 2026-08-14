-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "discoverable" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PlayRequest" (
    "id" TEXT NOT NULL,
    "fromPlayerId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toPlayerId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "PlayRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayRequest_toUserId_status_idx" ON "PlayRequest"("toUserId", "status");

-- CreateIndex
CREATE INDEX "PlayRequest_fromUserId_status_idx" ON "PlayRequest"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "Player_discoverable_idx" ON "Player"("discoverable");

-- AddForeignKey
ALTER TABLE "PlayRequest" ADD CONSTRAINT "PlayRequest_fromPlayerId_fkey" FOREIGN KEY ("fromPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayRequest" ADD CONSTRAINT "PlayRequest_toPlayerId_fkey" FOREIGN KEY ("toPlayerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
