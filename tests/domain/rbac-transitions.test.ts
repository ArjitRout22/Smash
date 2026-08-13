import { describe, it, expect } from "vitest";
import {
  TOURNAMENT_TRANSITIONS,
  MATCH_TRANSITIONS,
} from "@/lib/domain/constants";
import { permissionsForRole, roleHasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  DEFAULT_POINTS_CONFIG,
  pointsForMatch,
  sumAwards,
} from "@/lib/engines/points";

describe("state machines", () => {
  it("allows valid tournament transitions and blocks invalid ones", () => {
    expect(TOURNAMENT_TRANSITIONS.upcoming).toContain("ongoing");
    expect(TOURNAMENT_TRANSITIONS.ongoing).toContain("completed");
    expect(TOURNAMENT_TRANSITIONS.completed).toHaveLength(0); // terminal
    expect(TOURNAMENT_TRANSITIONS.upcoming).not.toContain("completed");
  });

  it("permits re-opening a completed match for score correction", () => {
    expect(MATCH_TRANSITIONS.completed).toContain("in_progress");
    expect(MATCH_TRANSITIONS.scheduled).toContain("completed");
  });
});

describe("RBAC permission mapping", () => {
  it("ADMIN has all permissions incl user management", () => {
    expect(roleHasPermission("ADMIN", PERMISSIONS.USER_MANAGE)).toBe(true);
    expect(roleHasPermission("ADMIN", PERMISSIONS.SCORE_EDIT)).toBe(true);
  });

  it("ORGANIZER can score but cannot manage users or delete tournaments", () => {
    expect(roleHasPermission("ORGANIZER", PERMISSIONS.SCORE_EDIT)).toBe(true);
    expect(roleHasPermission("ORGANIZER", PERMISSIONS.USER_MANAGE)).toBe(false);
    expect(roleHasPermission("ORGANIZER", PERMISSIONS.TOURNAMENT_DELETE)).toBe(false);
  });

  it("PLAYER is read-only (cannot create tournaments or edit scores)", () => {
    expect(roleHasPermission("PLAYER", PERMISSIONS.TOURNAMENT_CREATE)).toBe(false);
    expect(roleHasPermission("PLAYER", PERMISSIONS.SCORE_EDIT)).toBe(false);
    expect(roleHasPermission("PLAYER", PERMISSIONS.LEADERBOARD_VIEW)).toBe(true);
  });

  it("unknown roles get no permissions", () => {
    expect(permissionsForRole("GHOST")).toHaveLength(0);
  });
});

describe("points scenario (spec example: run to a final)", () => {
  it("a champion who wins group + QF + SF + final accrues the expected points", () => {
    // 2 group wins + QF win + SF win + Final win
    let total = 0;
    total += sumAwards(pointsForMatch({ config: DEFAULT_POINTS_CONFIG, isWinner: true })); // group win
    total += sumAwards(pointsForMatch({ config: DEFAULT_POINTS_CONFIG, isWinner: true })); // group win
    total += sumAwards(pointsForMatch({ config: DEFAULT_POINTS_CONFIG, isWinner: true, stageType: "quarterfinal" }));
    total += sumAwards(pointsForMatch({ config: DEFAULT_POINTS_CONFIG, isWinner: true, stageType: "semifinal" }));
    total += sumAwards(pointsForMatch({ config: DEFAULT_POINTS_CONFIG, isWinner: true, stageType: "final" }));
    // 10 + 10 + (10+20) + (10+30) + (10+50) = 150
    expect(total).toBe(150);
  });
});
