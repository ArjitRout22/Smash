-- Creator/admin can pause new join requests on a public tournament while it's still
-- upcoming (e.g. "we have enough players"). Existing rows default to open.
ALTER TABLE "Tournament" ADD COLUMN "joinRequestsOpen" BOOLEAN NOT NULL DEFAULT true;
