-- Record when a user accepted the Terms (incl. name/results marketing use) at signup.
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
