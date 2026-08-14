-- AlterTable
ALTER TABLE "MatchParticipant" ADD COLUMN     "teamName" TEXT;

-- Backfill the point-in-time team-name snapshot from each team's current name so
-- existing matches keep a stable name even after a later rename.
UPDATE "MatchParticipant" mp
SET "teamName" = t."name"
FROM "Team" t
WHERE mp."teamId" = t."id" AND mp."teamName" IS NULL;
