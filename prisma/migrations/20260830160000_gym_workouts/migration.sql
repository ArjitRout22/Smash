-- Gym / fitness logging. Workouts are immutable (no edit, no backdating); the
-- owner can delete their own. Fully separate from badminton rating.

ALTER TABLE "User" ADD COLUMN "gymOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "gymWeeklyGoal" INTEGER;
CREATE INDEX "User_gymOptIn_idx" ON "User"("gymOptIn");

CREATE TYPE "WorkoutKind" AS ENUM ('treadmill', 'strength', 'freeform');

CREATE TABLE "Workout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerId" TEXT,
    "kind" "WorkoutKind" NOT NULL,
    "day" DATE NOT NULL,
    "durationMin" INTEGER,
    "distanceKm" DOUBLE PRECISION,
    "speedKmh" DOUBLE PRECISION,
    "inclineLevel" DOUBLE PRECISION,
    "exercise" TEXT,
    "sets" INTEGER,
    "reps" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Workout_userId_day_idx" ON "Workout"("userId", "day");
CREATE INDEX "Workout_day_idx" ON "Workout"("day");

ALTER TABLE "Workout" ADD CONSTRAINT "Workout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
