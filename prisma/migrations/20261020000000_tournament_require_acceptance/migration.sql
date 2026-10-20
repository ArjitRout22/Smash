-- Add an opt-out of the accept-before-play requirement. Defaults to true so every
-- existing tournament keeps today's behaviour (only accepted players are eligible).
ALTER TABLE "Tournament" ADD COLUMN "requireAcceptance" BOOLEAN NOT NULL DEFAULT true;
