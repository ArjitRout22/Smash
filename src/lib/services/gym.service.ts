import type { Prisma, WorkoutKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { Errors } from "@/lib/errors";
import { audit } from "@/lib/audit";
import type { AuthUser } from "@/lib/auth/authorize";
import type { Pagination } from "@/lib/api/pagination";
import { skipTake } from "@/lib/api/pagination";
import { computeGymStats, computeBadges, compareConsistency, dayKey } from "@/lib/engines/gym";

/** Today as a YYYY-MM-DD key + a midnight-UTC Date for the `day` column. */
function today(): { key: string; date: Date } {
  const key = new Date().toISOString().slice(0, 10);
  return { key, date: new Date(key + "T00:00:00Z") };
}

const firstName = (name?: string | null) => (name?.trim().split(/\s+/)[0] ?? "Player") || "Player";

export type LogWorkoutInput = {
  kind: WorkoutKind;
  durationMin?: number;
  distanceKm?: number;
  speedKmh?: number;
  inclineLevel?: number;
  exercise?: string;
  sets?: number;
  reps?: number;
  weightKg?: number;
  notes?: string;
};

function serializeWorkout(w: {
  id: string; kind: WorkoutKind; day: Date; durationMin: number | null; distanceKm: number | null;
  speedKmh: number | null; inclineLevel: number | null; exercise: string | null; sets: number | null;
  reps: number | null; weightKg: number | null; notes: string | null; createdAt: Date;
}) {
  return {
    id: w.id,
    kind: w.kind,
    day: dayKey(w.day),
    durationMin: w.durationMin,
    distanceKm: w.distanceKm,
    speedKmh: w.speedKmh,
    inclineLevel: w.inclineLevel,
    exercise: w.exercise,
    sets: w.sets,
    reps: w.reps,
    weightKg: w.weightKg,
    notes: w.notes,
    createdAt: w.createdAt.toISOString(),
  };
}

/**
 * Log a workout for TODAY. Immutable and not backdated (there's no edit and no
 * date input by design) — the owner can delete an entry and re-log if needed.
 */
export async function logWorkout(actor: AuthUser, input: LogWorkoutInput) {
  // Light per-kind validation so an entry always carries something meaningful.
  if (input.kind === "treadmill" && !input.durationMin && !input.distanceKm) {
    throw Errors.validation("Add a duration or a distance for a treadmill session.");
  }
  if (input.kind === "strength" && !input.exercise?.trim()) {
    throw Errors.validation("Name the exercise for a strength session.");
  }
  if (input.kind === "freeform" && !input.exercise?.trim() && !input.durationMin) {
    throw Errors.validation("Add what you did or a duration.");
  }

  const { date } = today();
  const w = await prisma.workout.create({
    data: {
      userId: actor.id,
      playerId: actor.playerId ?? null,
      kind: input.kind,
      day: date,
      durationMin: input.durationMin ?? null,
      distanceKm: input.distanceKm ?? null,
      speedKmh: input.speedKmh ?? null,
      inclineLevel: input.inclineLevel ?? null,
      exercise: input.exercise?.trim() || null,
      sets: input.sets ?? null,
      reps: input.reps ?? null,
      weightKg: input.weightKg ?? null,
      notes: input.notes?.trim() || null,
    },
  });
  await audit({ actorUserId: actor.id, action: "gym.workout.logged", entityType: "Workout", entityId: w.id, newValue: { kind: w.kind } });
  return serializeWorkout(w);
}

/** Delete one of your OWN workouts (the only mutation allowed after logging). */
export async function deleteWorkout(actor: AuthUser, id: string) {
  const w = await prisma.workout.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!w || w.userId !== actor.id) throw Errors.notFound("Workout");
  await prisma.workout.delete({ where: { id } });
  await audit({ actorUserId: actor.id, action: "gym.workout.deleted", entityType: "Workout", entityId: id });
}

/** The signed-in user's recent workouts (newest first). */
export async function listMyWorkouts(actor: AuthUser, p: Pagination) {
  const where: Prisma.WorkoutWhereInput = { userId: actor.id };
  const [rows, total] = await Promise.all([
    prisma.workout.findMany({ where, orderBy: [{ day: "desc" }, { createdAt: "desc" }], ...skipTake(p) }),
    prisma.workout.count({ where }),
  ]);
  return { items: rows.map(serializeWorkout), total };
}

/** The signed-in user's consistency summary: streaks, this-week vs goal, calendar, badges. */
export async function getMyGymSummary(actor: AuthUser) {
  const [workouts, user] = await Promise.all([
    prisma.workout.findMany({ where: { userId: actor.id }, select: { day: true, distanceKm: true, inclineLevel: true } }),
    prisma.user.findUnique({ where: { id: actor.id }, select: { gymOptIn: true, gymWeeklyGoal: true } }),
  ]);
  const stats = computeGymStats(workouts.map((w) => dayKey(w.day)), today().key);
  const totalDistanceKm = Math.round(workouts.reduce((s, w) => s + (w.distanceKm ?? 0), 0) * 10) / 10;
  const hasIncline = workouts.some((w) => (w.inclineLevel ?? 0) > 0);
  const badges = computeBadges({ totalDays: stats.totalDays, longestStreak: stats.longestStreak, totalDistanceKm, hasIncline });
  return {
    stats,
    badges,
    totalWorkouts: workouts.length,
    totalDistanceKm,
    weeklyGoal: user?.gymWeeklyGoal ?? null,
    optIn: user?.gymOptIn ?? false,
  };
}

/** Global consistency-first leaderboard (opted-in users who've logged at least once). */
export async function getGymLeaderboard(actor: AuthUser, p: Pagination) {
  const users = await prisma.user.findMany({
    where: { gymOptIn: true, deletedAt: null, workouts: { some: {} } },
    select: {
      id: true,
      name: true,
      player: { select: { id: true, displayName: true, photoUrl: true } },
      workouts: { select: { day: true } },
    },
  });
  const key = today().key;
  const ranked = users
    .map((u) => {
      const stats = computeGymStats(u.workouts.map((w) => dayKey(w.day)), key);
      return {
        userId: u.id,
        playerId: u.player?.id ?? null,
        name: u.player?.displayName ?? firstName(u.name),
        photoUrl: u.player?.photoUrl ?? null,
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        sessionsThisWeek: stats.sessionsThisWeek,
        sessionsLast30: stats.sessionsLast30,
        totalDays: stats.totalDays,
        consistencyScore: stats.consistencyScore,
        isMe: u.id === actor.id,
      };
    })
    .sort(compareConsistency);

  // Competition ranking: equal consistency scores share a rank.
  let lastScore: number | null = null;
  let lastRank = 0;
  const withRank = ranked.map((r, i) => {
    const rank = r.consistencyScore === lastScore ? lastRank : i + 1;
    lastScore = r.consistencyScore;
    lastRank = rank;
    return { ...r, rank };
  });

  const total = withRank.length;
  const start = (p.page - 1) * p.pageSize;
  return { items: withRank.slice(start, start + p.pageSize), total };
}

/** Update the user's gym settings: opt-in to the leaderboard and/or weekly goal. */
export async function updateGymSettings(actor: AuthUser, input: { optIn?: boolean; weeklyGoal?: number | null }) {
  const data: Prisma.UserUpdateInput = {};
  if (input.optIn !== undefined) data.gymOptIn = input.optIn;
  if (input.weeklyGoal !== undefined) data.gymWeeklyGoal = input.weeklyGoal;
  await prisma.user.update({ where: { id: actor.id }, data });
  return { ok: true };
}
