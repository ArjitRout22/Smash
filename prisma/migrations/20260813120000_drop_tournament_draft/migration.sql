-- Tournaments no longer have a "draft" stage. New default is "upcoming";
-- migrate any existing draft rows forward.
ALTER TABLE "Tournament" ALTER COLUMN "status" SET DEFAULT 'upcoming';
UPDATE "Tournament" SET "status" = 'upcoming' WHERE "status" = 'draft';
