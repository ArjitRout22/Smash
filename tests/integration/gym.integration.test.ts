import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { permissionsForRole } from "@/lib/auth/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { logWorkout, deleteWorkout, getMyGymSummary, getGymLeaderboard, updateGymSettings } from "@/lib/services/gym.service";

const enabled = process.env.RUN_DB_TESTS === "1";
const d = enabled ? describe : describe.skip;

d("gym logging + consistency leaderboard (integration)", () => {
  let actor: AuthUser;

  beforeAll(async () => {
    const role = await prisma.role.upsert({ where: { name: "ADMIN" }, update: {}, create: { name: "ADMIN", description: "admin" } });
    const player = await prisma.player.create({ data: { fullName: "Gym Rat", displayName: "GymRat" } });
    const user = await prisma.user.create({ data: { email: `gym-${Date.now()}@smash.test`, name: "Gym Rat", roleId: role.id, playerId: player.id } });
    actor = {
      id: user.id, email: user.email, emailVerified: true, phone: user.phone, name: user.name,
      role: "ADMIN", organizationId: null, playerId: player.id, permissions: permissionsForRole("ADMIN"),
    };
  });

  it("logs a workout and reflects it in the summary (streak + distance)", async () => {
    await logWorkout(actor, { kind: "treadmill", durationMin: 30, distanceKm: 5, speedKmh: 10, inclineLevel: 3 });
    const summary = await getMyGymSummary(actor);
    expect(summary.totalWorkouts).toBe(1);
    expect(summary.stats.currentStreak).toBe(1);
    expect(summary.totalDistanceKm).toBe(5);
    expect(summary.badges.map((b) => b.key)).toContain("first");
    expect(summary.badges.map((b) => b.key)).toContain("incline");
  });

  it("validates per kind", async () => {
    await expect(logWorkout(actor, { kind: "strength" })).rejects.toThrow(/exercise/i);
    await expect(logWorkout(actor, { kind: "treadmill" })).rejects.toThrow(/duration or a distance/i);
  });

  it("appears on the leaderboard only after opting in, ranked by consistency", async () => {
    const before = await getGymLeaderboard(actor, { page: 1, pageSize: 50, sortDir: "desc" });
    expect(before.items.find((r) => r.userId === actor.id)).toBeUndefined();

    await updateGymSettings(actor, { optIn: true, weeklyGoal: 4 });
    const after = await getGymLeaderboard(actor, { page: 1, pageSize: 50, sortDir: "desc" });
    const me = after.items.find((r) => r.userId === actor.id);
    expect(me).toBeTruthy();
    expect(me!.rank).toBeGreaterThanOrEqual(1);
    expect(me!.currentStreak).toBe(1);

    const summary = await getMyGymSummary(actor);
    expect(summary.optIn).toBe(true);
    expect(summary.weeklyGoal).toBe(4);
  });

  it("deletes only your own workout", async () => {
    const w = await logWorkout(actor, { kind: "freeform", exercise: "Yoga", durationMin: 45 });
    // Another user can't delete it.
    const other = { ...actor, id: "00000000-0000-0000-0000-000000000000" };
    await expect(deleteWorkout(other, w.id)).rejects.toThrow(/not found/i);
    await deleteWorkout(actor, w.id);
    const list = await prisma.workout.findMany({ where: { userId: actor.id } });
    expect(list.find((x) => x.id === w.id)).toBeUndefined();
  });
});
