import type { RoleName } from "@/lib/domain/constants";

/**
 * Permission catalog. Keys are stable strings ("resource.action") stored in the
 * Permission table. Backend routes check these — never rely on hidden UI.
 */
export const PERMISSIONS = {
  USER_MANAGE: "user.manage",

  TOURNAMENT_VIEW: "tournament.view",
  TOURNAMENT_CREATE: "tournament.create",
  TOURNAMENT_EDIT: "tournament.edit",
  TOURNAMENT_DELETE: "tournament.delete",

  PLAYER_VIEW: "player.view",
  PLAYER_MANAGE: "player.manage",

  TEAM_VIEW: "team.view",
  TEAM_MANAGE: "team.manage",

  STAGE_VIEW: "stage.view",
  STAGE_MANAGE: "stage.manage",

  MATCH_VIEW: "match.view",
  MATCH_MANAGE: "match.manage",

  SCORE_EDIT: "score.edit",

  LEADERBOARD_VIEW: "leaderboard.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

/**
 * Default role → permission mapping for the three built-in roles.
 * Also used to seed the RolePermission table. New roles can be added later
 * (DB-backed) without changing this file.
 */
export const ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
  ADMIN: ALL_PERMISSIONS,
  ORGANIZER: [
    PERMISSIONS.TOURNAMENT_VIEW,
    PERMISSIONS.TOURNAMENT_CREATE,
    PERMISSIONS.TOURNAMENT_EDIT,
    PERMISSIONS.PLAYER_VIEW,
    PERMISSIONS.PLAYER_MANAGE,
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.TEAM_MANAGE,
    PERMISSIONS.STAGE_VIEW,
    PERMISSIONS.STAGE_MANAGE,
    PERMISSIONS.MATCH_VIEW,
    PERMISSIONS.MATCH_MANAGE,
    PERMISSIONS.SCORE_EDIT,
    PERMISSIONS.LEADERBOARD_VIEW,
  ],
  PLAYER: [
    PERMISSIONS.TOURNAMENT_VIEW,
    PERMISSIONS.PLAYER_VIEW,
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.STAGE_VIEW,
    PERMISSIONS.MATCH_VIEW,
    PERMISSIONS.LEADERBOARD_VIEW,
  ],
};

export function permissionsForRole(role: string): PermissionKey[] {
  return ROLE_PERMISSIONS[role as RoleName] ?? [];
}

export function roleHasPermission(role: string, permission: PermissionKey): boolean {
  return permissionsForRole(role).includes(permission);
}
