-- Player.invitedEmail: dedupe/claim key for managed players pre-created by email.
ALTER TABLE "Player" ADD COLUMN "invitedEmail" TEXT;
CREATE UNIQUE INDEX "Player_invitedEmail_key" ON "Player"("invitedEmail");
